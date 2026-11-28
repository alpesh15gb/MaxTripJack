import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock


spec = importlib.util.spec_from_file_location("deploy_booking_main", Path(__file__).parents[1] / "vps-deploy-booking-main.py")
rollout = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rollout)


class BookingMainTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.update = Mock(directory=Path(temporary.name), quiesced=False, migration_attempted=False)
        self.events = []
        self.configurations = {}
        self.dump_contents = b"synthetic-archive"
        postgres = {
            "Id": "existing-postgres",
            "Name": "/" + rollout.POSTGRES,
            "State": {"Running": True},
            "Config": {"Labels": {"com.docker.compose.project": rollout.PROJECT, "com.docker.compose.service": "postgres"},
                       "Env": ["POSTGRES_DB=maxtravel", "POSTGRES_USER=maxtravel", "POSTGRES_PASSWORD=synthetic-owner"]},
            "NetworkSettings": {"Networks": {"booking": {"Aliases": ["postgres"]}}},
        }
        prior = {"Name": "/" + rollout.APP, "Image": "old-image",
                 "Config": {"Labels": {"com.docker.compose.service": "app"}}}
        worker = {"Name": "/" + rollout.PROJECT + "-booking-worker-1", "Image": "old-image",
                  "Config": {"Labels": {"com.docker.compose.service": "booking-worker"}}}
        environment = {"DATABASE_URL": "postgresql://maxtravel_app:synthetic-runtime@postgres/maxtravel",
                       "BETTER_AUTH_URL": "https://maxtravel.in", "PAYMENT_PROVIDER": "RAZORPAY"}
        self.update.snapshot.return_value = {
            "app": rollout.APP, "env": environment, "services": ["app", "booking-worker"],
            "before": "before.json", "containers": [prior, worker],
            "config": {"services": {name: {"environment": dict(environment)} for name in ["app", "booking-worker"]}},
        }

        def inspect(kind, name):
            if kind == "image":
                return {"Id": "new-image"}
            if name == rollout.POSTGRES:
                return postgres
            return {"State": {"Running": True}, "Image": "new-image"}

        def run(args, **kwargs):
            self.events.append(tuple(args))
            if args[:2] == ["docker", "port"]:
                return "127.0.0.1:3108\n"
            if "--help" in args:
                return " --wait --wait-timeout"
            if args[0] == "curl":
                return '{"status":"ready"}'
            if "pg_dump" in args:
                kwargs["output_file"].write(self.dump_contents)
            return ""

        def write_compose(name, config):
            self.configurations[name] = config
            return self.update.directory / name

        self.update.inspect.side_effect = inspect
        self.update.run.side_effect = run
        self.update.write_compose.side_effect = write_compose
        self.update.compose.side_effect = lambda stack, file, *args: ["docker", "compose", "-f", str(file), *args]
        self.update.once.side_effect = lambda stack, file, args: self.events.append(("once", *args))
        self.update.health.side_effect = lambda stack: self.events.append(("healthy",))

    def deploy(self, apply):
        with contextlib.redirect_stdout(io.StringIO()):
            rollout.deploy(self.update, "a" * 40, apply)

    def test_inspection_leaves_services_running(self):
        self.deploy(False)
        self.assertTrue(any("psql" in command for command in self.events))
        self.assertFalse(any("build" in command or "stop" in command for command in self.events))
        self.update.once.assert_not_called()
        self.assertFalse(self.update.migration_attempted)

    def test_backup_precedes_migration_and_app_health_precedes_worker_restart(self):
        self.deploy(True)
        restore = next(i for i, command in enumerate(self.events) if "pg_restore" in command)
        migration = self.events.index(("once", "scripts/migrate.mjs"))
        worker = next(i for i, command in enumerate(self.events) if "--wait-timeout" in command)
        self.assertLess(restore, migration)
        self.assertLess(migration, self.events.index(("healthy",)))
        self.assertLess(self.events.index(("healthy",)), worker)
        runtime = self.configurations[rollout.PROJECT + "-after.json"]["services"]["app"]["environment"]
        migration_environment = self.configurations["booking-migration-only.private.json"]["services"]["app"]["environment"]
        self.assertEqual(runtime["PAYMENT_PROVIDER"], "RAZORPAY")
        self.assertNotIn("MIGRATION_DATABASE_URL", runtime)
        self.assertIn("synthetic-owner", migration_environment["MIGRATION_DATABASE_URL"])
        self.assertTrue(self.update.completed)

    def test_empty_backup_stops_before_migration(self):
        self.dump_contents = b""
        with self.assertRaisesRegex(rollout.tools.StopUpdate, "backup was empty"):
            self.deploy(True)
        self.assertTrue(self.update.quiesced)
        self.assertFalse(self.update.migration_attempted)
        self.assertNotIn(("once", "scripts/migrate.mjs"), self.events)

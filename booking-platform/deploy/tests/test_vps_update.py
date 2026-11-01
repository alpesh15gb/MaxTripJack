import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("vps_update", Path(__file__).parents[1] / "vps-update.py")
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)


class SafetyTests(unittest.TestCase):
    def fixture(self):
        config = {"name": "max-travel-crm", "services": {"app": {
            "build": {"context": "/old/source"}, "image": "mutable:tag", "env_file": ["/old/.env"],
            "environment": {"JWT_SECRET": "outdated-value", "SMTP_PASSWORD": "outdated-value"},
            "volumes": [{"type": "volume", "source": "agency", "target": "/data"}],
            "ports": [{"host_ip": "127.0.0.1", "published": "3107", "target": 3000}],
            "networks": {"default": None, "messaging": None},
        }}, "volumes": {"agency": {"name": "max-travel-crm_agency-data"}}}
        container = {"Image": "sha256:original-image", "Config": {
            "Labels": {"com.docker.compose.service": "app"},
            "Env": ["JWT_SECRET=current-private-auth", "SMTP_PASSWORD=current-private-mail", "NODE_VERSION=22.1", "CUSTOM_PRIVATE=keep-me"],
        }, "Mounts": [{"Type": "volume", "Name": "max-travel-crm_agency-data", "Destination": "/data"}]}
        defaults = {container["Image"]: ["NODE_VERSION=22.1"]}
        return config, container, defaults

    def test_freeze_retains_current_secrets_volume_ports_and_networks_without_old_build(self):
        config, container, defaults = self.fixture()
        original = copy.deepcopy(config)
        frozen = update.freeze_config(config, [container], defaults)
        app = frozen["services"]["app"]
        self.assertEqual(app["image"], container["Image"])
        self.assertEqual(app["environment"], {"JWT_SECRET": "current-private-auth", "SMTP_PASSWORD": "current-private-mail", "CUSTOM_PRIVATE": "keep-me"})
        self.assertNotIn("env_file", app)
        self.assertNotIn("build", app)
        self.assertEqual(app["ports"], original["services"]["app"]["ports"])
        self.assertEqual(app["networks"], original["services"]["app"]["networks"])
        self.assertEqual(config, original)

    def test_freeze_refuses_a_new_empty_database_volume(self):
        config, container, defaults = self.fixture()
        config["volumes"]["agency"]["name"] = "different-empty-volume"
        with self.assertRaises(update.StopUpdate):
            update.freeze_config(config, [container], defaults)

    def test_freeze_refuses_a_missing_private_upload_mount(self):
        config, container, defaults = self.fixture()
        container["Mounts"].append({"Type": "bind", "Source": "/private/documents", "Destination": "/uploads"})
        with self.assertRaises(update.StopUpdate):
            update.freeze_config(config, [container], defaults)

    def test_freeze_refuses_ambiguous_service_replicas(self):
        config, container, defaults = self.fixture()
        with self.assertRaises(update.StopUpdate):
            update.freeze_config(config, [container, copy.deepcopy(container)], defaults)

    def test_integration_summary_compares_secrets_without_returning_them(self):
        event, command = "private-event-key", "private-command-key"
        booking = {"CRM_EVENTS_URL": "https://crm.maxtravel.in/api/integrations/booking-platform/events", "CRM_KEY_ID": "events", "CRM_SIGNING_KEY": event, "CRM_COMMAND_KEYS": json.dumps({"commands": command}), "CRM_STAFF_ACTORS": "{\"staff\":{}}"}
        crm = {"BOOKING_PLATFORM_SIGNING_KEYS": json.dumps({"events": event}), "BOOKING_PLATFORM_COMMAND_KEY_ID": "commands", "BOOKING_PLATFORM_COMMAND_KEY": command,
               "BOOKING_PLATFORM_API_URL": "https://maxtravel.in/api/integrations/crm/commands", "BOOKING_PLATFORM_OWNER_ID": "owner", "BOOKING_PLATFORM_BRANCH_ID": "branch"}
        summary = update.integration_summary(booking, crm)
        self.assertTrue(all(summary.values()))
        self.assertNotIn("private", json.dumps(summary))
        crm["BOOKING_PLATFORM_SIGNING_KEYS"] = "bad json"
        self.assertFalse(update.integration_summary(booking, crm)["eventSigningKeyMatches"])

    def test_untrusted_origin_credentials_queries_and_other_domains_are_rejected(self):
        for origin in ("http://maxtravel.in", "https://maxtravel.in.evil.test", "https://user:secret@maxtravel.in", "https://maxtravel.in?key=secret", "https://maxtravel.in/#private"):
            self.assertFalse(update.expected_url(origin, "maxtravel.in", ""))
        self.assertTrue(update.expected_url("https://maxtravel.in/", "maxtravel.in", ""))

    def test_migration_owner_connection_requires_the_existing_project_database_host(self):
        pg = {"Name": "/max-travel-booking-postgres-1", "Config": {"Env": ["POSTGRES_USER=owner", "POSTGRES_PASSWORD=private:p@ss", "POSTGRES_DB=maxtravel"]},
              "NetworkSettings": {"Networks": {"default": {"Aliases": ["postgres"], "IPAddress": "172.20.0.2"}}}}
        result = update.owner_migration_url({"DATABASE_URL": "postgresql://app:old@postgres:5432/maxtravel?sslmode=disable"}, pg)
        self.assertEqual(result, "postgresql://owner:private%3Ap%40ss@postgres:5432/maxtravel?sslmode=disable")
        for url in ("postgresql://app:old@unrelated-db/maxtravel", "postgresql://app:old@postgres/another-database"):
            with self.assertRaises(update.StopUpdate):
                update.owner_migration_url({"DATABASE_URL": url}, pg)

    def recovery_fixture(self, migration_attempted):
        state = update.Update.__new__(update.Update)
        state.quiesced, state.completed, state.migration_attempted = True, False, migration_attempted
        state.stacks = [{"project": "max-travel-booking", "working": "/old", "before": Path("/private/before.json"), "services": ["app"]},
                        {"project": "max-travel-crm", "working": "/old-crm", "before": Path("/private/crm-before.json"), "services": ["app", "worker"]}]
        calls = []
        state.run = lambda args: calls.append(args)
        return state, calls

    def test_failure_before_migrations_resumes_only_previously_running_services(self):
        state, calls = self.recovery_fixture(False)
        with contextlib.redirect_stderr(io.StringIO()):
            state.recover()
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][-1], "app")
        self.assertEqual(calls[1][-2:], ["app", "worker"])
        for call in calls:
            self.assertIn("--no-deps", call)
            self.assertIn("--no-build", call)
            self.assertNotIn("postgres", call)
            self.assertNotIn("booking-worker", call)

    def test_failure_after_migration_attempt_never_restarts_old_images_or_restores_database(self):
        state, calls = self.recovery_fixture(True)
        with contextlib.redirect_stderr(io.StringIO()):
            state.recover()
        self.assertEqual(calls, [])

    def test_backup_digest_is_streamed_and_deterministic(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "snapshot.dump"
            path.write_bytes(b"complete-backup")
            self.assertEqual(update.file_sha256(path), update.hashlib.sha256(b"complete-backup").hexdigest())

    def test_private_checkout_stays_private_while_image_source_becomes_readable(self):
        with tempfile.TemporaryDirectory() as directory:
            private = Path(directory)
            os.chmod(private, 0o700)
            source = private / "source"
            (source / "public").mkdir(parents=True)
            asset, executable = source / "public" / "logo.jpg", source / "run.sh"
            asset.write_bytes(b"public-logo")
            executable.write_text("#!/bin/sh\n")
            os.chmod(asset, 0o600)
            update.readable_build_source(source, "100644 object 0\tpublic/logo.jpg\0" + "100755 object 0\trun.sh\0")
            self.assertEqual(asset.read_bytes(), b"public-logo")
            if os.name == "posix":
                self.assertEqual(private.stat().st_mode & 0o777, 0o700)
                self.assertEqual(asset.stat().st_mode & 0o777, 0o644)
                self.assertEqual(executable.stat().st_mode & 0o777, 0o755)
            with self.assertRaises(update.StopUpdate):
                update.readable_build_source(source, "100644 object 0\t../outside\0")

    def test_persistence_guard_rejects_image_storage_traversal_and_read_only_mounts(self):
        mounts = [{"Type": "volume", "Destination": "/data", "RW": True}]
        self.assertTrue(update.persistent_path("/data/app.db", mounts))
        self.assertTrue(update.persistent_path("/data/uploads/private.pdf", mounts))
        for path in ("/database/app.db", "/app/private.db", "relative.db", "/data/../app/app.db"):
            self.assertFalse(update.persistent_path(path, mounts))
        self.assertFalse(update.persistent_path("/data/app.db", [{"Type": "volume", "Destination": "/data", "RW": False}]))

    def exercise_rollout(self, directory, fail_migration=False):
        state = update.Update.__new__(update.Update)
        state.directory = Path(directory)
        state.stacks, state.quiesced, state.migration_attempted, state.completed = [], False, False, False
        events, commands = [], []
        envs = {"max-travel-booking": {"BETTER_AUTH_URL": "https://maxtravel.in", "DATABASE_URL": "postgresql://app:private@postgres/maxtravel"},
                "max-travel-crm": {"APP_ORIGIN": "https://crm.maxtravel.in", "DATABASE_URL": "file:/data/app.db", "UPLOAD_ROOT": "/data/uploads"}}

        def snapshot(app, project):
            services = ["app", "worker"] if project.endswith("crm") else ["app"]
            containers = [{"Name": "/" + (app if service == "app" else "max-travel-crm-worker-1"), "Image": "old-image",
                           "Config": {"Labels": {"com.docker.compose.service": service}},
                           "Mounts": [{"Type": "volume", "Destination": "/data", "RW": True}]} for service in services]
            s = {"app": app, "project": project, "working": "/existing", "env": envs[project], "services": services,
                 "config": {"services": {service: {"image": "old-image", "environment": {}} for service in services}},
                 "containers": containers, "before": state.directory / (project + "-before.json")}
            state.stacks.append(s)
            return s

        def build(s, repository, ref, subdirectory=""):
            events.append("build:" + s["project"])
            s.update(image="candidate-" + s["project"], sha=ref, after_config=copy.deepcopy(s["config"]))
            s["after"] = state.write(s["project"] + "-after.json", s["after_config"])

        def inspect(kind, name):
            if name == "max-travel-booking-postgres-1":
                return {"Name": "/" + name, "Config": {"Labels": {"com.docker.compose.project": "max-travel-booking", "com.docker.compose.service": "postgres"},
                        "Env": ["POSTGRES_USER=owner", "POSTGRES_PASSWORD=private", "POSTGRES_DB=maxtravel"]},
                        "NetworkSettings": {"Networks": {"default": {"Aliases": ["postgres"]}}}}
            if kind == "image":
                return {"Id": name}
            project = "max-travel-crm" if "crm" in name else "max-travel-booking"
            return {"State": {"Running": True}, "Image": "candidate-" + project}

        def run(args, **kwargs):
            commands.append(args)
            if "stop" in args:
                events.append("stop")
            if "pg_dump" in args:
                events.append("postgres-backup")
                kwargs["output_file"].write(b"synthetic-complete-archive")
            if "pg_restore" in args:
                events.append("postgres-backup-verified")
            return "{\"jobs\":[],\"queues\":{\"crm_pending\":0}}"

        def once(s, file, command, *options):
            if command[0] == "scripts/backup.mjs":
                events.append("crm-backup")
                folder = state.directory / "crm-backups" / "backup-synthetic"
                folder.mkdir()
                (folder / "manifest.json").write_text("{}")
            if command[0] == "scripts/restore.mjs":
                events.append("crm-restore-verified")
            if command[0] == "scripts/migrate.mjs":
                events.append("migration")
                self.assertTrue(state.migration_attempted)
                if fail_migration:
                    raise update.StopUpdate("synthetic migration failure")
            return "candidate-check-ok"

        state.snapshot, state.checkout_build, state.inspect = snapshot, build, inspect
        state.run, state.once, state.health = run, once, lambda s: events.append("health:" + s["project"])
        with contextlib.redirect_stdout(io.StringIO()), patch.object(update.time, "sleep"):
            if fail_migration:
                with self.assertRaises(update.StopUpdate):
                    state.execute(True)
                with contextlib.redirect_stderr(io.StringIO()):
                    state.recover()
            else:
                state.execute(True)
        return state, events, commands

    def test_full_orchestration_builds_before_stop_verifies_backups_before_migration_and_preserves_inactive_workers(self):
        with tempfile.TemporaryDirectory() as directory:
            state, events, commands = self.exercise_rollout(directory)
            self.assertTrue(state.completed)
            self.assertLess(events.index("build:max-travel-crm"), events.index("stop"))
            self.assertLess(events.index("postgres-backup-verified"), events.index("migration"))
            self.assertLess(events.index("crm-restore-verified"), events.index("migration"))
            ups = [c for c in commands if "up" in c]
            self.assertEqual(len(ups), 3)  # Both apps and the one pre-existing CRM worker.
            self.assertTrue(all("--no-deps" in c and "--no-build" in c for c in ups))
            self.assertFalse(any("booking-worker" in c or "payment-worker" in c or "crm-worker" in c for c in ups))

    def test_orchestration_migration_failure_does_not_start_services_or_automatically_restore_a_database(self):
        with tempfile.TemporaryDirectory() as directory:
            state, events, commands = self.exercise_rollout(directory, fail_migration=True)
            self.assertFalse(state.completed)
            self.assertTrue(state.migration_attempted)
            self.assertFalse(any("up" in c for c in commands))
            self.assertTrue(all("--list" in c for c in commands if "pg_restore" in c))


if __name__ == "__main__":
    unittest.main()

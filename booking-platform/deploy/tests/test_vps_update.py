import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
import uuid
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("vps_update", Path(__file__).parents[1] / "vps-update.py")
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)


class SafetyTests(unittest.TestCase):
    def test_missing_live_named_volume_is_pinned_external_without_changing_source_model(self):
        config, app, defaults = self.fixture()
        del config["services"]["app"]["volumes"]
        original = copy.deepcopy(config)
        notes = []
        frozen = update.freeze_config(config, [app], defaults, notes.append)
        mount = frozen["services"]["app"]["volumes"][0]
        self.assertEqual(mount["target"], "/data")
        self.assertFalse(mount["read_only"])
        self.assertEqual(frozen["volumes"][mount["source"]], {"external": True, "name": "max-travel-crm_agency-data"})
        self.assertEqual(notes, [{"service": "app", "type": "volume", "target": "/data"}])
        self.assertEqual(config, original)

    def test_missing_live_bind_mount_keeps_existing_source_and_disallows_empty_directory_creation(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "certificate.pem"
            source.write_text("synthetic-public-certificate")
            config, app, defaults = self.fixture()
            app["Mounts"].append({"Type": "bind", "Source": str(source), "Destination": "/run/certificate.pem", "RW": False, "Propagation": "rprivate"})
            frozen = update.freeze_config(config, [app], defaults)
            retained = next(v for v in frozen["services"]["app"]["volumes"] if v["target"] == "/run/certificate.pem")
            self.assertEqual(retained["source"], str(source))
            self.assertTrue(retained["read_only"])
            self.assertEqual(retained["bind"], {"create_host_path": False, "propagation": "rprivate"})
            self.assertEqual(source.read_text(), "synthetic-public-certificate")

    def test_retained_volume_requires_an_existing_identity_and_explicit_access_mismatches_fail(self):
        config, app, defaults = self.fixture()
        config["services"]["app"]["volumes"] = None
        app["Mounts"][0]["Name"] = ""
        with self.assertRaises(update.StopUpdate):
            update.freeze_config(config, [app], defaults)
        config, app, defaults = self.fixture()
        app["Mounts"][0]["RW"] = False
        with self.assertRaises(update.StopUpdate):
            update.freeze_config(config, [app], defaults)

    @unittest.skipUnless(shutil.which("docker"), "Docker engine and Compose CLI required for retained-data proof")
    def test_recreated_container_uses_the_same_retained_volume_and_keeps_its_data(self):
        identity = "maxtravelmountproof" + uuid.uuid4().hex[:16]
        volume, image = identity + "-data", "python:3.10-alpine"
        def call(args):
            return subprocess.run(args, check=True, capture_output=True, text=True, timeout=120)
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "retained.json"
            compose = ["docker", "compose", "-p", identity, "-f", str(file)]
            created = False
            try:
                call(["docker", "volume", "create", volume])
                created = True
                call(["docker", "run", "--rm", "--network", "none", "--mount", "type=volume,source=" + volume + ",target=/data", image,
                      "python", "-c", "from pathlib import Path; Path('/data/proof').write_text('retained-original')"])
                image_id = call(["docker", "image", "inspect", image, "--format", "{{.Id}}"]).stdout.strip()
                model = {"services": {"app": {"image": image, "network_mode": "none", "read_only": True}}}
                live = {"Image": image_id, "Config": {"Labels": {"com.docker.compose.service": "app"}, "Env": []},
                        "Mounts": [{"Type": "volume", "Name": volume, "Destination": "/data", "RW": True}]}
                frozen = update.freeze_config(model, [live], {image_id: []})
                file.write_text(json.dumps(update.literal_compose(frozen)))
                proof = call(compose + ["run", "--rm", "--no-deps", "-T", "--pull", "never", "--entrypoint", "python", "app", "-c",
                         "from pathlib import Path; p=Path('/data/proof'); assert p.read_text()=='retained-original'; p.write_text('retained-verified'); print('retained-data-ok')"])
                self.assertIn("retained-data-ok", proof.stdout)
                call(["docker", "run", "--rm", "--network", "none", "--mount", "type=volume,source=" + volume + ",target=/data", image,
                      "python", "-c", "from pathlib import Path; assert Path('/data/proof').read_text()=='retained-verified'"])
            finally:
                if file.exists():
                    subprocess.run(compose + ["down", "--remove-orphans"], capture_output=True, timeout=60)
                if created:
                    removed = subprocess.run(["docker", "volume", "rm", volume], capture_output=True, timeout=60)
                    self.assertEqual(removed.returncode, 0, "Owned retained-data test volume must be removed")

    def test_security_list_repair_preserves_distinct_policies_and_source(self):
        source = {"services": {"maintenance-worker": {"security_opt": ["no-new-privileges:true", "apparmor=travel", "no-new-privileges:true"],
                   "cap_drop": ["ALL", "ALL"], "cap_add": ["NET_BIND_SERVICE", "NET_BIND_SERVICE"], "read_only": True}}}
        original = copy.deepcopy(source)
        fixed, changes = update.prepare_security_lists(source)
        worker = fixed["services"]["maintenance-worker"]
        self.assertEqual(worker["security_opt"], ["no-new-privileges:true", "apparmor=travel"])
        self.assertEqual(worker["cap_drop"], ["ALL"])
        self.assertEqual(worker["cap_add"], ["NET_BIND_SERVICE"])
        self.assertTrue(worker["read_only"])
        self.assertEqual(len(changes), 3)
        self.assertEqual(source, original)

    def test_security_string_repair_is_limited_to_explicit_no_new_privileges(self):
        for value in ("no-new-privileges:true", "no-new-privileges=true"):
            fixed, changes = update.prepare_security_lists({"services": {"app": {"security_opt": value}}})
            self.assertEqual(fixed["services"]["app"]["security_opt"], [value])
            self.assertEqual(changes, ["services.app.security_opt"])
        for value in (None, {"unknown": "private-sensitive-value"}, ["no-new-privileges:true", {}], "private-sensitive-value"):
            with self.assertRaises(update.StopUpdate) as caught:
                update.prepare_security_lists({"services": {"app": {"security_opt": value}}})
            self.assertNotIn("private-sensitive", str(caught.exception))

    def test_compose_validation_summary_omits_raw_values_paths_and_credentials(self):
        raw = "validating /private/config.json: services.maintenance-worker.security_opt items at 0 and 1 are equal\nsecret-value-never-print"
        self.assertEqual(update.compose_validation_summary(raw), {"fields": ["services.maintenance-worker.security_opt"], "rules": ["duplicate list entries"]})
        self.assertNotIn("secret-value", json.dumps(update.compose_validation_summary(raw)))
        self.assertEqual(update.compose_validation_summary("services.app.security_opt must be a array")["rules"], ["must be a array"])

    @unittest.skipUnless(shutil.which("docker"), "Docker Compose CLI required for security-list regression")
    def test_real_compose_rejects_duplicate_security_entries_and_accepts_repaired_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, repaired = root / "original.json", root / "private-copy.json"
            config = {"services": {"maintenance-worker": {"image": "node:24-alpine", "security_opt": ["no-new-privileges:true"] * 2,
                       "cap_drop": ["ALL"] * 2, "read_only": True}}}
            source.write_text(json.dumps(config))
            original = source.read_bytes()
            args = ["docker", "compose", "--project-directory", directory, "-p", "security-repair-regression", "-f"]
            broken = subprocess.run(args + [str(source), "config", "--format", "json"], capture_output=True, text=True, timeout=30)
            self.assertNotEqual(broken.returncode, 0)
            self.assertIn("are equal", broken.stderr)
            fixed, unused = update.prepare_security_lists(config)
            repaired.write_text(json.dumps(fixed))
            valid = subprocess.run(args + [str(repaired), "config", "--format", "json"], capture_output=True, text=True, timeout=30)
            self.assertEqual(valid.returncode, 0)
            worker = json.loads(valid.stdout)["services"]["maintenance-worker"]
            self.assertEqual(worker["security_opt"], ["no-new-privileges:true"])
            self.assertEqual(worker["cap_drop"], ["ALL"])
            self.assertTrue(worker["read_only"])
            self.assertEqual(source.read_bytes(), original)

    @unittest.skipUnless(shutil.which("docker"), "Docker Compose CLI required for full snapshot regression")
    def test_snapshot_repairs_private_input_before_validation_and_keeps_working_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            working, recovery, inputs = root / "working", root / "recovery", root / "inputs"
            for path in (working, recovery, inputs):
                path.mkdir()
            (working / ".env.production").write_text("SMTP_PASSWORD=synthetic-file-value\n")
            file = inputs / "frozen.json"
            file.write_text(json.dumps({"services": {
                "app": {"image": "node:24-alpine", "env_file": [".env.production"], "security_opt": ["no-new-privileges:true"] * 2},
                "maintenance-worker": {"image": "node:24-alpine", "security_opt": ["no-new-privileges:true"] * 2},
                "postgres": {"image": "postgres:17-alpine", "environment": {"POSTGRES_PASSWORD": "${POSTGRES_PASSWORD:?required}"}}
            }}))
            original = file.read_bytes()
            labels = {"com.docker.compose.project": "max-travel-booking", "com.docker.compose.service": "app",
                      "com.docker.compose.project.working_dir": str(working), "com.docker.compose.project.config_files": str(file)}
            app = {"Name": "/max-travel-booking-app-1", "Image": "sha256:" + "1" * 64,
                   "State": {"Running": True, "Health": {"Status": "healthy"}}, "Mounts": [],
                   "Config": {"Labels": labels, "Env": ["SMTP_PASSWORD=synthetic-runtime-value"]}}
            db = {"Name": "/max-travel-booking-postgres-1", "Image": "sha256:" + "2" * 64, "Mounts": [],
                  "Config": {"Labels": {"com.docker.compose.project": "max-travel-booking", "com.docker.compose.service": "postgres"},
                             "Env": ["POSTGRES_PASSWORD=synthetic$database-value"]}}
            state = update.Update.__new__(update.Update)
            state.directory, state.number, state.stacks = recovery, 0, []
            def inspect(kind, identity):
                if kind == "image":
                    return {"Config": {"Env": []}}
                return db if identity == "db-id" else app
            state.inspect = inspect
            real_run = state.run
            calls = []
            def run(args, **kwargs):
                calls.append(args)
                if args[:3] == ["docker", "ps", "-q"]:
                    return "app-id\ndb-id\n"
                return real_run(args, **kwargs)
            state.run = run
            console = io.StringIO()
            with contextlib.redirect_stdout(console):
                stack = state.snapshot("max-travel-booking-app-1", "max-travel-booking")
            self.assertEqual(stack["config"]["services"]["app"]["environment"]["SMTP_PASSWORD"], "synthetic-runtime-value")
            self.assertNotIn("POSTGRES_PASSWORD", stack["config"]["services"]["app"]["environment"])
            self.assertEqual(stack["config"]["services"]["postgres"]["environment"]["POSTGRES_PASSWORD"], "synthetic$database-value")
            self.assertEqual(stack["config"]["services"]["maintenance-worker"]["security_opt"], ["no-new-privileges:true"])
            self.assertEqual(stack["services"], ["app"])
            self.assertEqual(file.read_bytes(), original)
            self.assertNotIn("synthetic-runtime", console.getvalue())
            self.assertTrue(all("up" not in c and "stop" not in c for c in calls))

    @unittest.skipUnless(shutil.which("docker"), "Docker Compose CLI required for deployment-provenance regression")
    def test_snapshot_does_not_merge_older_database_deployment_files_into_current_app(self):
        for include_postgres in (True, False):
            with self.subTest(postgres_managed_by_app_model=include_postgres):
                self.check_older_database_files(include_postgres)

    def check_older_database_files(self, include_postgres):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            current, legacy, recovery = root / "current.json", root / "old-database.yaml", root / "recovery"
            recovery.mkdir()
            current.write_text(json.dumps({"services": {
                "app": {"image": "node:24-alpine", "security_opt": ["no-new-privileges:true"]},
                "refund-worker": {"image": "node:24-alpine", "security_opt": ["no-new-privileges:true"]},
                "postgres": {"image": "postgres:17-alpine", "environment": {"POSTGRES_PASSWORD": "synthetic-current-db"}}
            }}))
            if not include_postgres:
                app_only = json.loads(current.read_text())
                del app_only["services"]["postgres"]
                current.write_text(json.dumps(app_only))
            legacy.write_text('services:\n  refund-worker:\n    image: node:24-alpine\n    security_opt: [no-new-privileges:true, no-new-privileges:true]\n')
            original_current, original_legacy = current.read_bytes(), legacy.read_bytes()
            labels = {"com.docker.compose.project": "max-travel-booking", "com.docker.compose.service": "app",
                      "com.docker.compose.project.working_dir": str(root), "com.docker.compose.project.config_files": str(current)}
            app = {"Name": "/max-travel-booking-app-1", "Image": "sha256:" + "1" * 64, "Mounts": [],
                   "State": {"Running": True, "Health": {"Status": "healthy"}}, "Config": {"Labels": labels, "Env": []}}
            db = {"Name": "/max-travel-booking-postgres-1", "Image": "sha256:" + "2" * 64, "Mounts": [],
                  "Config": {"Env": ["POSTGRES_PASSWORD=synthetic-runtime-db"], "Labels": {
                      "com.docker.compose.project": "max-travel-booking", "com.docker.compose.service": "postgres",
                      "com.docker.compose.project.config_files": str(legacy)}}}
            state = update.Update.__new__(update.Update)
            state.directory, state.number, state.stacks = recovery, 0, []
            state.inspect = lambda kind, identity: {"Config": {"Env": []}} if kind == "image" else db if identity == "db-id" else app
            real_run, calls = state.run, []
            def run(args, **kwargs):
                calls.append(args)
                if args[:3] == ["docker", "ps", "-q"]:
                    return "app-id\ndb-id\n"
                return real_run(args, **kwargs)
            state.run = run
            with contextlib.redirect_stdout(io.StringIO()):
                stack = state.snapshot("max-travel-booking-app-1", "max-travel-booking")
            self.assertEqual(stack["config"]["services"]["refund-worker"]["security_opt"], ["no-new-privileges:true"])
            if include_postgres:
                self.assertEqual(stack["config"]["services"]["postgres"]["environment"]["POSTGRES_PASSWORD"], "synthetic-runtime-db")
            else:
                self.assertNotIn("postgres", stack["config"]["services"])
            self.assertTrue(all(str(legacy) not in call for call in calls))
            self.assertEqual(current.read_bytes(), original_current)
            self.assertEqual(legacy.read_bytes(), original_legacy)

    def test_app_only_model_may_leave_infrastructure_unmanaged_but_never_ignores_a_missing_worker(self):
        config, app, defaults = self.fixture()
        db = {"Image": "sha256:database", "Config": {"Labels": {"com.docker.compose.service": "postgres"}, "Env": ["POSTGRES_PASSWORD=private-db"]}, "Mounts": []}
        frozen = update.freeze_config(config, [app, db], defaults)
        self.assertNotIn("postgres", frozen["services"])
        self.assertNotIn("POSTGRES_PASSWORD", frozen["services"]["app"]["environment"])
        db["Config"]["Labels"]["com.docker.compose.service"] = "booking-worker"
        with self.assertRaises(update.StopUpdate):
            update.freeze_config(config, [app, db], defaults)

    def runtime(self, service, values, project="max-travel-booking", oneoff=False):
        return {"Config": {"Labels": {"com.docker.compose.project": project,
                    "com.docker.compose.service": service, "com.docker.compose.oneoff": str(oneoff)},
                    "Env": [key + "=" + value for key, value in values.items()]}}

    def test_compose_resolves_database_password_from_database_not_the_web_app_or_host(self):
        app = self.runtime("app", {"BETTER_AUTH_SECRET": "synthetic-auth"})
        db = self.runtime("postgres", {"POSTGRES_PASSWORD": "synthetic-database-password"})
        supplied = {"PATH": "host-tools", "POSTGRES_PASSWORD": "unrelated-host-value"}
        result = update.compose_interpolation_environment({"POSTGRES_PASSWORD", "BETTER_AUTH_SECRET"}, [app, db], "max-travel-booking", supplied)
        self.assertEqual(result["POSTGRES_PASSWORD"], "synthetic-database-password")
        self.assertEqual(result["BETTER_AUTH_SECRET"], "synthetic-auth")
        self.assertEqual(supplied["POSTGRES_PASSWORD"], "unrelated-host-value")
        self.assertNotIn("POSTGRES_PASSWORD", update.environment(app["Config"]["Env"]))

    def test_compose_refuses_conflicting_values_without_exposing_either_secret(self):
        containers = [self.runtime("app", {"SHARED_SECRET": "first-private-value"}), self.runtime("worker", {"SHARED_SECRET": "second-private-value"})]
        with self.assertRaises(update.StopUpdate) as caught:
            update.compose_interpolation_environment({"SHARED_SECRET"}, containers, "max-travel-booking", {})
        self.assertIn("SHARED_SECRET", str(caught.exception))
        self.assertNotIn("private-value", str(caught.exception))

    def test_compose_rejects_another_project_and_ignores_oneoff_credentials(self):
        with self.assertRaises(update.StopUpdate):
            update.compose_interpolation_environment({"POSTGRES_PASSWORD"}, [self.runtime("postgres", {"POSTGRES_PASSWORD": "other-secret"}, "unrelated-project")], "max-travel-booking", {})
        containers = [self.runtime("postgres", {"POSTGRES_PASSWORD": "current-private"}), self.runtime("app", {"POSTGRES_PASSWORD": "oneoff-private"}, oneoff=True)]
        result = update.compose_interpolation_environment({"POSTGRES_PASSWORD"}, containers, "max-travel-booking", {})
        self.assertEqual(result["POSTGRES_PASSWORD"], "current-private")

    def test_compose_json_stdout_is_not_polluted_by_cli_warnings(self):
        with tempfile.TemporaryDirectory() as directory:
            state = update.Update.__new__(update.Update)
            state.directory, state.number = Path(directory), 0
            def command(*args, **kwargs):
                kwargs["stdout"].write(b'{"services": {}}\n')
                kwargs["stderr"].write(b'warning: obsolete Compose attribute\n')
                return SimpleNamespace(returncode=0)
            with patch.object(update.subprocess, "run", side_effect=command):
                self.assertEqual(json.loads(state.run(["docker", "compose", "config"])), {"services": {}})
            self.assertIn("warning", (state.directory / "operation-001.stderr.log").read_text())

    @unittest.skipUnless(shutil.which("docker"), "Docker Compose CLI required for real interpolation regression")
    def test_real_compose_required_database_variable_and_literal_secret_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            file, empty = root / "compose.json", root / "empty.env"
            empty.write_text("")
            file.write_text(json.dumps({"services": {
                "app": {"image": "node:22-alpine", "environment": {"BETTER_AUTH_SECRET": "synthetic-auth"}},
                "postgres": {"image": "postgres:17-alpine", "environment": {"POSTGRES_PASSWORD": "${POSTGRES_PASSWORD:?required database variable}"}}
            }}))
            args = ["docker", "compose", "--project-directory", str(root), "--env-file", str(empty), "-p", "maxtravel-updater-regression", "-f", str(file), "config", "--format", "json"]
            absent = dict(os.environ)
            absent.pop("POSTGRES_PASSWORD", None)
            absent.pop("NOT_A_VARIABLE", None)
            broken = subprocess.run(args, cwd=root, env=absent, capture_output=True, text=True, timeout=30)
            self.assertNotEqual(broken.returncode, 0)
            self.assertIn("POSTGRES_PASSWORD", broken.stderr)
            password = "synthetic$literal-${NOT_A_VARIABLE:?never_resolve}-$$"
            containers = [self.runtime("app", {"BETTER_AUTH_SECRET": "synthetic-auth"}), self.runtime("postgres", {"POSTGRES_PASSWORD": password})]
            supplied = update.compose_interpolation_environment({"POSTGRES_PASSWORD"}, containers, "max-travel-booking", absent)
            resolved = subprocess.run(args, cwd=root, env=supplied, capture_output=True, text=True, timeout=30)
            self.assertEqual(resolved.returncode, 0, "Compose must resolve the database-only password")
            config = update.resolved_compose(json.loads(resolved.stdout))
            self.assertEqual(config["services"]["postgres"]["environment"]["POSTGRES_PASSWORD"], password)
            self.assertNotIn("POSTGRES_PASSWORD", config["services"]["app"]["environment"])
            for unused in range(2):
                file.write_text(json.dumps(update.literal_compose(config)))
                roundtrip = subprocess.run(args, cwd=root, env=absent, capture_output=True, text=True, timeout=30)
                self.assertEqual(roundtrip.returncode, 0, "A resolved snapshot must not require its password in the host environment")
                config = update.resolved_compose(json.loads(roundtrip.stdout))
                self.assertEqual(config["services"]["postgres"]["environment"]["POSTGRES_PASSWORD"], password)

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

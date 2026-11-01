import copy
import importlib.util
from pathlib import Path
import unittest
import contextlib
import io
import json

spec = importlib.util.spec_from_file_location("vps_integrate", Path(__file__).parents[1] / "vps-integrate.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class IntegrationSafety(unittest.TestCase):
    def setUp(self):
        self.people = [{"id": "crm-a", "email": "Staff@example.test", "active": True, "mfa": True}]
        self.admins = [{"id": "book-a", "email": "staff@example.test", "permissions": ["bookings:read"]}]

    def test_only_existing_unique_same_email_eligible_identities_are_matched(self):
        self.assertEqual(module.eligible_actors(self.people, self.admins, {}), {"crm-a": "book-a"})
        self.assertEqual(module.eligible_actors([{**self.people[0], "mfa": False}], self.admins, {}), {})
        self.assertEqual(module.eligible_actors([{**self.people[0], "active": False}], self.admins, {}), {})
        self.assertEqual(module.eligible_actors(self.people, [{**self.admins[0], "permissions": []}], {}), {})

    def test_ambiguous_emails_are_not_guessed(self):
        self.assertEqual(module.eligible_actors(self.people + [{**self.people[0], "id": "crm-b"}], self.admins, {}), {})
        self.assertEqual(module.eligible_actors(self.people, self.admins + [{**self.admins[0], "id": "book-b"}], {}), {})

    def test_existing_mapping_cannot_silently_switch_human_identity_or_keep_revoked_access(self):
        with self.assertRaises(module.update.StopUpdate):
            module.eligible_actors(self.people, [{**self.admins[0], "email": "another@example.test"}], {"crm-a": "book-a"})
        with self.assertRaises(module.update.StopUpdate):
            module.eligible_actors(self.people, [], {"crm-a": "book-a"})

    def test_worker_preserves_security_storage_network_and_exact_image(self):
        app = {"image": "sha256:fixture", "user": "10001:10001", "read_only": True,
               "cap_drop": ["ALL"], "security_opt": ["no-new-privileges:true"],
               "environment": {"DATABASE_URL": "private$literal"}, "volumes": [{"type": "volume", "source": "existing", "target": "/data"}],
               "networks": {"private": {}}, "ports": ["127.0.0.1:3108:3000"], "entrypoint": ["node", "server.js"], "profiles": ["old"]}
        before = copy.deepcopy(app)
        result = module.worker_spec(app, "crm-worker", "crm")
        self.assertEqual(app, before)
        for field in ("image", "user", "read_only", "cap_drop", "security_opt", "environment", "volumes", "networks"):
            self.assertEqual(result[field], app[field])
        self.assertNotIn("ports", result)
        self.assertNotIn("profiles", result)
        self.assertEqual(result["entrypoint"], ["node"])
        self.assertEqual(result["command"][-1], "dist/crm-worker.mjs")
        self.assertIn("worker_heartbeats", result["healthcheck"]["test"][-1])
        self.assertIn('"crm"', result["healthcheck"]["test"][-1])

    def test_worker_cannot_claim_the_apps_network_or_proxy_identity(self):
        app = {"image": "sha256:test", "hostname": "booking-web", "networks": {"private": {"aliases": ["booking-web"], "ipv4_address": "172.20.1.3", "priority": 10}}, "labels": {"traefik.enable": "true", "caddy": "maxtravel.in", "security.policy": "restricted"}}
        worker = module.worker_spec(app, "crm-worker", "crm")
        self.assertNotIn("hostname", worker)
        self.assertEqual(worker["networks"], {"private": {"priority": 10}})
        self.assertEqual(worker["labels"], {"security.policy": "restricted"})
        self.assertIn("aliases", app["networks"]["private"])

    def fake_activation(self, queued=0, eligible=True, probe_failure=False):
        job = object.__new__(module.Integration)
        job.directory = Path("/private/synthetic-activation")
        job.completed = False
        job.stacks = []
        calls, saved = [], {}
        event_key = "event-key-" + "a" * 64
        benv = {"CRM_EVENTS_URL": "https://crm.maxtravel.in/api/integrations/booking-platform/events", "CRM_SIGNING_KEY": event_key, "CRM_KEY_ID": "events", "SMTP_HOST": "smtp.example.test", "MAIL_FROM": "mail@example.test"}
        cenv = {"BOOKING_PLATFORM_SIGNING_KEYS": json.dumps({"events": event_key}), "BOOKING_PLATFORM_OWNER_ID": "crm-a", "BOOKING_PLATFORM_BRANCH_ID": "branch-a"}
        def snapshot(name, project):
            env = benv if project == "max-travel-booking" else cenv
            image = "sha256:booking" if project == "max-travel-booking" else "sha256:crm"
            stack = {"project": project, "working": "/synthetic", "app": name, "env": env, "config": {"services": {"app": {"image": image, "read_only": True, "environment": copy.deepcopy(env), "cap_drop": ["ALL"]}}}, "services": ["app"], "containers": [{"Name": "/" + name, "Image": image}], "before": Path("/private/" + project + "-before")}
            if project == "max-travel-crm":
                stack["services"].append("worker")
                stack["config"]["services"]["worker"] = {"image": image, "command": ["node", "whatsapp-worker"], "volumes": [{"source": "original", "target": "/data"}], "environment": {}}
            job.stacks.append(stack)
            return stack
        job.snapshot = snapshot
        def node_json(container, script):
            if script == module.CRM_IDENTITIES:
                return self.people
            if script == module.BOOKING_IDENTITIES:
                return self.admins if eligible else []
            if script == module.QUEUES:
                return {"booking_jobs": queued, "notifications": 0}
            if "platformCommand.count" in script:
                return {"count": 0}
            return {"provider": "PAYGLOCAL", "configured": False}
        job.node_json = node_json
        def run(args, **kwargs):
            calls.append(args)
            if args[-1] == module.QUEUES:
                return json.dumps({"booking_jobs": queued, "notifications": 0})
            if args[-1] == module.CRM_PENDING:
                return json.dumps({"count": 0})
            if args[-1] == module.SIGNED_PROBE and probe_failure:
                raise module.update.StopUpdate("Synthetic signed probe rejection")
            return ""
        job.run = run
        job.health = lambda stack: calls.append(["HEALTH", stack["project"]])
        def write(name, value):
            saved[name] = copy.deepcopy(value)
            return Path("/private/" + name)
        job.write_compose = write
        job.write = write
        job.inspect = lambda kind, name: {"State": {"Running": True, "Health": {"Status": "healthy"}}, "Image": "sha256:booking"}
        return job, calls, saved

    def test_activation_uses_distinct_keys_private_configuration_and_probe_before_workers(self):
        job, calls, saved = self.fake_activation()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            job.activate(True)
        self.assertTrue(job.completed)
        book = saved["booking-integrated.private.json"]["services"]
        crm = saved["crm-integrated.private.json"]["services"]
        cenv = crm["app"]["environment"]
        self.assertNotEqual(cenv["BOOKING_PLATFORM_COMMAND_KEY"], book["app"]["environment"]["CRM_SIGNING_KEY"])
        self.assertNotIn(cenv["BOOKING_PLATFORM_COMMAND_KEY"], output.getvalue())
        self.assertEqual(json.loads(book["app"]["environment"]["CRM_STAFF_ACTORS"]), {"crm-a": "book-a"})
        self.assertEqual(crm["worker"]["volumes"], [{"source": "original", "target": "/data"}])
        probe = next(i for i, x in enumerate(calls) if x[-1] == module.SIGNED_PROBE)
        start = next(i for i, x in enumerate(calls) if "up" in x and all(w in x for w in module.WORKERS))
        self.assertLess(probe, start)
        self.assertFalse(any("migrate" in x or "grant" in x for x in calls))

    def test_queues_or_missing_mfa_identity_block_before_any_stop(self):
        for kwargs in ({"queued": 1}, {"eligible": False}):
            job, calls, saved = self.fake_activation(**kwargs)
            with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(module.update.StopUpdate):
                job.activate(True)
            self.assertFalse(any("stop" in x or "up" in x for x in calls))
            self.assertEqual(saved, {})

    def test_signed_probe_failure_restores_previous_services_without_new_worker_activation(self):
        job, calls, saved = self.fake_activation(probe_failure=True)
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(module.update.StopUpdate):
            job.activate(True)
        self.assertFalse(job.completed)
        self.assertFalse(any("up" in x and all(w in x for w in module.WORKERS) for x in calls))
        self.assertTrue(any("up" in x and str(Path("/private/max-travel-crm-before")) in x for x in calls))

if __name__ == "__main__":
    unittest.main()

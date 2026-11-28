#!/usr/bin/env python3
"""Inspect or update only the running Apex booking stack from a reviewed Git archive."""

import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import re
import sys


PROJECT = "max-travel-booking"
APP = PROJECT + "-app-1"
POSTGRES = PROJECT + "-postgres-1"
SOURCE = Path(__file__).resolve().parents[1]
MIGRATION = "035-flight-price-alerts"

spec = importlib.util.spec_from_file_location("booking_vps_tools", SOURCE / "deploy" / "vps-update.py")
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)


def deploy(update, revision, apply):
    stack = update.snapshot(APP, PROJECT)
    postgres = update.inspect("container", POSTGRES)
    labels = postgres["Config"].get("Labels") or {}
    if (labels.get("com.docker.compose.project") != PROJECT
            or labels.get("com.docker.compose.service") != "postgres"
            or not postgres["State"].get("Running")):
        raise tools.StopUpdate("Expected a running PostgreSQL container in the booking project.")
    if not tools.expected_url(stack["env"].get("BETTER_AUTH_URL"), "maxtravel.in", ""):
        raise tools.StopUpdate("Booking app origin differs from maxtravel.in.")
    if not (SOURCE / "db" / (MIGRATION + ".sql")).is_file():
        raise tools.StopUpdate("The reviewed source is missing booking migration 035.")
    if update.run(["docker", "port", APP, "3000/tcp"]).splitlines() != ["127.0.0.1:3108"]:
        raise tools.StopUpdate("Booking loopback port differs from 127.0.0.1:3108.")
    for container in stack["containers"]:
        if container["Config"]["Labels"].get("com.docker.compose.service") in stack["services"]:
            update.inspect("image", container["Image"])
    owner_url = tools.owner_migration_url(stack["env"], postgres)
    workers = [name for name in stack["services"] if name != "app"]
    if workers and "--wait-timeout" not in update.run(["docker", "compose", "up", "--help"]):
        raise tools.StopUpdate("Installed Docker Compose does not support the worker readiness check.")
    pg_env = tools.environment(postgres["Config"].get("Env"))
    pg_user = pg_env.get("POSTGRES_USER", "postgres")
    pg_db = pg_env.get("POSTGRES_DB") or pg_user
    applied = set(update.run(["docker", "exec", POSTGRES, "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                             "-U", pg_user, "-d", pg_db, "-c", "SELECT name FROM schema_migrations"]).splitlines())
    pending = sorted(path.stem for path in (SOURCE / "db").glob("[0-9]*.sql") if path.stem not in applied)
    print(f"Reviewed revision {revision}\nRunning services: {', '.join(sorted(stack['services']))}", flush=True)
    print("Pending booking migrations: " + (", ".join(pending) or "none"), flush=True)
    if not apply:
        print("Inspection complete. No images or services changed.")
        return

    image = f"{PROJECT}:main-{revision[:12]}-{update.directory.name[-8:]}"
    update.run(["docker", "build", "--label", f"org.opencontainers.image.revision={revision}",
                "-t", image, str(SOURCE)], timeout=3600)
    image_id = update.inspect("image", image)["Id"]
    after = copy.deepcopy(stack["config"])
    for name in stack["services"]:
        service = after["services"][name]
        service["image"] = image
        service.pop("pull_policy", None)
        for key in ("POSTGRES_PASSWORD", "MIGRATION_DATABASE_URL", "RUNTIME_DATABASE_PASSWORD"):
            service["environment"].pop(key, None)
    after_file = update.write_compose(PROJECT + "-after.json", after)
    update.run(update.compose(stack, after_file, "config", "--quiet"))
    migration = copy.deepcopy(after)
    migration["services"]["app"]["environment"]["MIGRATION_DATABASE_URL"] = owner_url
    migration_file = update.write_compose("booking-migration-only.private.json", migration)
    try:
        update.once(stack, migration_file, ["-e",
            "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL});"
            "p.query('SELECT 1').catch(()=>{process.exitCode=1}).finally(()=>p.end());"])
        print("Candidate built. Stopping the booking app and its running workers for backup.", flush=True)
        update.quiesced = True
        update.run(update.compose(stack, stack["before"], "stop", "-t", "270", *stack["services"]))
        dump = update.directory / "booking-before.dump"
        with dump.open("wb") as target:
            update.run(["docker", "exec", POSTGRES, "pg_dump", "-U", pg_user, "-d", pg_db, "-Fc"], output_file=target)
        if not dump.stat().st_size:
            raise tools.StopUpdate("Booking backup was empty.")
        with dump.open("rb") as source:
            update.run(["docker", "exec", "-i", POSTGRES, "pg_restore", "--exit-on-error", "--file=/dev/null"],
                       input_file=source)
        update.write("backup-verification.json", {"bytes": dump.stat().st_size, "sha256": tools.file_sha256(dump)})
        update.migration_attempted = True
        update.write("migration-started.json", {"revision": revision})
        update.once(stack, migration_file, ["scripts/migrate.mjs"])
        update.once(stack, migration_file, ["--conditions=react-server", "--import",
                    "./scripts/standalone-server.mjs", "dist/migrate-auth.mjs"])
    finally:
        migration_file.unlink(missing_ok=True)

    update.once(stack, after_file, ["-e",
        "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});"
        "p.query(\"SELECT current_user = 'maxtravel_app' AND bool_and(has_table_privilege(rel,priv)) AS ok "
        "FROM unnest(ARRAY['flight_price_alerts','flight_price_alert_checks']) AS tables(rel) "
        "CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS privileges(priv)\")"
        ".then(r=>{if(r.rows[0]?.ok!==true)process.exitCode=1}).catch(()=>{process.exitCode=1}).finally(()=>p.end());"])
    up = ("up", "-d", "--no-deps", "--no-build", "--pull", "never")
    update.run(update.compose(stack, after_file, *up, "app"))
    update.health(stack)
    status = json.loads(update.run(["curl", "-fsS", "--max-time", "15", "http://127.0.0.1:3108/api/health"]))
    if status.get("status") != "ready":
        raise tools.StopUpdate("Booking app did not report ready on its loopback port.")
    if workers:
        update.run(update.compose(stack, after_file, *up, "--wait", "--wait-timeout", "120", *workers))
    for prior in stack["containers"]:
        if prior["Config"]["Labels"].get("com.docker.compose.service") in stack["services"]:
            current = update.inspect("container", prior["Name"].lstrip("/"))
            if not current["State"].get("Running") or current["Image"] != image_id:
                raise tools.StopUpdate("A booking service did not start on the reviewed image.")
    if update.inspect("container", POSTGRES)["Id"] != postgres["Id"]:
        raise tools.StopUpdate("The booking PostgreSQL container changed during rollout.")
    update.write("completed.json", {"revision": revision, "image": image, "services": stack["services"]})
    update.completed = True
    print(f"Booking app ready on main {revision}. Active workers use image {image}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("revision", help="Exact main commit used to produce this Git archive")
    parser.add_argument("--apply", action="store_true", help="Build, back up, migrate and restart the booking stack")
    args = parser.parse_args()
    if not re.fullmatch("[a-f0-9]{40}", args.revision):
        parser.error("Use the full lowercase Git commit.")
    if not hasattr(os, "geteuid") or os.geteuid() != 0:
        parser.error("Use the Apex root shell.")
    os.umask(0o077)
    update = tools.Update()
    print(f"Private rollout files: {update.directory}", flush=True)
    try:
        deploy(update, args.revision, args.apply)
    except (Exception, KeyboardInterrupt) as error:
        print(str(error) if isinstance(error, tools.StopUpdate) else "Rollout stopped. See the private operation logs.", file=sys.stderr)
        update.recover()
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

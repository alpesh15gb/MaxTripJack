#!/usr/bin/env python3
"""Pinned two-app VPS update. Default: inspect only. --apply: build, back up, migrate, cut over.

Existing Compose configuration, database volumes and runtime secrets are retained.
Never prints environment values. Never enables a previously stopped worker.
"""
import argparse
import copy
import hashlib
import hmac
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit, urlunsplit

BOOKING_REF = "d5c9a3ea3b9dc85065e6780c0df710e42f8e7201"
CRM_REF = "2b60bf86f1f0ce188bc6fc816c0696ab51c639e4"
ROOT = Path("/opt/maxtravel-deployments")


class StopUpdate(Exception):
    pass


def environment(values):
    return dict(item.split("=", 1) for item in values or [] if "=" in item)


def compose_interpolation_environment(names, containers, project, host_environment):
    """Resolve references from this running stack, including its database service.

    Never guess between different service values or borrow another project's secrets.
    Values exist only in the Compose subprocess environment and private snapshots.
    """
    candidates = {name: set() for name in names}
    for container in containers:
        labels = container["Config"].get("Labels") or {}
        if labels.get("com.docker.compose.project") != project:
            raise StopUpdate("Cannot resolve Compose variables from another project.")
        if labels.get("com.docker.compose.oneoff", "false").lower() == "true":
            continue
        current = environment(container["Config"].get("Env"))
        for name in names:
            if name in current:
                candidates[name].add(current[name])
    result = dict(host_environment)
    for name, values in candidates.items():
        if len(values) > 1:
            raise StopUpdate("Conflicting running-service values for Compose variable " + name + "; no service changed.")
        if values:
            result[name] = next(iter(values))
    return result


def compose_dollars(value, before, after):
    if isinstance(value, str):
        return value.replace(before, after)
    if isinstance(value, list):
        return [compose_dollars(item, before, after) for item in value]
    if isinstance(value, dict):
        return {key: compose_dollars(item, before, after) for key, item in value.items()}
    return value


def literal_compose(value):
    """Encode raw runtime literals for a subsequent Compose file read."""
    return compose_dollars(value, "$", "$$")


def resolved_compose(value):
    """Compose config emits escaped literals; decode once before merging runtime env."""
    return compose_dollars(value, "$$", "$")


def prepare_security_lists(config):
    """Repair redundant frozen JSON entries without dropping a distinct protection."""
    result = copy.deepcopy(config)
    changes = []
    for service, spec in result.get("services", {}).items():
        if not isinstance(spec, dict):
            continue
        for field in ("security_opt", "cap_drop", "cap_add"):
            if field not in spec:
                continue
            values = spec[field]
            path = "services." + service + "." + field
            if field == "security_opt" and isinstance(values, str) and values in ("no-new-privileges:true", "no-new-privileges=true"):
                spec[field] = [values]
                changes.append(path)
                continue
            if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
                raise StopUpdate("Unsupported Compose field " + path + ": expected a list of strings, received " + type(values).__name__ + ". No service changed.")
            unique = list(dict.fromkeys(values))
            if unique != values:
                spec[field] = unique
                changes.append(path)
    return result, changes


def compose_validation_summary(text):
    """Print structural errors only, never offending values or raw CLI text."""
    fields = sorted(set(re.findall(r"\b(?:services|networks|volumes|configs|secrets)(?:\.[A-Za-z0-9_-]+)+", text)))[:12]
    lower = text.lower()
    rules = [rule for rule in ("must be a string", "must be a number", "must be an integer", "must be a boolean", "must be a array", "must be an array", "must be a mapping", "must be a list", "not allowed", "is required") if rule in lower]
    if re.search(r"items at \d+ and \d+ are equal", lower):
        rules.append("duplicate list entries")
    return {"fields": fields, "rules": rules}


def same_secret(left, right):
    return bool(left and right) and hmac.compare_digest(left.encode(), right.encode())


def json_map(value):
    try:
        result = json.loads(value or "{}")
        return result if isinstance(result, dict) else {}
    except (ValueError, TypeError):
        return {}


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def persistent_path(path, mounts):
    if not path or not PurePosixPath(path).is_absolute() or ".." in PurePosixPath(path).parts or "\\" in path:
        return False
    for mount in mounts:
        if mount.get("Type") in ("bind", "volume") and mount.get("RW"):
            destination = mount["Destination"].rstrip("/")
            if path == destination or path.startswith(destination + "/"):
                return True
    return False


def readable_build_source(source, index):
    # Root-private checkout parents stay private, while COPY must produce source/
    # public files readable by the non-root application image, even with umask 077.
    source = source.resolve()
    for record in filter(None, index.split("\0")):
        metadata, filename = record.split("\t", 1)
        mode = metadata.split()[0]
        relative = PurePosixPath(filename)
        if mode not in ("100644", "100755") or relative.is_absolute() or ".." in relative.parts:
            raise StopUpdate("Unsupported source file mode/path in build checkout.")
        target = source.joinpath(*relative.parts)
        if target.is_symlink() or os.path.commonpath([str(source), str(target.resolve())]) != str(source):
            raise StopUpdate("Build source escaped its private checkout.")
        os.chmod(target, 0o755 if mode == "100755" else 0o644)
        parent = target.parent
        while parent != source.parent:
            os.chmod(parent, 0o755)
            parent = parent.parent


def expected_url(value, host, path):
    try:
        u = urlsplit(value or "")
        return (u.scheme == "https" and u.netloc == host and u.path.rstrip("/") == path.rstrip("/")
                and not u.query and not u.fragment)
    except ValueError:
        return False


def integration_summary(booking, crm):
    event_key = json_map(crm.get("BOOKING_PLATFORM_SIGNING_KEYS")).get(booking.get("CRM_KEY_ID"))
    command_key = json_map(booking.get("CRM_COMMAND_KEYS")).get(crm.get("BOOKING_PLATFORM_COMMAND_KEY_ID"))
    return {
        "eventsUrlCorrect": expected_url(booking.get("CRM_EVENTS_URL"), "crm.maxtravel.in", "/api/integrations/booking-platform/events"),
        "eventSigningKeyMatches": same_secret(booking.get("CRM_SIGNING_KEY"), event_key if isinstance(event_key, str) else None),
        "commandsUrlCorrect": expected_url(crm.get("BOOKING_PLATFORM_API_URL"), "maxtravel.in", "/api/integrations/crm/commands"),
        "commandSigningKeyMatches": same_secret(crm.get("BOOKING_PLATFORM_COMMAND_KEY"), command_key if isinstance(command_key, str) else None),
        "crmOwnerConfigured": bool(crm.get("BOOKING_PLATFORM_OWNER_ID")),
        "crmBranchConfigured": bool(crm.get("BOOKING_PLATFORM_BRANCH_ID")),
        "staffCommandMappingConfigured": bool(json_map(booking.get("CRM_STAFF_ACTORS"))),
    }


def retain_live_mount(result, spec, service, mount):
    """Pin an undeclared runtime mount to the SAME source, never a new volume/path."""
    destination = mount.get("Destination", "")
    if not destination or not PurePosixPath(destination).is_absolute() or ".." in PurePosixPath(destination).parts:
        raise StopUpdate("A live mount has an invalid container target.")
    retained = {"type": mount["Type"], "target": destination, "read_only": not mount.get("RW", True)}
    if mount["Type"] == "volume":
        name = mount.get("Name")
        if not isinstance(name, str) or not name:
            raise StopUpdate("Cannot preserve a live volume without its existing Docker volume name.")
        key = "retained-" + hashlib.sha256((service + "\0" + destination + "\0" + name).encode()).hexdigest()[:20]
        definition = {"external": True, "name": name}
        volumes = result.setdefault("volumes", {})
        if key in volumes and volumes[key] != definition:
            raise StopUpdate("Conflicting retained Docker volume identity.")
        volumes[key] = definition
        retained["source"] = key
    elif mount["Type"] == "bind":
        source = mount.get("Source", "")
        if not os.path.isabs(source) or not Path(source).exists():
            raise StopUpdate("Cannot preserve a live bind mount whose source is unavailable.")
        retained["source"] = source
        retained["bind"] = {"create_host_path": False}
        if mount.get("Propagation"):
            retained["bind"]["propagation"] = mount["Propagation"]
    else:
        raise StopUpdate("Unsupported live mount type.")
    if spec.get("volumes") is None:
        spec["volumes"] = []
    spec["volumes"].append(retained)
    return retained


def freeze_config(config, containers, image_defaults, on_retained=None):
    """Use current container overrides as truth, pin old images, retain mounts/networks."""
    result = copy.deepcopy(config)
    services = result.get("services", {})
    for spec in services.values():
        spec.pop("build", None)
        spec.pop("pull_policy", None)
    seen = set()
    for container in containers:
        labels = container["Config"].get("Labels") or {}
        service = labels.get("com.docker.compose.service")
        if not service or service in seen:
            raise StopUpdate("Cannot identify exactly one configured container per active service.")
        seen.add(service)
        if service not in services:
            if service in ("postgres", "redis", "evolution"):
                # App-only frozen deployments can reference existing infrastructure
                # through their network without managing its Compose service.
                continue
            raise StopUpdate("An active application/worker service is absent from the app deployment model.")
        spec = services[service]
        declared = spec.get("environment") or {}
        if not isinstance(declared, dict):
            raise StopUpdate("Compose environment was not normalized.")
        current = environment(container["Config"].get("Env"))
        defaults = environment(image_defaults[container["Image"]])
        spec["environment"] = {k: v for k, v in current.items() if k in declared or defaults.get(k) != v}
        spec.pop("env_file", None)
        spec["image"] = container["Image"]
        # A config with a moved/missing data mount must never allocate a new empty volume.
        volumes = spec.get("volumes") or []
        for mount in container.get("Mounts", []):
            if mount["Type"] not in ("bind", "volume"):
                continue
            match = next((v for v in volumes if isinstance(v, dict) and v.get("target") == mount["Destination"]), None)
            if not match:
                match = retain_live_mount(result, spec, service, mount)
                if on_retained:
                    on_retained({"service": service, "type": mount["Type"], "target": mount["Destination"]})
                volumes = spec["volumes"]
            if match.get("type") != mount["Type"] or bool(match.get("read_only", False)) != (not mount.get("RW", True)):
                raise StopUpdate("Compose mount type/access differs from the running container for service " + service + ".")
            if mount["Type"] == "volume":
                definition = (result.get("volumes") or {}).get(match.get("source"), {})
                if definition.get("name") != mount.get("Name"):
                    raise StopUpdate("Compose volume identity differs from the live mount for service " + service + " at " + mount["Destination"] + ".")
            elif os.path.realpath(str(match.get("source", ""))) != os.path.realpath(mount["Source"]):
                raise StopUpdate("Compose bind source differs from the live mount for service " + service + " at " + mount["Destination"] + ".")
    return result


def owner_migration_url(app_env, postgres):
    current = urlsplit(app_env.get("DATABASE_URL", ""))
    pg_env = environment(postgres["Config"].get("Env"))
    db_name = pg_env.get("POSTGRES_DB") or pg_env.get("POSTGRES_USER", "postgres")
    aliases = {postgres["Name"].lstrip("/")}
    for network in postgres["NetworkSettings"]["Networks"].values():
        aliases.update(network.get("Aliases") or [])
        if network.get("IPAddress"):
            aliases.add(network["IPAddress"])
    if (current.scheme not in ("postgres", "postgresql") or current.hostname not in aliases
            or current.path != "/" + db_name or not pg_env.get("POSTGRES_PASSWORD")):
        raise StopUpdate("Cannot safely derive a migration-owner connection for the existing booking database.")
    user = quote(pg_env.get("POSTGRES_USER", "postgres"), safe="")
    password = quote(pg_env["POSTGRES_PASSWORD"], safe="")
    host = current.hostname
    if ":" in host:
        host = "[" + host + "]"
    return urlunsplit((current.scheme, f"{user}:{password}@{host}:{current.port or 5432}", current.path, current.query, ""))


class Update:
    def __init__(self):
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self.directory = ROOT / (stamp + "-" + os.urandom(4).hex())
        self.directory.mkdir(parents=True, mode=0o700)
        os.chmod(self.directory, 0o700)
        self.number = 0
        self.stacks = []
        self.quiesced = False
        self.migration_attempted = False
        self.completed = False

    def run(self, args, cwd=None, input_file=None, output_file=None, timeout=1800, env=None):
        self.number += 1
        log_path = self.directory / f"operation-{self.number:03d}.log"
        error_path = self.directory / f"operation-{self.number:03d}.stderr.log"
        with log_path.open("wb") as log, error_path.open("wb") as errors:
            result = subprocess.run(args, cwd=cwd, stdin=input_file, stdout=output_file if output_file is not None else log,
                                    stderr=errors, timeout=timeout, check=False, env=env)
        if result.returncode:
            if args[:2] == ["docker", "compose"] and "config" in args:
                print("Compose validation summary: " + json.dumps(compose_validation_summary(error_path.read_text(errors="replace"))), flush=True)
            raise StopUpdate(f"An operation failed. Private diagnostic logs: {log_path} and {error_path}")
        if output_file is not None:
            return None
        return log_path.read_text(errors="replace")

    def inspect(self, kind, name):
        return json.loads(self.run(["docker", kind, "inspect", name]))[0]

    def write(self, name, value):
        target = self.directory / name
        target.write_text(json.dumps(value, indent=2) + "\n")
        os.chmod(target, 0o600)
        return target

    def compose(self, stack, file, *args):
        return ["docker", "compose", "--project-directory", stack["working"], "-p", stack["project"], "-f", str(file), *args]

    def write_compose(self, name, value):
        return self.write(name, literal_compose(value))

    def snapshot(self, app_name, project):
        app = self.inspect("container", app_name)
        labels = app["Config"].get("Labels") or {}
        if labels.get("com.docker.compose.project") != project or labels.get("com.docker.compose.service") != "app":
            raise StopUpdate("Unexpected Compose project or app service.")
        if not app["State"].get("Running") or app["State"].get("Health", {}).get("Status") != "healthy":
            raise StopUpdate("An existing application is not healthy; refusing an automatic cutover.")
        working = labels.get("com.docker.compose.project.working_dir", "")
        files = labels.get("com.docker.compose.project.config_files", "").split(",")
        if not os.path.isabs(working) or not Path(working).is_dir() or not all(os.path.isabs(f) and Path(f).is_file() for f in files):
            raise StopUpdate("An active Compose file or working directory is unavailable; no service changed.")
        ids = self.run(["docker", "ps", "-q", "--filter", f"label=com.docker.compose.project={project}"]).split()
        containers = [self.inspect("container", identity) for identity in ids]
        containers = [c for c in containers if (c["Config"].get("Labels") or {}).get("com.docker.compose.oneoff", "false").lower() != "true"]
        # The application's deployment chain is authoritative. PostgreSQL (and
        # other long-lived services) can retain labels from an older release;
        # merging those files over the current frozen model reintroduces stale
        # settings. Read their runtime env/mounts separately below. If an active
        # service is absent from this model, freeze_config refuses the update.
        command = ["docker", "compose", "--project-directory", working, "-p", project]
        env_files = labels.get("com.docker.compose.project.environment_file", "")
        for file in filter(None, env_files.split(",")):
            if not Path(file).is_file():
                raise StopUpdate("An explicitly configured Compose environment file is unavailable.")
            command += ["--env-file", file]
        input_files = []
        for index, file in enumerate(files):
            try:
                source = json.loads(Path(file).read_text())
            except ValueError:
                input_files.append(file)  # Preserve existing YAML and its anchor/merge semantics.
                continue
            if not isinstance(source, dict):
                raise StopUpdate("Compose JSON input must be an object.")
            prepared, changes = prepare_security_lists(source)
            if changes:
                if source.get("include") or any(isinstance(s, dict) and s.get("extends") for s in source.get("services", {}).values()):
                    raise StopUpdate("A security-list repair with include/extends requires path review; no service changed.")
                private = self.write(project + "-source-" + str(index) + ".json", prepared)
                input_files.append(str(private))
                print("Prepared private Compose security-list repair: " + json.dumps(changes), flush=True)
            else:
                input_files.append(file)
        for file in input_files:
            command += ["-f", file]
        # Databases have service-specific variables (e.g. POSTGRES_PASSWORD) that
        # the web app should not receive. Resolve them from this stack's containers.
        interpolation_names = set()
        for file in input_files:
            interpolation_names.update(re.findall(r"\$\{([A-Za-z_][A-Za-z0-9_]*)", Path(file).read_text()))
        compose_env = compose_interpolation_environment(interpolation_names, containers, project, os.environ)
        normalized = resolved_compose(json.loads(self.run(command + ["config", "--format", "json"], cwd=working, env=compose_env)))
        defaults = {c["Image"]: self.inspect("image", c["Image"])["Config"].get("Env", []) for c in containers}
        frozen = freeze_config(normalized, containers, defaults,
            lambda mount: print("Preserved live mount in private configuration: " + json.dumps(mount), flush=True))
        stack = {"project": project, "working": working, "app": app_name,
                 "env": environment(app["Config"].get("Env")), "config": frozen, "containers": containers}
        stack["services"] = [(c["Config"].get("Labels") or {})["com.docker.compose.service"] for c in containers
                             if not re.search(r"postgres|redis|evolution", (c["Config"].get("Labels") or {}).get("com.docker.compose.service", ""), re.I)]
        # Only update the application and its explicitly identified workers.
        if any(s != "app" and "worker" not in s for s in stack["services"]):
            raise StopUpdate("An unknown application service requires review before cutover.")
        stack["before"] = self.write_compose(project + "-before.json", frozen)
        self.write(project + "-inspect.private.json", containers)
        self.stacks.append(stack)
        return stack

    def checkout_build(self, stack, repository, ref, subdirectory=""):
        source = self.directory / (stack["project"] + "-source")
        self.run(["git", "init", "-q", str(source)])
        self.run(["git", "-C", str(source), "remote", "add", "origin", repository])
        self.run(["git", "-C", str(source), "fetch", "--depth=1", "origin", ref])
        self.run(["git", "-C", str(source), "checkout", "-q", "--detach", "FETCH_HEAD"])
        sha = self.run(["git", "-C", str(source), "rev-parse", "HEAD"]).strip()
        if (repository.endswith("MaxTripJack.git") and sha != BOOKING_REF) or (repository.endswith("MaxTravel.git") and sha != CRM_REF):
            raise StopUpdate("Fetched source is not the pinned reviewed commit.")
        readable_build_source(source, self.run(["git", "-C", str(source), "ls-files", "--stage", "-z"]))
        image = stack["project"] + ":verified-" + sha[:12] + "-" + self.directory.name[-8:]
        print(f"Building {stack['project']} {sha[:12]}; logs are private under {self.directory}", flush=True)
        self.run(["docker", "build", "--label", "org.opencontainers.image.revision=" + sha,
                  "-t", image, str(source / subdirectory)], timeout=3600)
        after = copy.deepcopy(stack["config"])
        for service in stack["services"]:
            after["services"][service]["image"] = image
            after["services"][service].pop("pull_policy", None)
        if stack["project"] == "max-travel-booking":
            after["services"]["app"]["environment"].update(PAYMENT_PROVIDER="PAYGLOCAL", PAYGLOCAL_ENV="UAT")
            after["services"]["app"]["environment"].pop("MIGRATION_DATABASE_URL", None)
            after["services"]["app"]["environment"].pop("RUNTIME_DATABASE_PASSWORD", None)
        stack.update(image=image, sha=sha, after_config=after)
        stack["after"] = self.write_compose(stack["project"] + "-after.json", after)
        self.run(self.compose(stack, stack["after"], "config", "--quiet"))

    def once(self, stack, file, command, *options):
        return self.run(self.compose(stack, file, "run", "--rm", "--no-deps", "-T", "--entrypoint", "node", *options, "app", *command))

    def health(self, stack):
        end = time.monotonic() + 180
        while time.monotonic() < end:
            container = self.inspect("container", stack["app"])
            if container["State"].get("Health", {}).get("Status") == "healthy":
                return
            if not container["State"].get("Running"):
                break
            time.sleep(3)
        raise StopUpdate(f"{stack['project']} did not become healthy. Workers remain stopped.")

    def execute(self, apply):
        booking = self.snapshot("max-travel-booking-app-1", "max-travel-booking")
        crm = self.snapshot("max-travel-crm-app-1", "max-travel-crm")
        if not expected_url(booking["env"].get("BETTER_AUTH_URL"), "maxtravel.in", "") or not expected_url(crm["env"].get("APP_ORIGIN"), "crm.maxtravel.in", ""):
            raise StopUpdate("Application origins do not match the requested VPS domains.")
        if not crm["env"].get("DATABASE_URL", "").startswith("file:"):
            raise StopUpdate("This rollout expects the existing SQLite CRM.")
        crm_database = crm["env"]["DATABASE_URL"][5:].split("?", 1)[0]
        crm_mounts = next(c for c in crm["containers"] if c["Name"].lstrip("/") == crm["app"])["Mounts"]
        media = crm["env"].get("PACKAGE_MEDIA_ROOT") or str(PurePosixPath(crm_database).parent / "package-media")
        if not all(persistent_path(p, crm_mounts) for p in (crm_database, crm["env"].get("UPLOAD_ROOT") or "/data/uploads", media)):
            raise StopUpdate("CRM database/uploads/package media must reside on existing writable persistent mounts.")
        summary = integration_summary(booking["env"], crm["env"])
        print("Existing integration configuration (booleans only): " + json.dumps(summary), flush=True)
        print("Previously running application services: " + json.dumps({s["project"]: s["services"] for s in self.stacks}), flush=True)
        if not apply:
            print("Inspection complete. No build, migration, stop or restart was performed.")
            return
        postgres = self.inspect("container", "max-travel-booking-postgres-1")
        pg_labels = postgres["Config"].get("Labels") or {}
        if pg_labels.get("com.docker.compose.project") != "max-travel-booking" or pg_labels.get("com.docker.compose.service") != "postgres":
            raise StopUpdate("Unexpected booking PostgreSQL container.")
        migration_url = owner_migration_url(booking["env"], postgres)
        self.checkout_build(booking, "https://github.com/alpesh15gb/MaxTripJack.git", BOOKING_REF, "booking-platform")
        self.checkout_build(crm, "https://github.com/alpesh15gb/MaxTravel.git", CRM_REF)
        migration = copy.deepcopy(booking["after_config"])
        migration["services"]["app"]["environment"]["MIGRATION_DATABASE_URL"] = migration_url
        migration_file = self.write_compose("booking-migration-only.private.json", migration)
        self.once(booking, migration_file, ["-e", "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL});p.query('SELECT 1').then(()=>console.log('Migration connection verified')).catch(()=>{console.error('Migration connection failed');process.exitCode=1}).finally(()=>p.end());"])
        if not self.once(booking, booking["after"], ["-e", "require('fs').accessSync('db/019-cancellation-reconciliation.sql');console.log('Booking migration included');"]).strip():
            raise StopUpdate("Booking candidate lacks the recovery migration.")
        self.once(crm, crm["after"], ["-e", "for(const p of ['prisma/migrations/20261031100000_case_workflow/migration.sql','prisma/migrations/20261102010000_data_imports/migration.sql'])require('fs').accessSync(p);console.log('CRM workflow and import migrations included');"])
        self.once(booking, booking["after"], ["-e", "const fs=require('fs');for(const p of ['server.js','package.json','.next/BUILD_ID','public/brand/maxtravel-logo.jpg'])fs.accessSync(p,fs.constants.R_OK);console.log('Booking non-root runtime files readable');"])
        self.write("release.json", {"bookingCommit": booking["sha"], "crmCommit": crm["sha"], "integration": summary,
                                  "images": {s["project"]: s["image"] for s in self.stacks}})
        print("Candidates built and verified. Pausing only the two travel applications and their active workers.", flush=True)
        self.quiesced = True
        for stack in self.stacks:
            self.run(self.compose(stack, stack["before"], "stop", "-t", "270", *stack["services"]))
        pg_env = environment(postgres["Config"].get("Env"))
        pg_user, pg_db = pg_env.get("POSTGRES_USER", "postgres"), pg_env.get("POSTGRES_DB") or pg_env.get("POSTGRES_USER", "postgres")
        dump = self.directory / "booking-before.dump"
        with dump.open("wb") as target:
            self.run(["docker", "exec", "max-travel-booking-postgres-1", "pg_dump", "-U", pg_user, "-d", pg_db, "-Fc"], output_file=target)
        with dump.open("rb") as source:
            self.run(["docker", "exec", "-i", "max-travel-booking-postgres-1", "pg_restore", "--list"], input_file=source)
        if dump.stat().st_size == 0:
            raise StopUpdate("Empty booking database backup.")
        crm_backups = self.directory / "crm-backups"
        crm_backups.mkdir(mode=0o700)
        bind = str(crm_backups) + ":/maxtravel-recovery"
        self.once(crm, crm["before"], ["scripts/backup.mjs", "--out", "/maxtravel-recovery"], "--user", "0", "--volume", bind)
        manifests = list(crm_backups.glob("backup-*/manifest.json"))
        if len(manifests) != 1:
            raise StopUpdate("CRM backup manifest is missing or ambiguous.")
        self.once(crm, crm["before"], ["scripts/restore.mjs", "--in", "/maxtravel-recovery/" + manifests[0].parent.name,
                  "--out", "/maxtravel-recovery/restore-check"], "--user", "0", "--volume", bind)
        self.write("backup-verification.json", {"bookingDumpBytes": dump.stat().st_size,
                   "bookingDumpSha256": file_sha256(dump),
                   "crmBackupVerifiedByRestore": True})
        print("Both backups verified. Applying committed migrations; no database reset is used.", flush=True)
        # From this point, never automatically run an old application against a changed schema.
        self.migration_attempted = True
        self.write("migration-started.json", {"started": True})
        self.once(booking, migration_file, ["scripts/migrate.mjs"])
        self.once(crm, crm["after"], ["node_modules/prisma/build/index.js", "migrate", "deploy"])
        self.once(crm, crm["after"], ["node_modules/prisma/build/index.js", "migrate", "status"])
        for stack in (crm, booking):
            self.run(self.compose(stack, stack["after"], "up", "-d", "--no-deps", "--no-build", "--pull", "never", "app"))
            self.health(stack)
        payment = self.run(["docker", "exec", booking["app"], "node", "-e",
            "fetch('http://127.0.0.1:3000/api/payments/config').then(async r=>{const b=await r.json();if(!r.ok||b.provider!=='PAYGLOCAL'||b.configured!==false)throw Error();console.log('PayGlocal checkout is held');}).catch(()=>{console.error('Payment hold check failed');process.exitCode=1});"])
        print(payment.strip(), flush=True)
        # Existing workers resume only after BOTH applications and the payment hold pass.
        for stack in self.stacks:
            workers = [s for s in stack["services"] if s != "app"]
            if workers:
                self.run(self.compose(stack, stack["after"], "up", "-d", "--no-deps", "--no-build", "--pull", "never", *workers))
        time.sleep(3)
        for stack in self.stacks:
            image_id = self.inspect("image", stack["image"])["Id"]
            for prior in stack["containers"]:
                service = (prior["Config"].get("Labels") or {}).get("com.docker.compose.service")
                if service in stack["services"]:
                    current = self.inspect("container", prior["Name"].lstrip("/"))
                    if not current["State"].get("Running") or current["Image"] != image_id:
                        raise StopUpdate("An application/worker is not running the verified candidate image.")
        queues = self.run(["docker", "exec", booking["app"], "node", "-e", "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});(async()=>{try{const jobs=(await p.query('SELECT state,count(*)::int AS count FROM booking_jobs GROUP BY state')).rows;const queues=(await p.query('SELECT (SELECT count(*) FROM outbox_events WHERE delivered_at IS NULL)::int AS crm_pending,(SELECT count(*) FROM customer_notifications WHERE delivered_at IS NULL)::int AS notification_pending')).rows[0];console.log(JSON.stringify({jobs,queues}));}catch{console.error('Queue inspection failed');process.exitCode=1}finally{await p.end()}})();"])
        print("Booking queue inspection: " + queues.strip(), flush=True)
        self.completed = True
        self.write("completed.json", {"healthyApplications": True, "paymentHoldVerified": True,
                    "newWorkersActivated": False, "integration": summary})
        print("Both applications updated and healthy. Existing worker services resumed.", flush=True)
        print("Previously inactive booking workers remain stopped pending queue/integration review.", flush=True)
        print("Nginx maintenance settings and unrelated containers were left unchanged.", flush=True)

    def recover(self):
        if not self.quiesced or self.completed:
            return
        if self.migration_attempted:
            print("A migration was attempted. No automatic database restore or old-image rollback was performed.", file=sys.stderr)
            print("Keep application/worker state under review; use the private backups and logs for recovery.", file=sys.stderr)
            return
        print("Migration has not started. Restoring only previously running services with their pinned original images.", file=sys.stderr)
        for stack in self.stacks:
            try:
                self.run(self.compose(stack, stack["before"], "up", "-d", "--no-deps", "--no-build", "--pull", "never", *stack["services"]))
            except Exception:
                print("An original service needs manual restart; see its private before.json configuration.", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Build, back up, migrate and update the two existing travel stacks")
    args = parser.parse_args()
    if sys.platform != "linux" or os.geteuid() != 0:
        raise StopUpdate("Run this script as root on the Ubuntu VPS.")
    for command in ("docker", "git"):
        if not shutil.which(command):
            raise StopUpdate("Required command missing: " + command)
    os.umask(0o077)
    update = Update()
    print("Private recovery directory: " + str(update.directory), flush=True)
    try:
        update.execute(args.apply)
    except (Exception, KeyboardInterrupt) as error:
        if isinstance(error, StopUpdate):
            print(str(error), file=sys.stderr)
        else:
            print("Stopped at exception type: " + type(error).__name__, file=sys.stderr)
        update.recover()
        raise StopUpdate("Update stopped. Keep the recovery directory and share the console status, not private log/config contents: " + str(update.directory))


if __name__ == "__main__":
    try:
        main()
    except StopUpdate as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)

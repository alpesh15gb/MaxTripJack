#!/usr/bin/env python3
"""Inspect or activate existing travel integrations. No credentials or customer data are printed.

Keep the reviewed vps-update.py beside this file. Default is inspection only.
--apply configures separate command signing, maps existing eligible identities,
and activates idle booking workers from the exact running application image.
It never provisions users, changes grants, bypasses MFA, migrates or enables payments.
"""
import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import secrets
import sys
import time

spec = importlib.util.spec_from_file_location("travel_update", Path(__file__).with_name("vps-update.py"))
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)

WORKERS = {"booking-worker": "bookings", "crm-worker": "crm", "maintenance-worker": "maintenance",
           "cancellation-worker": "cancellations", "refund-worker": "refunds", "payment-worker": "payments",
           "notification-worker": "notifications"}

def eligible_actors(crm_users, booking_users, previous):
    """Exact verified identity matches only; never infer privileges from a CRM title."""
    crm = {u["id"]: u for u in crm_users if u.get("active") and u.get("mfa")}
    booking = {u["id"]: u for u in booking_users if "bookings:read" in u.get("permissions", [])}
    result = {}
    for actor, target in previous.items():
        if actor not in crm or target not in booking:
            raise update.StopUpdate("An existing staff mapping is no longer eligible. Review that identity before activation.")
        if crm[actor]["email"].strip().lower() != booking[target]["email"].strip().lower():
            raise update.StopUpdate("An existing mapping uses different identity emails. Explicit identity review is required.")
        result[actor] = target
    for actor, person in crm.items():
        matches = [u for u in booking.values() if u["email"].strip().lower() == person["email"].strip().lower()]
        peers = [u for u in crm.values() if u["email"].strip().lower() == person["email"].strip().lower()]
        if len(matches) == 1 and len(peers) == 1:
            result[actor] = matches[0]["id"]
    if len(set(result.values())) != len(result):
        raise update.StopUpdate("Multiple staff identities would share a booking administrator. Activation stopped.")
    return result

def worker_spec(app, name, heartbeat):
    result = copy.deepcopy(app)
    for key in ("ports", "container_name", "hostname", "domainname", "mac_address", "build", "profiles", "depends_on", "healthcheck"):
        result.pop(key, None)
    # Network membership is shared, but a worker must not acquire the web app's
    # static IP or DNS/proxy identity and accidentally receive customer traffic.
    for options in (result.get("networks") or {}).values():
        if isinstance(options, dict):
            for key in ("aliases", "ipv4_address", "ipv6_address", "link_local_ips", "mac_address"):
                options.pop(key, None)
    labels = result.get("labels")
    if isinstance(labels, dict):
        result["labels"] = {k: v for k, v in labels.items() if not k.startswith(("traefik.", "caddy"))}
    result["entrypoint"] = ["node"]
    result["command"] = ["--conditions=react-server", "--import", "./scripts/standalone-server.mjs", "dist/" + name + ".mjs"]
    result["restart"] = "unless-stopped"
    probe = "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query(\"SELECT 1 FROM worker_heartbeats WHERE name=$1 AND last_seen>now()-interval '90 seconds'\",[" + json.dumps(heartbeat) + "]).then(r=>{process.exitCode=r.rowCount?0:1}).catch(()=>{process.exitCode=1}).finally(()=>p.end());"
    result["healthcheck"] = {"test": ["CMD", "node", "-e", probe], "interval": "15s", "timeout": "10s", "retries": 3, "start_period": "30s"}
    return result

BOOKING_IDENTITIES = """const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});(async()=>{try{const rows=(await p.query(`SELECT u.id,u.email,g.permissions FROM admin_grants g JOIN "user" u ON u.id=g.user_id LEFT JOIN customer_accounts a ON a.user_id=u.id LEFT JOIN companies c ON c.id=a.company_id WHERE g.active=true AND u."emailVerified"=true AND u."twoFactorEnabled"=true AND COALESCE(a.active,true)=true AND (a.company_id IS NULL OR c.status='APPROVED')`)).rows;console.log(JSON.stringify(rows));}finally{await p.end()}})().catch(()=>{process.exitCode=1});"""
CRM_IDENTITIES = """const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{try{const users=await p.user.findMany({where:{active:true},select:{id:true,email:true,active:true}});const mfa=new Set((await p.staffMfa.findMany({where:{enabled:true},select:{userId:true}})).map(x=>x.userId));console.log(JSON.stringify(users.map(u=>({...u,mfa:mfa.has(u.id)}))));}finally{await p.$disconnect()}})().catch(()=>{process.exitCode=1});"""
CRM_PENDING = "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.platformCommand.count({where:{state:{in:['STARTED','UNKNOWN']}}}).then(n=>console.log(JSON.stringify({count:n}))).catch(()=>{process.exitCode=1}).finally(()=>p.$disconnect());"

QUEUES = """const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});(async()=>{try{const r=(await p.query(`SELECT (SELECT count(*) FROM crm_commands WHERE state<>'DONE')::int AS uncertain_booking_commands,(SELECT count(*) FROM booking_jobs WHERE state NOT IN ('DONE','FAILED'))::int AS booking_jobs,(SELECT count(*) FROM orders WHERE status IN ('PAID','BOOKING_PENDING'))::int AS unconfirmed_orders,(SELECT count(*) FROM outbox_events WHERE delivered_at IS NULL)::int AS crm_events,(SELECT count(*) FROM customer_notifications WHERE delivered_at IS NULL)::int AS notifications,(SELECT count(*) FROM refunds WHERE status IN ('APPROVED','PROCESSING'))::int AS refunds,(SELECT count(*) FROM cancellation_requests WHERE status='SUPPLIER_PENDING')::int AS cancellations,(SELECT count(*) FROM payglocal_attempts WHERE state<>'CAPTURED')::int AS payment_attempts`)).rows[0];console.log(JSON.stringify(r));}finally{await p.end()}})().catch(()=>{process.exitCode=1});"""
SIGNED_PROBE = """const{randomUUID,createHmac}=require('node:crypto');(async()=>{const id=randomUUID(),t=String(Math.floor(Date.now()/1000)),actor=process.env.MAXTRAVEL_PROBE_ACTOR;const raw=JSON.stringify({id,bookingId:randomUUID(),actorId:actor,action:'STATUS',data:{financial:false}});const r=await fetch(process.env.BOOKING_PLATFORM_API_URL,{method:'POST',headers:{'Content-Type':'application/json','X-MaxTravel-Timestamp':t,'X-MaxTravel-Command-Id':id,'X-MaxTravel-Key-Id':process.env.BOOKING_PLATFORM_COMMAND_KEY_ID,'X-MaxTravel-Signature':createHmac('sha256',process.env.BOOKING_PLATFORM_COMMAND_KEY).update(t+'.'+id+'.'+raw).digest('hex')},body:raw,redirect:'error',signal:AbortSignal.timeout(20000)});const b=await r.json();if(r.status!==404||b.error!=='Booking unavailable.')throw Error();console.log('Signed status verification passed; no booking or command was created.');})().catch(()=>{console.error('Signed status verification failed.');process.exitCode=1});"""

class Integration(update.Update):
    def node_json(self, container, program):
        return json.loads(self.run(["docker", "exec", container, "node", "-e", program]))

    def activate(self, apply):
        booking = self.snapshot("max-travel-booking-app-1", "max-travel-booking")
        crm = self.snapshot("max-travel-crm-app-1", "max-travel-crm")
        summary = update.integration_summary(booking["env"], crm["env"])
        if not all(summary[x] for x in ("eventsUrlCorrect", "eventSigningKeyMatches", "crmOwnerConfigured", "crmBranchConfigured")):
            raise update.StopUpdate("Existing booking-to-CRM configuration needs correction before activation.")
        people = self.node_json(crm["app"], CRM_IDENTITIES)
        admins = self.node_json(booking["app"], BOOKING_IDENTITIES)
        mapping = eligible_actors(people, admins, update.json_map(booking["env"].get("CRM_STAFF_ACTORS")))
        queues = self.node_json(booking["app"], QUEUES)
        pending_commands = self.node_json(crm["app"], CRM_PENDING)
        queues["uncertain_crm_commands"] = pending_commands["count"]
        report = {"eligibleStaffMatches": len(mapping), "crmStaffWithMfa": sum(bool(u.get("mfa")) for u in people),
                  "eligibleBookingAdministrators": len(admins), "queues": queues,
                  "emailReady": bool(booking["env"].get("SMTP_HOST") and booking["env"].get("MAIL_FROM"))}
        print("Activation readiness (counts/booleans only): " + json.dumps(report), flush=True)
        if not apply:
            print("Inspection only. No configuration, grants, workers or application state changed.")
            return
        if not mapping:
            raise update.StopUpdate("No eligible identity match. Enable MFA on the CRM staff account and its same-email verified booking administrator with bookings:read. No users, grants or auth flags were changed.")
        if any(queues.values()):
            raise update.StopUpdate("Queued or uncertain existing work needs review before first worker activation. No queued operation was executed.")
        if not report["emailReady"]:
            raise update.StopUpdate("Configure booking SMTP delivery before activating notification workers.")
        self.run(["docker", "exec", booking["app"], "node", "-e", "const f=require('fs');for(const n of " + json.dumps(list(WORKERS)) + ")f.accessSync('dist/'+n+'.mjs');console.log('All worker files exist');"])
        key = crm["env"].get("BOOKING_PLATFORM_COMMAND_KEY", "")
        kid = crm["env"].get("BOOKING_PLATFORM_COMMAND_KEY_ID", "")
        if len(key) < 32 or not kid or key == booking["env"].get("CRM_SIGNING_KEY"):
            key, kid = secrets.token_hex(32), "crm-commands-" + secrets.token_hex(6)
        book_config, crm_config = copy.deepcopy(booking["config"]), copy.deepcopy(crm["config"])
        benv = book_config["services"]["app"].setdefault("environment", {})
        cenv = crm_config["services"]["app"].setdefault("environment", {})
        keys = update.json_map(booking["env"].get("CRM_COMMAND_KEYS"))
        keys[kid] = key
        benv.update(CRM_COMMAND_KEYS=json.dumps(keys), CRM_STAFF_ACTORS=json.dumps(mapping))
        cenv.update(BOOKING_PLATFORM_API_URL="https://maxtravel.in/api/integrations/crm/commands", BOOKING_PLATFORM_COMMAND_KEY=key, BOOKING_PLATFORM_COMMAND_KEY_ID=kid)
        for name, beat in WORKERS.items():
            book_config["services"][name] = worker_spec(book_config["services"]["app"], name, beat)
        # Preserve the CRM WhatsApp worker's own environment, mounts and command.
        for name in crm["services"]:
            if name != "app":
                crm_config["services"][name].setdefault("environment", {}).update({k: cenv[k] for k in ("BOOKING_PLATFORM_API_URL", "BOOKING_PLATFORM_COMMAND_KEY", "BOOKING_PLATFORM_COMMAND_KEY_ID")})
        booking["after"] = self.write_compose("booking-integrated.private.json", book_config)
        crm["after"] = self.write_compose("crm-integrated.private.json", crm_config)
        for stack in (booking, crm):
            self.run(self.compose(stack, stack["after"], "config", "--quiet"))
        self.write("activation-plan.json", {"mappingCount": len(mapping), "workers": list(WORKERS), "images": {s["project"]: s["config"]["services"]["app"]["image"] for s in (booking, crm)}})
        self.quiesced = True
        try:
            for stack in (booking, crm):
                self.run(self.compose(stack, stack["before"], "stop", "-t", "270", *stack["services"]))
            # Recheck after the applications have stopped, using a one-off read-only inspection.
            stopped_queues = self.once(booking, booking["before"], ["-e", QUEUES])
            stopped_commands = self.once(crm, crm["before"], ["-e", CRM_PENDING])
            if any(json.loads(stopped_queues).values()) or json.loads(stopped_commands)["count"]:
                raise update.StopUpdate("Work appeared while quiescing. Activation stopped before workers started.")
            for stack in (booking, crm):
                self.run(self.compose(stack, stack["after"], "up", "-d", "--no-deps", "--no-build", "--pull", "never", "app"))
                self.health(stack)
            self.run(["docker", "exec", "-e", "MAXTRAVEL_PROBE_ACTOR=" + next(iter(mapping)), crm["app"], "node", "-e", SIGNED_PROBE])
            hold = self.node_json(booking["app"], "fetch('http://127.0.0.1:3000/api/payments/config').then(async r=>console.log(JSON.stringify(await r.json()))).catch(()=>{process.exitCode=1});")
            if hold.get("provider") != "PAYGLOCAL" or hold.get("configured") is not False:
                raise update.StopUpdate("Payment hold verification failed. No new workers were activated.")
            existing_crm = [s for s in crm["services"] if s != "app"]
            if existing_crm:
                self.run(self.compose(crm, crm["after"], "up", "-d", "--no-deps", "--no-build", "--pull", "never", *existing_crm))
            self.run(self.compose(booking, booking["after"], "up", "-d", "--no-deps", "--no-build", "--pull", "never", *WORKERS))
            deadline = time.monotonic() + 100
            while time.monotonic() < deadline:
                states = []
                for name in WORKERS:
                    current = self.inspect("container", "max-travel-booking-" + name + "-1")
                    states.append(current["State"].get("Running") and current["State"].get("Health", {}).get("Status") == "healthy" and current["Image"] == booking["containers"][next(i for i, c in enumerate(booking["containers"]) if c["Name"].lstrip('/') == booking["app"])]["Image"])
                if all(states):
                    break
                time.sleep(3)
            else:
                raise update.StopUpdate("A worker did not become healthy. Review the private diagnostics.")
            self.completed = True
            self.write("integration-completed.json", {"signedStatusVerified": True, "workersHealthy": list(WORKERS), "paymentsHeld": True, "staffMappings": len(mapping)})
            print("Signed CRM commands verified. Seven booking workers are healthy. Existing CRM worker resumed. PayGlocal remains held.")
        except (Exception, KeyboardInterrupt):
            # Config-only rollback: never touches a database or reinstates an old image.
            try:
                self.run(self.compose(booking, booking["after"], "stop", "-t", "270", *WORKERS))
            except Exception:
                print("A new worker requires manual state review; see the private recovery configuration.", file=sys.stderr)
            for stack in (booking, crm):
                try:
                    self.run(self.compose(stack, stack["before"], "up", "-d", "--no-deps", "--no-build", "--pull", "never", *stack["services"]))
                except Exception:
                    print("An original service requires manual restart from its private before configuration.", file=sys.stderr)
            raise

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if sys.platform != "linux" or os.geteuid() != 0:
        raise update.StopUpdate("Run as root on the Ubuntu VPS.")
    os.umask(0o077)
    job = Integration()
    print("Private integration recovery directory: " + str(job.directory), flush=True)
    job.activate(args.apply)

if __name__ == "__main__":
    try:
        main()
    except (update.StopUpdate, KeyboardInterrupt) as e:
        print(str(e) if isinstance(e, update.StopUpdate) else "Activation interrupted; retain private recovery files.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print("Activation stopped at exception type: " + type(e).__name__ + ". Retain the private recovery directory.", file=sys.stderr)
        sys.exit(1)

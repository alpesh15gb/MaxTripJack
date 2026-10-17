import { database } from "./db";
const sent=new Map<string,number>();
export async function heartbeat(name:string){if(Date.now()-(sent.get(name)??0)<30000)return;await database().query("INSERT INTO worker_heartbeats(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET last_seen=now()",[name]);sent.set(name,Date.now());}

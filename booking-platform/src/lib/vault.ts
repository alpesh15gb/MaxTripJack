import "server-only";
import { createCipheriv,createDecipheriv,randomBytes } from "node:crypto";
import { HttpError } from "./http";
function key(){const value=process.env.TRAVELLER_ENCRYPTION_KEY;if(!value||!/^[a-f0-9]{64}$/i.test(value))throw new HttpError(503,"Saved traveller details are temporarily unavailable. Please try again later.");return Buffer.from(value,"hex");}
export function seal(value:unknown,aad:string){const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",key(),iv);cipher.setAAD(Buffer.from(aad));const data=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(b=>b.toString("base64url")).join(".");}
export function unseal(value:string,aad:string){const [iv,tag,data]=value.split(".").map(v=>Buffer.from(v,"base64url"));const cipher=createDecipheriv("aes-256-gcm",key(),iv);cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(tag);return JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString("utf8"));}

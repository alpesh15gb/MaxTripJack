import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
// This context is set only by the verified, allowlisted command dispatcher. No HTTP header activates it.
export const crmCommandContext=new AsyncLocalStorage<{userId:string;permission:string}>();

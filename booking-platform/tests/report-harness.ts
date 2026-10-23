import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { ReactNode } from "react";

export type QueryResult = { rows: Record<string, unknown>[]; rowCount?: number };
export type Harness = {
  permissions: string[]; denied?: number; events: string[]; databaseAuthorization?: boolean;
  query: (sql: string, values: unknown[]) => Promise<QueryResult>;
};
let serial = 0;
const require = createRequire(import.meta.url);

/** Actual route + actual administrator/principal; only session and database boundaries are doubled. */
export async function reportHarness(entry: string, state: Harness) {
  const key = `__report_harness_${++serial}`;
  (globalThis as unknown as Record<string, unknown>)[key] = state;
  const prefix = `const state=globalThis[${JSON.stringify(key)}];`;
  const db = `${prefix}
    export function database(){return {async query(sql, values=[]){
      if(sql.includes('FROM customer_accounts'))return {rows:[]};
      if(sql.includes('FROM admin_grants')){state.events.push('authorize');if(state.databaseAuthorization)return state.query(sql,values);return {rows:[{permissions:state.permissions}]};}
      state.events.push('query');return state.query(sql,values);
    }};}
    export async function transaction(run){return run(database());}`;
  const mocks: Record<string, string> = {
    "@/lib/db": db, "./db": db,
    "./auth": `${prefix} import {HttpError} from ${JSON.stringify(resolve("src/lib/http.ts"))}; export function getAuth(){return {api:{async getSession(){
      if(state.denied===401)return null;
      if(state.denied===503)throw new HttpError(503,'Synthetic authentication unavailable');
      return {user:{id:'synthetic-report-user',emailVerified:true,twoFactorEnabled:state.denied!==403}};
    }}};}`,
    "./request-limit": "export async function requestLimit(){}",
    "next/navigation": "export function unstable_rethrow(){}",
    "next/headers": "export async function headers(){return new Headers();}",
    "next/link": "export default function Link(props){return props.children;}",
    "@/components/booking-reports": `${prefix} export default function Reports(){state.events.push('render');return 'SYNTHETIC_PRIVATE_REPORTS';}`,
    "server-only": "",
  };
  try {
    const result = await build({ entryPoints: [resolve(entry)], bundle: true, platform: "node", format: "cjs", packages: "external", write: false, logLevel: "silent",
      plugins: [{ name: "report-boundaries", setup(plugin) {
        plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: "mock" } : args.path.endsWith('.css') ? {path:args.path,namespace:'css-mock'} : undefined);
        plugin.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js", resolveDir: process.cwd() }));
        plugin.onLoad({filter:/.*/,namespace:'css-mock'},()=>({contents:'',loader:'js'}));
      } }],
    });
    const compiled = { exports: {} as { GET: (request: Request, context?: { params: Promise<{ resource: string }> }) => Promise<Response>; default: () => Promise<ReactNode> } };
    new Function("module", "exports", "require", result.outputFiles[0].text)(compiled, compiled.exports, require);
    return { ...compiled.exports, cleanup: () => { delete (globalThis as unknown as Record<string, unknown>)[key]; } };
  } catch (error) { delete (globalThis as unknown as Record<string, unknown>)[key]; throw error; }
}

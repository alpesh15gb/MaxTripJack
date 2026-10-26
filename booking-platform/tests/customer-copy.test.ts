import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { publicPages } from "../src/lib/public-pages";
import { flightGuides } from "../src/lib/flight-guides";
import { assertPayGlocalTransportReady } from "../src/lib/providers/payglocal";

const require = createRequire(import.meta.url);
const internalWording = /TripJack|\bUAT\b|staging|sandbox|test environment/i;
async function load(path: string) {
  const result = await build({entryPoints:[path], bundle:true, platform:"node", format:"cjs", packages:"external", write:false, loader:{".css":"empty"}, jsx:"automatic",
    plugins:[{name:"server-only-test",setup(plugin){
      // Metadata reads request headers asynchronously; isolate visible copy from that request boundary.
      plugin.onResolve({filter:/^\.\/seo-json-ld$/},()=>({path:"seo-json-ld",namespace:"metadata"}));
      plugin.onLoad({filter:/.*/,namespace:"metadata"},()=>({contents:"export default function Metadata(){return null;}",loader:"js"}));
      plugin.onResolve({filter:/^server-only$/},()=>({path:"server-only",namespace:"empty"}));
      plugin.onLoad({filter:/.*/,namespace:"empty"},()=>({contents:"",loader:"js"}));
    }}]});
  const compiled = {exports:{} as Record<string, unknown>};
  new Function("module","exports","require",result.outputFiles[0].text)(compiled,compiled.exports,require);
  return compiled.exports;
}

test("public header and footer show In Testing with an explicit no-live warning", async () => {
  const shell = await load("src/components/travel-shell.tsx");
  for (const name of ["TravelHeader", "TravelFooter"]) {
    const html = renderToStaticMarkup(createElement(shell[name] as ComponentType));
    assert.match(html,/In Testing/);
    assert.match(html,/No live bookings or payments/);
    assert.doesNotMatch(html,internalWording);
  }
});

test("public support and cancellation copy keep booking limitations without provider names", async () => {
  const support = await load("src/components/support-experience.tsx");
  const html = renderToStaticMarkup(createElement(support.default as ComponentType));
  assert.match(html,/In Testing/);
  assert.match(html,/do not create live travel bookings or payments/);
  assert.doesNotMatch(html,internalWording);
  const cancellation = await load("src/components/cancellation-request.tsx");
  const form = renderToStaticMarkup(createElement(cancellation.default as ComponentType<{bookingId:string;product:string}>,{bookingId:"synthetic",product:"FLIGHT"}));
  assert.match(form,/Travel remains active until cancellation is confirmed/);
  assert.doesNotMatch(form,internalWording);
});

test("authored public content never presents supplier testing terminology to customers", () => {
  const copy = JSON.stringify([...publicPages,...flightGuides]);
  assert.doesNotMatch(copy,internalWording);
  assert.match(copy,/In Testing/);
  assert.match(copy,/not live travel bookings/);
});

test("search and account notes retain truthful testing warnings", () => {
  for (const path of ["src/components/live-booking.tsx","src/components/account-panel.tsx"]) {
    const source = readFileSync(path,"utf8");
    assert.match(source,/In Testing/);
    assert.match(source,/No live (?:travel )?bookings or payments/);
    assert.doesNotMatch(source,/TripJack|\bUAT\b|Test environment/);
  }
});

test("payment stays disabled and reports that no payment was initiated", () => {
  assert.throws(assertPayGlocalTransportReady, {status:503,message:"In Testing · Online payment is not available. No payment was initiated."});
});

test("supplier failures keep HTTP status and safe recovery instructions", async () => {
  const provider = await load("src/lib/providers/tripjack.ts");
  const request = provider.tripjack as (product:string,path:string)=>Promise<unknown>;
  const previousKey = process.env.TRIPJACK_FLIGHT_API_KEY;
  const previousFetch = globalThis.fetch;
  try {
    delete process.env.TRIPJACK_FLIGHT_API_KEY;
    await assert.rejects(request("FLIGHT","/fms/v1/air-search-all"), (error:unknown) => {
      const failure=error as Error & {status:number};
      assert.equal(failure.status,503);assert.doesNotMatch(failure.message,internalWording);assert.match(failure.message,/contact MaxTravel/);return true;
    });
    process.env.TRIPJACK_FLIGHT_API_KEY="synthetic-key";
    globalThis.fetch=async()=>Response.json({status:{success:false}},{status:502});
    await assert.rejects(request("FLIGHT","/fms/v1/air-search-all"), {status:502,message:"We could not complete your request. Refresh availability or contact MaxTravel."});
    globalThis.fetch=async()=>{throw Error("synthetic timeout");};
    await assert.rejects(request("FLIGHT","/fms/v1/air-search-all"), {status:502,message:"We could not confirm the booking response. Check My trips or contact MaxTravel before trying again."});
  } finally {
    if(previousKey===undefined)delete process.env.TRIPJACK_FLIGHT_API_KEY;else process.env.TRIPJACK_FLIGHT_API_KEY=previousKey;
    globalThis.fetch=previousFetch;
  }
});

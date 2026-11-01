import { json,boundedText,failure } from "@/lib/http";
import {payGlocalConfig} from '@/lib/providers/payglocal-config';

// Browser/provider callbacks are untrusted hints, NEVER evidence of payment.
// No body is parsed, no outbound URL is followed and no booking is mutated.
export async function GET(request?:Request) {
  try{
    const origin=payGlocalConfig().origin;
    if(request&&new URL(request.url).searchParams.get('app')==='1')return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Return to MaxTravel</title><style>body{font:17px system-ui;background:#f3f6fb;color:#132646;margin:0;padding:24px}main{max-width:480px;margin:12vh auto;background:white;padding:32px;border-radius:20px}a{display:block;padding:16px;margin-top:16px;border-radius:10px;text-align:center;background:#073eac;color:white;text-decoration:none;min-height:24px}.secondary{background:#edf2fc;color:#073eac}</style><main><strong>MaxTravel</strong><h1>Check your trip in the app.</h1><p>Your payment is being checked securely. Returning here does not confirm a payment, ticket or room.</p><a href="maxtravel://checkout-return">Return to MaxTravel app</a><a class="secondary" href="${new URL('/my-trips',origin).href}">Check My trips on the website</a></main></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
    return new Response(null,{status:303,headers:{Location:new URL('/my-trips',origin).href,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
  }catch{}
  return json({ status: "OUTCOME_UNCONFIRMED", message: "Return received. Payment is not verified by this callback. Check My trips or contact operations; do not pay again." }, 202);
}
export async function POST(request?:Request) { try{if(request?.body)await boundedText(request,65536);return GET(request);}catch(error){return failure(error);} }

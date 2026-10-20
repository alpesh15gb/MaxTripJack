import { randomBytes } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { contentSecurityPolicy } from "./lib/content-security";
import { requestMayBeIndexed } from "./lib/seo";
export function proxy(request:NextRequest){
 const noindex=!requestMayBeIndexed(request.nextUrl);
 // Operational endpoints and metadata text/XML do not render framework scripts.
 // Preserve their own caching and authorization behavior; only add crawl hygiene.
 if(request.nextUrl.pathname.startsWith("/api/")||["/robots.txt","/sitemap.xml"].includes(request.nextUrl.pathname)){
  const response=NextResponse.next();if(noindex)response.headers.set("X-Robots-Tag","noindex, nofollow");return response;
 }
 const nonce=randomBytes(24).toString("base64");const policy=contentSecurityPolicy(nonce,process.env.NODE_ENV==="development");
 const headers=new Headers(request.headers);headers.set("x-nonce",nonce);headers.set("Content-Security-Policy",policy);
 const response=NextResponse.next({request:{headers}});response.headers.set("Content-Security-Policy",policy);response.headers.set("Cache-Control","private, no-store");if(noindex)response.headers.set("X-Robots-Tag","noindex, nofollow");return response;
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"]};

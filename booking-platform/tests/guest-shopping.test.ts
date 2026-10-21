import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { issueShoppingToken, renewShoppingToken, shoppingIdentity, shoppingCookieToken, shoppingCookie, SHOPPING_LIFETIME_SECONDS } from "../src/lib/guest-shopping-identity";
import { enforceShoppingLimits, shoppingPeer } from "../src/lib/guest-shopping-policy";
import { claimShoppingSearch, CLAIM_GUEST_SEARCH_SQL } from "../src/lib/guest-search-claim";
const secret = "test-only-signing-secret-with-more-than-thirty-two-characters";
const now = Date.UTC(2026, 9, 21);
test("anonymous ownership is unpredictable, signed, isolated and expires server-side", () => {
 const first = issueShoppingToken(secret, now), second = issueShoppingToken(secret, now);
 assert.notEqual(first, second);
 const owner = shoppingIdentity(first, secret, now)!;
 assert.match(owner, /^guest:[a-f0-9]{64}$/);
 assert.notEqual(owner, shoppingIdentity(second, secret, now));
 assert.equal(shoppingIdentity(first, "another-secret-with-at-least-thirty-two-characters", now), null);
 assert.equal(shoppingIdentity(first.replace(/.$/, first.endsWith("A") ? "B" : "A"), secret, now), null);
 assert.equal(shoppingIdentity(first, secret, now + SHOPPING_LIFETIME_SECONDS * 1000), null);
 assert.equal(shoppingIdentity(first, secret, now - 1000), null);
 assert.equal(shoppingIdentity(`guest:${"a".repeat(64)}`, secret, now), null);
 assert.equal(shoppingIdentity(first, "short", now), null);
 assert.throws(() => issueShoppingToken("short", now));
});
test("cookie is host-only, limited to travel API and unavailable to scripts", () => {
 const token = issueShoppingToken(secret, now);
 assert.equal(shoppingCookieToken(`unrelated=x; maxtravel-shopping=${token}`), token);
 assert.equal(shoppingCookieToken(`maxtravel-shopping=${token}; maxtravel-shopping=other`), undefined);
 const cookie = shoppingCookie(token, true);
 for (const flag of ["Path=/api/travel", "HttpOnly", "SameSite=Lax", "Max-Age=1800", "Secure"]) assert.ok(cookie.includes(flag));
 assert.equal(cookie.includes("Domain="), false);
 assert.equal(shoppingCookie(token, false).includes("Secure"), false);
});
test("claim only accepts a guest namespace and an authenticated actor", async () => {
 let calls = 0;
 const db = { async query(sql: string, values: unknown[]) { calls++; assert.equal(sql, CLAIM_GUEST_SEARCH_SQL); assert.deepEqual(values, ["user-a", null, "search-id", `guest:${"a".repeat(64)}`]); return {rowCount:1}; } };
 assert.equal(await claimShoppingSearch(db, "search-id", `guest:${"a".repeat(64)}`, {userId:"user-a",companyId:null}), true);
 await assert.rejects(() => claimShoppingSearch(db, "id", "user-b", {userId:"user-a",companyId:null}));
 await assert.rejects(() => claimShoppingSearch(db, "id", `guest:${"a".repeat(64)}`, {userId:`guest:${"b".repeat(64)}`,companyId:null}));
 assert.equal(calls, 1);
 for (const predicate of ["id=$3", "user_id=$4", "company_id IS NULL", "expires_at>now()", "service_kind IS NULL"]) assert.ok(CLAIM_GUEST_SEARCH_SQL.includes(predicate));
});
test("review remains authenticated and origin checked; private routes keep principal", () => {
 const review = readFileSync(new URL("../src/app/api/travel/review/route.ts",import.meta.url),"utf8");
 assert.ok(review.includes("sameOrigin(request)"));
 assert.ok(review.indexOf("await principal(request)") < review.indexOf("await claimGuestSearch(request"));
 for (const route of ["payments/create", "bookings"]) {
  const source=readFileSync(new URL(`../src/app/api/${route}/route.ts`,import.meta.url),"utf8");
  assert.ok(source.includes("principal(request)"));
 }
});

test("search near cookie expiry renews the same owner without orphaning older searches", () => {
 const first=issueShoppingToken(secret,now), late=now+29*60*1000;
 const renewed=renewShoppingToken(first,secret,late);
 assert.equal(shoppingIdentity(renewed,secret,late),shoppingIdentity(first,secret,late));
 assert.equal(shoppingIdentity(first,secret,now+31*60*1000),null);
 assert.ok(shoppingIdentity(renewed,secret,now+43*60*1000));
 assert.equal(shoppingIdentity(renewed,secret,now+59*60*1000),null);
 assert.throws(()=>renewShoppingToken(first,secret,now+31*60*1000));
});
test("IP headers cannot rotate anonymous limits unless trusted and well formed", () => {
 const request=new Request("https://example.test",{headers:{"x-forwarded-for":"198.51.100.1"}});
 assert.equal(shoppingPeer(request),"shared");
 assert.match(shoppingPeer(request,true),/^[a-f0-9]{64}$/);
 assert.notEqual(shoppingPeer(request,true),shoppingPeer(new Request("https://example.test",{headers:{"x-forwarded-for":"198.51.100.2"}}),true));
 for(const value of ["1.2.3.4, 5.6.7.8","spoof","", "127.0.0.1:1234"]){
  assert.equal(shoppingPeer(new Request("https://example.test",{headers:{"x-forwarded-for":value}}),true),"shared");
 }
});
test("cookie rotation cannot bypass shared ceilings and limiter errors fail closed", async () => {
 const calls:unknown[][]=[];
 await enforceShoppingLimits("guest-a","search","shared",async(...args)=>{calls.push(args);});
 assert.deepEqual(calls,[["public-shopping:global","search",120],["public-shopping:peer:shared","search",30],["guest-a","public-shopping:search",12]]);
 const other:unknown[][]=[];
 await enforceShoppingLimits("guest-b","search","shared",async(...args)=>{other.push(args);});
 assert.deepEqual(other.slice(0,2),calls.slice(0,2));
 for(const failAt of [1,2,3]){let count=0;await assert.rejects(()=>enforceShoppingLimits("guest-a","detail","shared",async()=>{if(++count===failAt)throw Error("database or rate limit");}));assert.equal(count,failAt);}
});
test("unavailable owned search has recovery guidance, not an empty-results claim", () => {
 for(const route of ["review","hotel-detail"]){
  const source=readFileSync(new URL(`../src/app/api/travel/${route}/route.ts`,import.meta.url),"utf8");
  assert.ok(source.includes('This search is no longer available in this browser. Search again to continue.'));
 }
});

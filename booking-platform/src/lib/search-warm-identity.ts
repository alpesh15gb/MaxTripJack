import {createHash} from 'node:crypto';
import {getSessionCookie} from 'better-auth/cookies';
import {shoppingCookieToken,shoppingIdentity} from './guest-shopping-identity';
import {shoppingPeer} from './guest-shopping-policy';
import type {WarmActor,WarmScope} from './search-warm-cache';

/** Read-only cookie fingerprint, NOT session authentication. Actual Search still
 * runs normal shoppingAccess before adopting any raw prepared supplier listing.
 * auth.ts uses Better Auth's default cookie names, including secure variants. */
export function readSearchWarmScope(request:Request,actor?:WarmActor):WarmScope{
 const peer=shoppingPeer(request,process.env.PUBLIC_SHOPPING_TRUST_PROXY==='true');
 const cookie=getSessionCookie(request);
 if(cookie)return {actor:actor??null,peer,sessionFingerprint:createHash('sha256').update(cookie).digest('hex')};
 const identity=shoppingIdentity(shoppingCookieToken(request.headers.get('cookie')),process.env.BETTER_AUTH_SECRET??'');
 return {actor:actor??(identity?{userId:identity,companyId:null}:null),peer};
}

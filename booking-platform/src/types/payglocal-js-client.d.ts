declare module 'payglocal-js-client' {
 type Keys={merchantId:string;privateKeyId:string;publicKeyId:string;privateKey:string;publicKey:string};
 export function generateJWEAndJWS(input:Keys&{payload:unknown}):Promise<{jweToken:string;jwsToken:string}>;
 export function generateJWE(input:{payload:unknown;publicKey:string;publicKeyId?:string;merchantId?:string}):Promise<string>;
}
declare module 'payglocal-js-client/src/generateJWS.js' {
 const generateJWS:(input:{payload:string;privateKey:string;merchantId?:string;privateKeyId?:string})=>Promise<string>;
 export default generateJWS;
}

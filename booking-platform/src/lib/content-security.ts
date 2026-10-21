export function contentSecurityPolicy(nonce:string,development=false){
 if(!/^[A-Za-z0-9+/=]+$/.test(nonce))throw Error("Invalid CSP nonce");
 return ["default-src 'self'",`script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://checkout.razorpay.com${development?" 'unsafe-eval'":""}`,"style-src 'self' 'unsafe-inline'","img-src 'self' data: blob: https://images.unsplash.com https://pix8.agoda.net/hotelImages/ https://i.travelapi.com/lodging/ https://*.razorpay.com https://*.razorpay.in","font-src 'self' data:",`connect-src 'self' https://*.razorpay.com https://*.razorpay.in${development?" ws: wss:":""}`,"frame-src https://*.razorpay.com https://*.razorpay.in","object-src 'none'","base-uri 'self'","form-action 'self'","frame-ancestors 'none'"].join("; ");
}

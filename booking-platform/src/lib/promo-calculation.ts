export type PromoRule={product:string;active:boolean;expires_at:string|Date;discount_minor:number|string;discount_basis_points:number;minimum_minor:number|string;maximum_discount_minor:number|string|null};
export function promoDiscount(rule:PromoRule,product:string,total:number,supplier:number,now=Date.now()){
 if(!Number.isSafeInteger(total)||!Number.isSafeInteger(supplier)||supplier<=0||total<supplier)throw Error('This booking is not eligible for a discount.');
 if(!rule.active||!Number.isFinite(new Date(rule.expires_at).getTime())||new Date(rule.expires_at).getTime()<=now)throw Error('This promo code has expired or is inactive.');
 if(rule.product!=='ALL'&&rule.product!==product)throw Error('This promo code does not apply to this service.');
 if(total<Number(rule.minimum_minor))throw Error('The booking does not meet this promo code’s minimum value.');
 const requested=rule.discount_basis_points>0?(BigInt(total)*BigInt(rule.discount_basis_points)+BigInt(5000))/BigInt(10000):BigInt(rule.discount_minor);
 const cap=rule.maximum_discount_minor===null?requested:BigInt(rule.maximum_discount_minor);
 const available=BigInt(total-supplier);
 const discount=[requested,cap,available].reduce((a,b)=>a<b?a:b);
 if(discount<=BigInt(0))throw Error('This promo code has no available discount for this booking.');
 return Number(discount);
}

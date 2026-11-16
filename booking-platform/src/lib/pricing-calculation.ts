export type PricingRule={markup_minor:number|string;markup_basis_points:number;service_fee_minor:number|string;margin_basis_points?:number};
/** Integer paise only; margin excludes payment fees, taxes and other business costs. */
export function customerTotal(base:number,rule?:PricingRule){
 if(!Number.isSafeInteger(base)||base<=0)throw Error('Invalid supplier price');
 if(!rule)return base;
 const fixed=String(rule.markup_minor),fee=String(rule.service_fee_minor),markup=rule.markup_basis_points,margin=rule.margin_basis_points??0;
 if(!/^\d+$/.test(fixed)||!/^\d+$/.test(fee)||!Number.isInteger(markup)||markup<0||markup>10000||!Number.isInteger(margin)||margin<0||margin>9500||(margin>0&&markup>0))throw Error('Invalid pricing rule');
 const cost=BigInt(base),denominator=BigInt(10000-margin);
 const priced=margin>0?(cost*BigInt(10000)+denominator-BigInt(1))/denominator:cost+(cost*BigInt(markup)+BigInt(5000))/BigInt(10000);
 const value=priced+BigInt(fixed)+BigInt(fee);
 if(value>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Invalid customer price');
 return Number(value);
}

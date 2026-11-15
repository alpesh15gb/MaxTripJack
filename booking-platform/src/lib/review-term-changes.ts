export type HotelCancellationComparison={
 /** Server time after the supplier review was received; never the browser clock. */
 observedAt:number;
 refundable:true;
 windows:{from:number;to:number;amount:number}[];
};
export type ReviewTerm={key:string;label:string;value:string|null;display?:string;hotelCancellation?:HotelCancellationComparison};
export type ReviewTermChange={key:string;label:string;before:string;after:string};
const unknown='Not supplied or not comparable';
export function hotelCancellationValue(windows:HotelCancellationComparison['windows']):string {
 return windows.map(row=>`${new Date(row.from).toISOString()} to ${new Date(row.to).toISOString()}: supplier amount ${row.amount} (currency, units and basis unverified)`).join('; ');
}
function comparableCurrentFreeWindow(term:ReviewTerm|undefined):HotelCancellationComparison|null {
 const data=term?.hotelCancellation;
 const instant=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&Math.abs(value)<=8.64e15;
 if(term?.key!=='cancellation'||!data||data.refundable!==true||!instant(data.observedAt)||!Array.isArray(data.windows)||data.windows.length===0||data.windows.length>40)return null;
 // A gap, overlap, malformed or partial schedule must retain exact comparison.
 if(!data.windows.every((row,index)=>row&&instant(row.from)&&instant(row.to)&&row.from<row.to&&typeof row.amount==='number'&&Number.isFinite(row.amount)&&row.amount>=0&&(index===0||row.from===data.windows[index-1].to)))return null;
 const first=data.windows[0];
 if(first.amount!==0||first.from>data.observedAt||data.observedAt>=first.to||hotelCancellationValue(data.windows)!==term.value)return null;
 return data;
}
function sameCurrentHotelTerms(before:ReviewTerm|undefined,after:ReviewTerm|undefined):boolean {
 const old=comparableCurrentFreeWindow(before),next=comparableCurrentFreeWindow(after);
 if(!old||!next||old.observedAt>next.observedAt||old.windows.length!==next.windows.length)return false;
 // Only a forward-moving origin in the first, still-active free window may be
 // ignored. Every future threshold, amount and later start remains exact.
 if(next.windows[0].from<old.windows[0].from||next.observedAt>=old.windows[0].to)return false;
 return old.windows.every((row,index)=>row.to===next.windows[index].to&&row.amount===next.windows[index].amount&&(index===0||row.from===next.windows[index].from));
}
export function compareReviewedTerms(before:ReviewTerm[]|undefined,after:ReviewTerm[]|undefined):ReviewTermChange[]{
 const previous=new Map((before??[]).slice(0,120).map(row=>[row.key,row]));
 const latest=new Map((after??[]).slice(0,120).map(row=>[row.key,row]));
 return [...new Set([...previous.keys(),...latest.keys()])].flatMap(key=>{
  const old=previous.get(key),next=latest.get(key),a=old?.value??null,b=next?.value??null;
  return a===b||sameCurrentHotelTerms(old,next)?[]:[{key,label:next?.label??old!.label,before:a===null?unknown:old?.display??a,after:b===null?unknown:next?.display??b}];
 });
}

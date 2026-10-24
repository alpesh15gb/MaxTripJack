export type ReviewTerm={key:string;label:string;value:string|null};
export type ReviewTermChange={key:string;label:string;before:string;after:string};
const unknown='Not supplied or not comparable';
export function compareReviewedTerms(before:ReviewTerm[]|undefined,after:ReviewTerm[]|undefined):ReviewTermChange[]{
 const previous=new Map((before??[]).slice(0,120).map(row=>[row.key,row]));
 const latest=new Map((after??[]).slice(0,120).map(row=>[row.key,row]));
 return [...new Set([...previous.keys(),...latest.keys()])].flatMap(key=>{
  const old=previous.get(key),next=latest.get(key),a=old?.value??null,b=next?.value??null;
  return a===b?[]:[{key,label:next?.label??old!.label,before:a??unknown,after:b??unknown}];
 });
}

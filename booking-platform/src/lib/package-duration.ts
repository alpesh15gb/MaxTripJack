/** Display copy only; package duration validation remains in its existing schema. */
export function packageDurationLabel(count:number,unit:'day'|'night'):string {
 return `${count} ${unit}${count===1?'':'s'}`;
}

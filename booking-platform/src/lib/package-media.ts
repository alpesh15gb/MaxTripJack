/** Public package media identifiers only. Never accepts URLs or private document IDs. */
export const PACKAGE_MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function packageMediaId(value:unknown):string|null {
  if(typeof value!=='string')return null;
  const prefix='/api/public/package-media/';
  if(!value.startsWith(prefix))return null;
  const id=value.slice(prefix.length);return PACKAGE_MEDIA_ID.test(id)?id:null;
}
export function packageMediaPath(value:unknown):string|null {
  const id=packageMediaId(value);return id?`/api/package-media/${id}`:null;
}

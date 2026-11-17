import type {HotelPropertyDetails} from './hotel-presentation';

/** Static metadata can be partial. Preserve actual listing facts wherever the
 * metadata has no value; an empty gallery/list is not a deletion instruction. */
export function mergeHotelPropertyDetails(metadata:HotelPropertyDetails|undefined,listing:HotelPropertyDetails|undefined):HotelPropertyDetails{
 const supplied=Object.fromEntries(Object.entries(metadata??{}).filter(([,value])=>value!==undefined));
 return {...listing,...supplied,
  amenities:metadata?.amenities.length?metadata.amenities:listing?.amenities??[],
  ...(metadata?.photos?.length?{photos:metadata.photos}:listing?.photos?.length?{photos:listing.photos}:{}),
 };
}

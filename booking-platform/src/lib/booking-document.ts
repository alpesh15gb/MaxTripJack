import { reportInrDecimal } from './booking-report-csv';
import { database } from '@/lib/db';
import { unseal } from '@/lib/vault';
import { HttpError } from '@/lib/http';
import {voucherLayout,voucherDate} from './booking-document-layout';
import {hotelObject,hotelText,hotelRoomInfo,hotelStringList} from './hotel-presentation';
import {policyText} from './public-supplier-policy';
import {hotelCancellationTimeline} from './hotel-cancellation-timeline';

type Guest={roomIndex?:number;ti?:string;fN?:string;lN?:string;pt?:string};
const guestName=(t:Guest)=>[t.ti,t.fN,t.lN].filter(Boolean).join(' ')||'Guest name not provided';

export async function bookingDocument(id:string){
 const order=(await database().query('SELECT * FROM orders WHERE id=$1',[id])).rows[0];
 if(!order)throw new HttpError(404,'Booking not found.');
 if(!['TICKETED','CONFIRMED','CANCELLED'].includes(order.status))throw new HttpError(409,'Confirmation is available after the supplier confirms the booking.');
 const record=await database().query('SELECT encrypted_payload FROM supplier_booking_payloads WHERE order_id=$1',[id]);
 const supplier=record.rows[0]?unseal(record.rows[0].encrypted_payload,id):{};
 const guests=unseal(order.guests_encrypted,id);
 const travellers:Guest[]=guests.travellers??[];
 const quote=(await database().query('SELECT review,service_payload FROM supplier_quotes WHERE id=$1',[order.quote_id])).rows[0];
 const option=hotelObject(hotelObject(quote?.review).option);
 const hotel=order.product==='HOTEL',cancelled=order.status==='CANCELLED';
 const title=cancelled?'Cancelled booking record':order.service_kind==='ANCILLARY'?'Flight extras confirmation':order.service_kind==='REISSUE'?'Replacement flight confirmation':hotel?'Hotel confirmation voucher':'Booking confirmation';
 const {doc,paragraph:p,section,facts,row,finish}=voucherLayout(order.reference,title,order.created_at);
 const chunks:Buffer[]=[];
 const done=new Promise<Buffer>((resolve,reject)=>{doc.on('data',chunk=>chunks.push(Buffer.from(chunk)));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 p(cancelled?'BOOKING CANCELLED':order.status==='TICKETED'?'FLIGHT TICKETED':'BOOKING CONFIRMED',{bold:true,size:10,color:cancelled?'#a33232':'#006756'});
 if(cancelled)p('This booking is cancelled. This record is not valid for travel and does not confirm that a refund has completed.',{bold:true});
 const criteria=order.itinerary_summary??{};
 p(hotel?hotelText(supplier.itemInfos?.HOTEL?.hInfo?.name)||'Your hotel stay':order.service_kind==='ANCILLARY'?'Your flight extras':'Your flight itinerary',{bold:true,size:21});
 row('Booking reference',order.reference);
 row('Supplier reference',order.supplier_booking_id||'Not provided - contact support');
 row('Booked on',new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(order.created_at)));
 if(hotel){
  section('Your stay');
  const nights=(Date.parse(criteria.checkOut)-Date.parse(criteria.checkIn))/86400000;
  facts([{label:'Check-in',value:voucherDate(criteria.checkIn)},{label:'Check-out',value:voucherDate(criteria.checkOut)},{label:'Duration',value:Number.isInteger(nights)&&nights>0?`${nights} night${nights===1?'':'s'}`:'See stay dates'}]);
  p('Check-in and check-out times are subject to the hotel\'s policy. Contact the hotel or MaxTravel to confirm arrival arrangements.',{size:9,color:'#577076'});
 }else{
  section('Journey details');
  const legs=Array.isArray(criteria.legs)?criteria.legs:[{from:criteria.from,to:criteria.to,date:criteria.date},...(criteria.returnDate?[{from:criteria.to,to:criteria.from,date:criteria.returnDate}]:[])];
  for(const [i,leg] of legs.entries())row(`Journey ${i+1}`,`${leg.from||'Origin not provided'} to ${leg.to||'Destination not provided'} | ${voucherDate(leg.date)}`);
 }
 section(hotel?'Guests & room details':'Travellers');
 for(const t of travellers)row(hotel?(Number.isInteger(t.roomIndex)?`Room ${t.roomIndex!+1}`:'Guest'):'Passenger',`${guestName(t)}${t.pt?` (${t.pt})`:''}`);
 if(!travellers.length)p('Guest details are not available in this record. Contact support.');
 if(hotel){
  const rooms=hotelRoomInfo(option.roomInfo);
  if(rooms.length)row('Booked room category',rooms.map(r=>r.name).join(' / '));
  if(hotelText(option.mealBasis))row('Meal plan',hotelText(option.mealBasis)!);
  const inclusions=hotelStringList(option.inclusions);
  if(inclusions.length){section('Included with your rate');for(const inclusion of inclusions)p(inclusion);}
 }
 section('Booking total');
 p(`Booking amount: INR ${reportInrDecimal(String(order.total_minor))}`,{bold:true,size:17});
 p(hotel?'Total recorded for this booking. Any charges payable directly at the property or for additional services are governed by the booked rate and supplier policies.':'Total recorded for this booking. Additional services and changes are subject to airline and supplier policies.',{size:9,color:'#577076'});
 if(order.service_kind){
  section('Flight service details');const service=quote?.service_payload;
  row('Original supplier booking',service?.oldBookingId??'Contact support');
  for(const extra of service?.summary??[])p(`${extra.segment} | ${extra.passenger} | ${extra.kind}: ${extra.label}`);
 }
 if(criteria.checkoutExtras?.length){section('Flight extras included');for(const extra of criteria.checkoutExtras){const guest=travellers[extra.travellerIndex];p(`${extra.segment} | ${guest?guestName(guest):`Traveller ${extra.travellerIndex+1}`} | ${extra.kind}: ${extra.label}`);}}
 const identifiers=new Set<string>();
 function visit(value:unknown){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(visit);return;}const obj=value as Record<string,unknown>;for(const field of ['pnrDetails','ticketNumberDetails']){const detail=obj[field];if(detail&&typeof detail==='object')for(const v of Object.values(detail))if(typeof v==='string')identifiers.add(`${field==='pnrDetails'?'PNR':'Ticket'}: ${v}`);}Object.values(obj).forEach(visit);}
 visit(supplier);
 if(identifiers.size){section('Supplier confirmation');identifiers.forEach(v=>p(v));}
 if(hotel){
  section('Cancellation policy');
  p('Saved with your booked rate. All cancellation-window times below are in India time (IST). Check My Trips for a current cancellation quote before cancelling.',{size:9,color:'#577076'});
  const timeline=hotelCancellationTimeline(option.cancellation);
  if(timeline)for(const window of timeline){p(`${window.from} to ${window.until}`,{bold:true,size:9});p(window.charge,{size:9});}
  const raw=hotelObject(option.cancellation);
  if(raw.isRefundable===false)p('The supplier identifies this rate as non-refundable.',{bold:true,size:9});
  const notes=[...new Set([policyText(option.cancellation),policyText(raw.policyText),policyText(raw.policy),policyText(raw.cancellation)].filter((v):v is string=>Boolean(v)))];
  for(const note of notes)p(note,{size:9});
  if(!timeline&&!notes.length)p('Detailed cancellation terms are not available in this booking record. Contact MaxTravel before requesting cancellation; a free cancellation entitlement is not implied.',{size:9});
  const bookingNotes=policyText(option.bookingNotes);
  if(bookingNotes){section('Hotel & rate conditions');p(bookingNotes,{size:9});}
 }
 const replacements=await database().query("SELECT reference,status FROM orders WHERE parent_order_id=$1 AND service_kind='REISSUE'",[id]);
 if(replacements.rows.length)section('Replacement bookings');
 for(const changed of replacements.rows)p(`Replacement flight ${changed.reference}: ${changed.status}. If ticketed, use the replacement ticket for the changed travel. This original document is not valid for replaced segments.`);
 const cancellations=await database().query("SELECT scope,is_partial,refund_offer_minor::text FROM cancellation_requests WHERE order_id=$1 AND status='CONFIRMED'",[id]);
 if(cancellations.rowCount){section('Confirmed cancellations');for(const c of cancellations.rows){p(c.is_partial?'Partial cancellation confirmed for the travellers and segments below.':'Remaining booking cancelled.');for(const trip of c.scope?.trips??[])p(`${trip.src} to ${trip.dest} (${trip.departureDate}): ${trip.travellers.map((t:{fn:string;ln:string})=>`${t.fn} ${t.ln}`).join(', ')}`);p(c.refund_offer_minor==null?'Agreed refund amount unavailable in this record; check My Trips for current refund details.':`Agreed refund: INR ${reportInrDecimal(String(c.refund_offer_minor))}; check My Trips for gateway progress.`);}}
 section(cancelled?'About this cancelled record':hotel?'Before you check in':'Before you travel');
 p(cancelled?'Do not use this document for travel. Check My Trips for cancellation and refund updates, or contact MaxTravel quoting your booking reference.':hotel?'Keep this voucher handy at check-in and carry valid identification for every guest. For late arrival, special requests or changes to your stay, contact support in advance.':'Carry valid identification and check your airline\'s departure, baggage and check-in requirements. Check My Trips for the current booking and cancellation status.',{size:9});
 finish();const pdf=await done;
 return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${String(order.reference).replace(/[^A-Za-z0-9-]/g,'')}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}

import type {Search} from './providers/contracts';
import {HttpError} from './http';
export function validateSearchCriteria(criteria:Search){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const start=criteria.product==='FLIGHT'?criteria.date:criteria.checkIn;
 if(start<today)throw new HttpError(400,'Travel date must not be in the past.');
 if(criteria.product==='FLIGHT'&&criteria.from===criteria.to)throw new HttpError(400,'Choose different airports.');
 if(criteria.product==='FLIGHT'&&criteria.returnDate&&criteria.returnDate<criteria.date)throw new HttpError(400,'Return date must not precede departure.');
 if(criteria.product==='HOTEL'&&criteria.checkOut<=criteria.checkIn)throw new HttpError(400,'Check-out must follow check-in.');
}

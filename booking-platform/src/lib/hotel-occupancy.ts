export type DraftHotelRoom={adults:number;childAge:(number|'')[]};
/** Blank is an unanswered question, not an infant aged zero. */
export function completeHotelRooms(rooms:DraftHotelRoom[]){
 if(rooms.some(room=>room.childAge.some(age=>age===''||!Number.isInteger(age)||age<0||age>17)))throw Error('Enter an age at check-in for every child. Age 0 is valid for an infant.');
 return rooms.map(room=>({adults:room.adults,children:room.childAge.length,childAge:room.childAge.map(Number)}));
}

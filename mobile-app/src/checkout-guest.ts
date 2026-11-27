import type { Guest } from "./booking-state.ts";

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function calendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function checkedContactPhone(value: string): string {
  const phone = value.trim().replace(/[ ()-]/g, "");
  if (!/^(?:[6-9]\d{9}|\+[1-9]\d{7,14})$/.test(phone) || phone.startsWith("+91") && !/^\+91[6-9]\d{9}$/.test(phone)) {
    throw Error("Enter a 10-digit Indian mobile number or include the international country code.");
  }
  return phone;
}

export function checkCheckoutGuests(
  guests: readonly Guest[],
  review: unknown,
  departure: string,
  lastTravelDate: string,
  gst: { number: string; name: string; address: string },
  emergency: { name: string; email: string; phone: string },
): void {
  if (!guests.length) throw Error("Enter your traveller details before paying.");
  const reviewed = fields(review);
  const conditions = fields(reviewed.conditions);
  const compliance = fields(fields(reviewed.option).compliance);
  const passport = fields(conditions.pcs);
  const birth = fields(conditions.dob);
  const passportRequired = Boolean(passport.pm || compliance.passportRequired);
  const primaryGuest = guests.findIndex(guest => guest.pt === "ADULT" && (guest.roomIndex ?? 0) === 0);
  for (const [index, guest] of guests.entries()) {
    const label = `Traveller ${index + 1}`;
    if (![guest.fN, guest.lN].every(name => name.trim().length >= 1 && name.trim().length <= 80)) {
      throw Error(`${label}: enter a first and last name, up to 80 characters each.`);
    }
    if ((guest.pt !== "ADULT" || birth.adobr || guest.dob) &&
        (!guest.dob || !calendarDate(guest.dob) || guest.dob >= departure)) {
      throw Error(`${label}: enter a valid date of birth before departure.`);
    }
    if ((passportRequired || guest.pNum) && (!guest.pNum || guest.pNum.length < 4 || guest.pNum.length > 30)) {
      throw Error(`${label}: enter a passport number with 4–30 characters.`);
    }
    if ((passportRequired || guest.pNat) && (!guest.pNat || !/^[A-Z]{2}$/.test(guest.pNat))) {
      throw Error(`${label}: enter a two-letter passport nationality code, such as IN.`);
    }
    if ((passportRequired || passport.pped || guest.eD) &&
        (!guest.eD || !calendarDate(guest.eD) || guest.eD <= lastTravelDate)) {
      throw Error(`${label}: enter a valid passport expiry after the final travel date.`);
    }
    const requiresPan = guest.pt === "ADULT" && (conditions.ipa === true || compliance.panRequired === true && index === primaryGuest);
    if ((requiresPan || guest.pan) && (!guest.pan || !/^[A-Z]{5}\d{4}[A-Z]$/.test(guest.pan))) {
      throw Error(`${label}: enter PAN in the format ABCDE1234F.`);
    }
  }
  if ((Object.values(gst).some(Boolean) || fields(conditions.gst).igm || ["PASSTHROUGH", "RESELLER"].includes(String(compliance.gstType))) &&
      (gst.number.length !== 15 || !gst.name || gst.name.length > 35 || gst.address.length > 70)) {
    throw Error("Enter the 15-character GSTIN and registered business name. Use up to 70 characters for the billing address.");
  }
  if ((conditions.iecr || Object.values(emergency).some(Boolean)) &&
      (!emergency.name || emergency.name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emergency.email) ||
        emergency.phone.length < 10 || emergency.phone.length > 20)) {
    throw Error("Complete the emergency contact name, email and phone number.");
  }
}

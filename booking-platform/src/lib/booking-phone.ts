import {getCountries, getCountryCallingCode, parsePhoneNumberFromString} from 'libphonenumber-js/min';

export function bookingPhoneParts(input: string) {
  const value = input.trim();
  if (/^[6-9]\d{9}$/.test(value)) return {code: '+91', national: value, international: `+91${value}`};
  if (!/^\+[1-9]\d{7,14}$/.test(value)) return null;
  const phone = parsePhoneNumberFromString(value, {extract: false});
  if (!phone?.isPossible() || phone.number !== value) return null;
  if (phone.countryCallingCode === '91' && !/^[6-9]\d{9}$/.test(phone.nationalNumber)) return null;
  return {code: `+${phone.countryCallingCode}`, national: phone.nationalNumber, international: phone.number};
}

export function bookingPhoneFromFields(phone: string, code: string) {
  if (!/^[+\d ()-]+$/.test(phone)) return phone.trim();
  const value = phone.replace(/[ ()-]/g, '');
  if (value.startsWith('+') || !code || code === '+91') return value;
  // An invalid local number must not be reinterpreted as an Indian shorthand.
  const formatted = /^\+[1-9]\d{0,2}$/.test(code) ? parsePhoneNumberFromString(`${code}${value}`, {extract: false}) : undefined;
  return formatted && `+${formatted.countryCallingCode}` === code ? formatted.number : `${code}${value}`;
}

export function bookingCallingCodes() {
  const names = new Intl.DisplayNames('en-IN', {type: 'region'});
  const groups = new Map<string, string[]>();
  for (const country of getCountries()) {
    const code = `+${getCountryCallingCode(country)}`;
    const name = names.of(country) ?? country;
    groups.set(code, [...(groups.get(code) ?? []), name]);
  }
  return Array.from(groups, ([code, countries]) => ({code, label: `${code} · ${countries.slice(0, 2).join(', ')}${countries.length > 2 ? ' and others' : ''}`}))
    .sort((a, b) => Number(a.code) - Number(b.code));
}

/**
 * Public business facts confirmed by the owner on 2026-10-20.
 * Hours were explicitly confirmed as every day, 09:00–21:00 India time.
 * Do not add legal identity, coordinates, accreditation, reviews or an office
 * photo until the owner supplies evidence. The public Maps listing was matched
 * to the confirmed address and phone; its Sunday hours conflict with owner hours.
 */
export const businessProfile = {
  name: "MaxTravel",
  locationName: "MaxTravel Secunderabad",
  website: "https://maxtravel.in",
  positioning: "Competitive online travel prices. Real people. A real office. Reliable booking support.",
  phone: "+91 7095-018-018",
  phoneE164: "+917095018018",
  phoneHref: "tel:+917095018018",
  whatsappHref: "https://wa.me/917095018018",
  email: "max@maxtravel.us",
  emailHref: "mailto:max@maxtravel.us",
  address: {
    streetAddress: "G-10, Golden Hawk, Beside SBI, 1-8-208, Jogani, Ramgopalpet",
    addressLocality: "Secunderabad",
    addressRegion: "Telangana",
    postalCode: "500003",
    addressCountry: "IN",
    display: "G-10, Golden Hawk, Beside SBI, 1-8-208, Jogani, Ramgopalpet, Secunderabad – 500003, India",
  },
  hours: {
    display: "Every day, 9:00 am–9:00 pm (India time)",
    timezone: "Asia/Kolkata",
    opens: "09:00",
    closes: "21:00",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  },
  socialProfiles: [
    { label: "Facebook", href: "https://www.facebook.com/maxtravel.us" },
    { label: "Instagram", href: "https://www.instagram.com/maxtravel.us" },
  ],
  verifiedAt: "2026-10-20",
  verification: "Owner-confirmed identity, address, contacts, social profiles and daily hours. Public Maps identity matched by phone and address; listing Sunday hours differ. No independent legal-registration verification.",
  mapsHref: "https://www.google.com/maps/place/Max+Travel/@17.4400707,78.4834387,17z/data=!3m1!4b1!4m6!3m5!1s0x3bcb9b7780ab1f39:0x84c9754247eefedd!8m2!3d17.4400707!4d78.4834387!16s%2Fg%2F11wjp24tcq",
} as const;

export const officeDirectionsHref = businessProfile.mapsHref;

/** One visible business identity, not fictitious parent/subsidiary entities. */
export function businessStructuredData(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "TravelAgency"],
    "@id": `${businessProfile.website}/#organization`,
    name: businessProfile.name,
    url: businessProfile.website,
    telephone: businessProfile.phoneE164,
    email: businessProfile.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: businessProfile.address.streetAddress,
      addressLocality: businessProfile.address.addressLocality,
      addressRegion: businessProfile.address.addressRegion,
      postalCode: businessProfile.address.postalCode,
      addressCountry: businessProfile.address.addressCountry,
    },
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: businessProfile.hours.days.map(day => `https://schema.org/${day}`),
      opens: businessProfile.hours.opens,
      closes: businessProfile.hours.closes,
    },
    hasMap: businessProfile.mapsHref,
    sameAs: [...businessProfile.socialProfiles.map(profile => profile.href), businessProfile.mapsHref],
  };
}

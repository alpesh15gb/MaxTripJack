import type { Flight, FlightSegment } from './booking-presentation';

export const flightAlliances = [
  ['star-alliance', 'Star Alliance'],
  ['oneworld', 'oneworld'],
  ['skyteam', 'SkyTeam'],
] as const;

export type FlightAlliance = typeof flightAlliances[number][0];

/**
 * Active member carriers and their IATA designators, verified 2026-11-28.
 * IATA designators: https://www.iata.org/en/about/members/airline-list/
 * Star Alliance roster: https://newsroom.lufthansagroup.com/en/asiana-airlines-to-exit-star-alliance/
 * oneworld roster: https://www.oneworld.com/members
 * Hawaiian membership: https://www.oneworld.com/news/oneworld-welcomes-hawaiian-airlines
 * Alaska/Hawaiian use AS for current flights: https://www.hawaiianairlines.com/content/hawaiian-is-here-to-stay
 * SkyTeam roster: https://www.flysas.com/gb-en/about-us/skyteam
 *
 * Future members, suspended members, affiliates and connecting partners are excluded.
 */
const memberCodes: Record<FlightAlliance, readonly string[]> = {
  'star-alliance': [
    'A3', 'AC', 'AI', 'AV', 'AZ', 'BR', 'CA', 'CM', 'ET', 'LH', 'LO', 'LX', 'MS',
    'NH', 'NZ', 'OS', 'OU', 'OZ', 'SA', 'SN', 'SQ', 'TG', 'TK', 'TP', 'UA', 'ZH',
  ],
  oneworld: [
    'AA', 'AS', 'AT', 'AY', 'BA', 'CX', 'FJ', 'HA', 'IB', 'JL', 'MH', 'QF', 'QR', 'RJ', 'UL', 'WY',
  ],
  skyteam: [
    'AF', 'AM', 'AR', 'CI', 'DL', 'GA', 'KE', 'KL', 'KQ', 'ME', 'MF', 'MU',
    'RO', 'SK', 'SV', 'UX', 'VN', 'VS',
  ],
};

const allianceByCarrier = new Map(
  flightAlliances.flatMap(([alliance]) => memberCodes[alliance].map(code => [code, alliance] as const)),
);

const membershipDateLimits = new Map<string, {starts?: string; endsBefore?: string}>([
  // https://business.lufthansagroup.com/it/en/program/experts/news/ita-airways-is-now-part-of-star-alliance.html
  ['AZ', {starts: '2026-04-01'}],
  // https://newsroom.lufthansagroup.com/en/asiana-airlines-to-exit-star-alliance/
  ['OZ', {endsBefore: '2026-12-17'}],
]);

function segmentAlliance(segment: FlightSegment): FlightAlliance | undefined {
  const suppliedCode = segment.fD.aI.code;
  if (typeof suppliedCode !== 'string') return undefined;
  const code = suppliedCode.trim().toUpperCase();
  const alliance = allianceByCarrier.get(code);
  const limits = membershipDateLimits.get(code);
  if (!limits) return alliance;

  const date = typeof segment.dt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(segment.dt) ? segment.dt.slice(0,10) : '';
  const midnight = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0,10) !== date) return undefined;
  if (limits.starts && date < limits.starts || limits.endsBefore && date >= limits.endsBefore) return undefined;
  return alliance;
}

/** A match requires the listed carrier on every segment to belong to the same alliance. */
export function flightAlliance(flight: Flight): FlightAlliance | undefined {
  const first = flight.sI[0];
  const alliance = first && segmentAlliance(first);
  return alliance && flight.sI.slice(1).every(segment => segmentAlliance(segment) === alliance) ? alliance : undefined;
}

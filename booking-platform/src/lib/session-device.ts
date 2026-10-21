/** A convenience label from the reported user-agent, not verified device identity. */
export function sessionDevice(userAgent?: string | null): string {
  if (!userAgent) return 'Unknown browser or device';
  const browser = /Edg\//.test(userAgent) ? 'Microsoft Edge' : /OPR\//.test(userAgent) ? 'Opera' : /(?:Firefox|FxiOS)\//.test(userAgent) ? 'Firefox' : /(?:Chrome|CriOS)\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Browser';
  const device = /iPhone/.test(userAgent) ? 'iPhone' : /iPad/.test(userAgent) ? 'iPad' : /Android/.test(userAgent) ? 'Android' : /Windows/.test(userAgent) ? 'Windows' : /Macintosh|Mac OS X/.test(userAgent) ? 'Mac' : /Linux/.test(userAgent) ? 'Linux' : '';
  return device ? `${browser} on ${device}` : browser;
}
export function sessionStarted(value: string | Date): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(date)+' IST' : 'Date unavailable';
}

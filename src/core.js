export const MAX_TEXT = { name: 80, email: 254, title: 100, location: 120, notes: 800, group: 80 };
export const ROLES = ['trainer', 'member'];
export const STATUSES = ['yes', 'no', 'maybe'];

export class HttpError extends Error {
  constructor(status, message) { super(message); this.name = 'HttpError'; this.status = status; }
}
export function textField(value, label, max, required = true) {
  if (typeof value !== 'string') throw new HttpError(400, `${label} muss Text sein.`);
  const cleaned = value.trim().replace(/[\u0000-\u001F\u007F]/g, ' ');
  if ((required && !cleaned) || cleaned.length > max) throw new HttpError(400, `${label} muss 1 bis ${max} Zeichen enthalten.`);
  return cleaned;
}
export function validEmail(value) {
  const email = textField(value, 'E-Mail', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Ungültige E-Mail-Adresse.');
  return email;
}
export function validPassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 256) throw new HttpError(400, 'Passwort: mindestens 12 Zeichen, höchstens 256.');
  return value;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString()!==value)
    throw new HttpError(400, 'Ungültiger Termin (ISO 8601 UTC benötigt).');
  return value;
}
export function validStatus(value) {
  if (!STATUSES.includes(value)) throw new HttpError(400, 'Ungültiger Teilnahmestatus.');
  return value;
}
export function safeEqual(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Fixed length SHA-256 hex digests; avoid early return on matching prefix.
  if (a.length !== b.length) return false;
  let mismatch=0;
  for (let i=0;i<a.length;i++) mismatch |= a.charCodeAt(i)^b.charCodeAt(i);
  return mismatch === 0;
}
export function publicUser(user) { return {id:user.id,name:user.name,email:user.email}; }
export function formatEvent(row, showCounts=false) {
  const result = {id:row.id,groupId:row.group_id,title:row.title,startAt:row.start_at,location:row.location,notes:row.notes,myResponse:row.my_status||null};
  if(row.capacity!==undefined)Object.assign(result,{capacity:row.capacity,seriesId:row.series_id,myBookingState:row.my_booking_state||null,confirmedCount:Number(row.confirmed_count||0),waitlistCount:Number(row.waitlist_count||0)});
  if(showCounts) result.counts = {yes:Number(row.yes_count||0),no:Number(row.no_count||0),maybe:Number(row.maybe_count||0)};
  return result;
}

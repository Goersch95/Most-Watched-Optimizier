/**
 * Fixes Sende-Raster für "SEN in 90 Sekunden": Mo-Fr 5x/Tag, Sa+So 2x/Tag.
 * Dient nur zur Gruppierung (welcher Slot liegt am nächsten an T1), nicht
 * zur Berechnung von T1 selbst - das kommt aus dem CMS.
 */
const WEEKDAY_SLOTS = ['07:00', '09:00', '12:00', '15:00', '18:00'];
const WEEKEND_SLOTS = ['10:00', '15:00'];

const WEEKDAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/**
 * ISO-Timestamps aus dem CMS (z. B. "2026-07-22T09:59:30") kommen ohne
 * Zeitzonen-Suffix. Um TZ-Verschiebungen durch `new Date(...)` zu vermeiden,
 * wird Datum/Uhrzeit direkt aus dem String gelesen statt geparst - der
 * Wochentag wird über UTC-Arithmetik aus dem Datumsteil bestimmt.
 */
function getWeekdayIndex(iso: string): number {
  const [datePart] = iso.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function getMinutesOfDay(iso: string): number {
  const timePart = iso.split('T')[1] ?? '00:00:00';
  const [hours, minutes] = timePart.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

export function classifySlot(iso: string): { weekday: string; slot: string } {
  const weekdayIndex = getWeekdayIndex(iso);
  const isWeekend = weekdayIndex === 0 || weekdayIndex === 6;
  const schedule = isWeekend ? WEEKEND_SLOTS : WEEKDAY_SLOTS;
  const minutesOfDay = getMinutesOfDay(iso);

  let nearestSlot = schedule[0];
  let smallestDiff = Infinity;
  for (const slot of schedule) {
    const diff = Math.abs(toMinutes(slot) - minutesOfDay);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      nearestSlot = slot;
    }
  }

  return { weekday: WEEKDAY_NAMES[weekdayIndex], slot: nearestSlot };
}

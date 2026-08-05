/**
 * Fixes Sende-Raster für "SEN in 90 Sekunden": Mo-Fr 5x/Tag, Sa+So 2x/Tag.
 * Dient nur zur Gruppierung (welcher Slot liegt am nächsten an T1), nicht
 * zur Berechnung von T1 selbst - das kommt aus dem CMS.
 */
const WEEKDAY_SLOTS = ['07:00', '09:00', '12:00', '15:00', '18:00'];
const WEEKEND_SLOTS = ['10:00', '15:00'];

const WEEKDAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const SHORT_WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const TIMEZONE = 'Europe/Vienna';

/**
 * CMS-Timestamps kommen als UTC ("...T04:55:00Z"), das Sende-Raster ist aber
 * in Wiener Lokalzeit gedacht (07:00 Uhr usw.). Ohne echte TZ-Konvertierung
 * (inkl. Sommer-/Winterzeit) würde die Slot-Zuordnung je nach Jahreszeit bis
 * zu 2h danebenliegen. Timestamps ohne Zeitzonen-Suffix werden explizit als
 * UTC behandelt (nicht host-abhängig lokal), da bislang alle echten
 * CMS-Werte (`play_start`) mit "Z" kommen.
 */
function toDate(iso: string): Date {
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(iso);
  return new Date(hasTimezone ? iso : `${iso}Z`);
}

function getViennaParts(iso: string): { weekdayIndex: number; minutesOfDay: number } {
  const date = toDate(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const weekdayShort = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');

  return {
    weekdayIndex: SHORT_WEEKDAY_TO_INDEX[weekdayShort] ?? 0,
    minutesOfDay: hour * 60 + minute,
  };
}

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

export function classifySlot(iso: string): { weekday: string; slot: string } {
  const { weekdayIndex, minutesOfDay } = getViennaParts(iso);
  const isWeekend = weekdayIndex === 0 || weekdayIndex === 6;
  const schedule = isWeekend ? WEEKEND_SLOTS : WEEKDAY_SLOTS;

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

/** Für die UI-Tabelle: Wiener Lokalzeit statt der rohen UTC-Timestamps. */
export function formatViennaDateTime(iso: string): string {
  const date = toDate(iso);
  return new Intl.DateTimeFormat('de-AT', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

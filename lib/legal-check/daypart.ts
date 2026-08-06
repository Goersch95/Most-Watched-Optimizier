import type { Daypart } from './types';

const TIMEZONE = 'Europe/Vienna';

/**
 * Gleiche Herangehensweise wie bei der Slot-Klassifizierung im
 * Indexierungs-Checker: API-Timestamps sind UTC, PRIME-TIME/LATE-PRIME sind
 * aber in Wiener Lokalzeit gedacht - explizite Zeitzonen-Konvertierung statt
 * naivem String-Parsing (sonst falsch je nach Sommer-/Winterzeit).
 */
function getViennaHour(iso: string): number {
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(iso);
  const date = new Date(hasTimezone ? iso : `${iso}Z`);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
}

/** PRIME-TIME: 20-22 Uhr, LATE-PRIME: 22-24 Uhr (jeweils Wiener Lokalzeit, start_time der API). */
export function classifyDaypart(startTime: string | null): Daypart {
  if (!startTime) return null;

  const hour = getViennaHour(startTime);
  if (hour >= 20 && hour < 22) return 'PRIME-TIME';
  if (hour >= 22 && hour < 24) return 'LATE-PRIME';
  return null;
}

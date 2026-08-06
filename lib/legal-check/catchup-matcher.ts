export type CatchUpParseResult =
  | { kind: 'no_vod' }
  | { kind: 'unlimited' }
  | { kind: 'days'; days: number }
  | { kind: 'fixed_date'; date: string } // YYYY-MM-DD
  | { kind: 'unparseable'; reason: string };

/**
 * Bestätigte Regeln:
 * - Zahlen (auch "N Tage"/"N Jahre") = Tage.
 * - Datumswerte (auch mit "bis "-Präfix) = erwartetes vod_rights.end.
 * - "kein VoD" (+ Schreibvarianten) = API sollte keine aktiven vod_rights haben.
 * - "unbegrenzt": nicht abgefragt, eigene Annahme (siehe compare.ts).
 * - Alles andere (x, *, no rights, Einmalig, "?"-markierte Unsicherheiten,
 *   Spalten-Verrutscher wie "GST" oder "[Main]") -> nicht auswertbar, wird
 *   nicht geraten.
 */
export function parseCatchUp(raw: string): CatchUpParseResult {
  const value = raw.trim();

  if (value === '') return { kind: 'unparseable', reason: 'Leerer Wert' };
  if (value.includes('?')) return { kind: 'unparseable', reason: `Unsichere Angabe: "${raw}"` };

  const lower = value.toLowerCase();

  if (lower === 'kein vod' || lower === 'kei vod' || lower === 'kein vod.') {
    return { kind: 'no_vod' };
  }
  if (lower === 'unbegrenzt') {
    return { kind: 'unlimited' };
  }

  const dateMatch = value.match(/^(?:bis\s+)?(\d{1,2})\.(\d{1,2})\.(\d{4})$/i);
  if (dateMatch) {
    const [, d, m, y] = dateMatch;
    return { kind: 'fixed_date', date: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` };
  }

  const yearsMatch = lower.match(/^(\d+)\s*jahre?$/);
  if (yearsMatch) {
    return { kind: 'days', days: Number(yearsMatch[1]) * 365 };
  }

  const daysMatch = lower.match(/^(\d+)\s*tage?$/);
  if (daysMatch) {
    return { kind: 'days', days: Number(daysMatch[1]) };
  }

  if (/^\d+$/.test(value)) {
    return { kind: 'days', days: Number(value) };
  }

  return { kind: 'unparseable', reason: `Unbekannter CatchUp-Wert: "${raw}"` };
}

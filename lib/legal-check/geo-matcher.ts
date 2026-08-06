/**
 * Bestätigte Regeln (siehe Rückfragen mit dem Team):
 * - GEO-REST. ist eine Freigabeliste (verfügbare Länder), das API-Feld
 *   "geoblocking" ist eine Sperrliste.
 * - Für alle Werte außer "GST" gilt: Sperrliste = Universe minus verfügbare
 *   Länder, Universe = {Deutschland, Österreich, Schweiz, Liechtenstein,
 *   Luxemburg}. Alto Adige/AA wird wie Österreich behandelt.
 * - "GST" ist die eine bestätigte Ausnahme mit fester Sperrliste ["Spain"]
 *   (folgt nicht der Universe-Formel).
 * - Leer/"unbegrenzt"/"weltweit" = keine Sperre.
 */
const UNIVERSE = ['Germany', 'Austria', 'Switzerland', 'Liechtenstein', 'Luxembourg'];

const COUNTRY_TOKENS: Record<string, string> = {
  at: 'Austria',
  de: 'Germany',
  ch: 'Switzerland',
  li: 'Liechtenstein',
  liechtenstein: 'Liechtenstein',
  lu: 'Luxembourg',
  luxembourg: 'Luxembourg',
  luxemburg: 'Luxembourg',
  'alto adige': 'Austria',
  aa: 'Austria',
  südtirol: 'Austria',
};

export type GeoParseResult = { kind: 'ok'; expected: string[] } | { kind: 'unparseable'; reason: string };

export function parseGeoRestriction(raw: string): GeoParseResult {
  const value = raw.trim();

  if (value === '') return { kind: 'ok', expected: [] };
  if (value.includes('?')) return { kind: 'unparseable', reason: `Unsichere Angabe: "${raw}"` };

  const lower = value.toLowerCase();

  if (lower === 'unbegrenzt' || lower === 'weltweit') return { kind: 'ok', expected: [] };
  if (lower === 'gst' || lower === 'gst.') return { kind: 'ok', expected: ['Spain'] };

  // "DACH" ist ein Kompositum (kein Trennzeichen zwischen den Ländern) -
  // vorab in die drei Einzelländer auflösen, bevor tokenisiert wird.
  const expanded = lower.replace(/\bdach\b/g, 'de,at,ch');
  const tokens = expanded
    .split(/\+|,|\/| und /)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) return { kind: 'unparseable', reason: `Leerer/unbekannter Wert: "${raw}"` };

  const available = new Set<string>();
  for (const token of tokens) {
    const mapped = COUNTRY_TOKENS[token];
    if (!mapped) {
      return { kind: 'unparseable', reason: `Unbekanntes Länder-Kürzel "${token}" in "${raw}"` };
    }
    available.add(mapped);
  }

  return { kind: 'ok', expected: UNIVERSE.filter((c) => !available.has(c)) };
}

export function geoMatches(expected: string[], actual: string[]): boolean {
  const normalize = (arr: string[]) => new Set(arr.map((c) => c.trim().toLowerCase()));
  const a = normalize(expected);
  const b = normalize(actual);
  if (a.size !== b.size) return false;
  for (const c of a) {
    if (!b.has(c)) return false;
  }
  return true;
}

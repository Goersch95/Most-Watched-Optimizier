import Papa from 'papaparse';
import type { CsvRow } from './types';

/**
 * Der Legal-Export ist Windows-1252-kodiert, semikolon-getrennt, mit einer
 * Titel-Zeile vor der eigentlichen Kopfzeile ("GESAMTÜBERSICHT..."). Spalten
 * werden über die Kopfzeile gesucht (wie beim Indexierungs-Checker), nicht
 * über feste Positionen - robust gegen Spalten-Umsortierung.
 */
function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

export function parseLegalCsv(buffer: Buffer): CsvRow[] {
  const text = new TextDecoder('windows-1252').decode(buffer);
  const parsed = Papa.parse<string[]>(text.trim(), { delimiter: ';', skipEmptyLines: true });
  const rows = parsed.data;

  let headerRowIndex = -1;
  let columns: { productCode: number; title: number; catchUp: number; geo: number } | null = null;

  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const normalized = rows[i].map(normalizeHeader);
    const productCodeIdx = normalized.findIndex((c) => c === 'product code');
    if (productCodeIdx !== -1) {
      headerRowIndex = i;
      columns = {
        productCode: productCodeIdx,
        title: normalized.findIndex((c) => c === 'title'),
        catchUp: normalized.findIndex((c) => c === 'catchup'),
        geo: normalized.findIndex((c) => c === 'geo-rest.' || c === 'geo-rest'),
      };
      break;
    }
  }

  if (!columns || headerRowIndex === -1) return [];

  const { productCode, title, catchUp, geo } = columns;

  return rows
    .slice(headerRowIndex + 1)
    .filter((row) => row[productCode]?.trim())
    .map((row) => ({
      productCode: row[productCode].trim(),
      title: title !== -1 ? (row[title]?.trim() ?? '') : '',
      catchUpRaw: catchUp !== -1 ? (row[catchUp]?.trim() ?? '') : '',
      geoRaw: geo !== -1 ? (row[geo]?.trim() ?? '') : '',
    }));
}

import Papa from 'papaparse';
import type { CsvRow } from './types';

/**
 * Der Legal-Export kommt in zwei bekannten Varianten vor, je nach
 * Excel-Sprache/Gebietsschema der exportierenden Person: deutsches Excel
 * liefert Windows-1252-kodierten, semikolon-getrennten Text (Komma ist dort
 * das Dezimaltrennzeichen), englisches Excel dagegen UTF-8 (mit BOM) und
 * komma-getrennt. Beide haben sonst dieselbe Struktur - eine Titel-Zeile vor
 * der eigentlichen Kopfzeile ("GESAMTÜBERSICHT..."), Spalten über die
 * Kopfzeile gesucht statt über feste Positionen. Die Kodierung wird über das
 * BOM erkannt (eindeutiges Signal, robuster als "raten"); das Trennzeichen
 * überlässt Papa Parse der eigenen Auto-Erkennung (deckt beide Fälle ab).
 */
function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

function hasUtf8Bom(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

export function parseLegalCsv(buffer: Buffer): CsvRow[] {
  const text = new TextDecoder(hasUtf8Bom(buffer) ? 'utf-8' : 'windows-1252').decode(buffer);
  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
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

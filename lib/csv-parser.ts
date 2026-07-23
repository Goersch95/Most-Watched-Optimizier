import Papa from 'papaparse';
import { MAX_ROWS_PER_UPLOAD } from './constants';
import type { AssetRow } from './types';

/**
 * The dashboard export has technical, non-obvious header names
 * (e.g. "CUSTOM.CUSTOM_ASSET_ID"), so columns are read positionally:
 * column 0 = asset ID, column 1 = session/view count.
 */
export function parseTrafficCsv(csvText: string): AssetRow[] {
  const parsed = Papa.parse<string[]>(csvText.trim(), {
    skipEmptyLines: true,
  });

  const rows = parsed.data;

  return rows
    .slice(1)
    .filter((row) => row.length >= 2 && row[0]?.trim())
    .slice(0, MAX_ROWS_PER_UPLOAD)
    .map((row) => ({
      assetId: row[0].trim(),
      viewCount: Number(row[1]) || 0,
    }));
}

/**
 * Für User ohne Export-Rechte im Dashboard: Text, der direkt aus der Tabelle
 * kopiert wurde, kommt zeilenweise abwechselnd als Asset-ID / Views an
 * (keine Spaltentrennung durch Tabs/Kommas). Views-Zeilen werden auf reine
 * Ziffern reduziert (entfernt z. B. Tausenderpunkte), Asset-IDs bleiben
 * unverändert - Sonderzeichen wie Bindestriche können echter ID-Bestandteil
 * sein.
 */
export function parsePastedRows(pastedText: string): AssetRow[] {
  const lines = pastedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const rows: AssetRow[] = [];

  for (let i = 0; i + 1 < lines.length; i += 2) {
    rows.push({
      assetId: lines[i],
      viewCount: Number(lines[i + 1].replace(/\D/g, '')) || 0,
    });
  }

  return rows.slice(0, MAX_ROWS_PER_UPLOAD);
}

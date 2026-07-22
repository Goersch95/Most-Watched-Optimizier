import Papa from 'papaparse';
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
    .map((row) => ({
      assetId: row[0].trim(),
      viewCount: Number(row[1]) || 0,
    }));
}

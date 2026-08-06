import { parseCatchUp } from './catchup-matcher';
import { geoMatches, parseGeoRestriction } from './geo-matcher';
import type { CatchUpBucket, ComparisonRow, CsvRow, EpgEntry, LegalCheckResult, MismatchReason } from './types';

/**
 * Eigene Annahme (nicht abgefragt): "unbegrenzt" gilt als stimmig, wenn
 * vod_rights.end fehlt oder mehr als 2 Jahre in der Zukunft liegt - es gibt
 * kein API-Feld für "wirklich nie endend", daher ein plausibler Schwellenwert
 * statt exaktem Vergleich.
 */
const UNLIMITED_THRESHOLD_MS = 2 * 365 * 24 * 60 * 60 * 1000;

function daysBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60 * 60 * 24);
}

export type DateRange = {
  /** Inklusive, ISO-Datum "YYYY-MM-DD". */
  from?: string;
  /** Inklusive, ISO-Datum "YYYY-MM-DD" (deckt den ganzen Tag ab). */
  to?: string;
};

/** vod_rights.start muss innerhalb des Zeitraums liegen (auf Kalendertag-Ebene, UTC). */
function isWithinRange(startIso: string | null, range: DateRange | undefined): boolean {
  if (!range || (!range.from && !range.to)) return true;
  if (!startIso) return false;

  const start = new Date(startIso).getTime();
  if (range.from && start < new Date(`${range.from}T00:00:00.000Z`).getTime()) return false;
  if (range.to && start > new Date(`${range.to}T23:59:59.999Z`).getTime()) return false;
  return true;
}

export function compareLegalData(
  rows: CsvRow[],
  epgByVin: Map<string, EpgEntry>,
  dateRange?: DateRange
): LegalCheckResult {
  const mismatches: ComparisonRow[] = [];
  const catchUpBuckets: Record<CatchUpBucket, ComparisonRow[]> = { '7': [], '30': [], unbegrenzt: [] };
  const unparseable: LegalCheckResult['unparseable'] = [];
  let notInApi = 0;
  let outsideDateRange = 0;

  for (const row of rows) {
    const entry = epgByVin.get(row.productCode.toUpperCase());
    if (!entry) {
      notInApi += 1;
      continue;
    }

    if (!isWithinRange(entry.vodRightsStart, dateRange)) {
      outsideDateRange += 1;
      continue;
    }

    const catchUpParsed = parseCatchUp(row.catchUpRaw);
    const geoParsed = parseGeoRestriction(row.geoRaw);

    if (catchUpParsed.kind === 'unparseable' || geoParsed.kind === 'unparseable') {
      unparseable.push({
        productCode: row.productCode,
        title: row.title,
        catchUpRaw: row.catchUpRaw,
        geoRaw: row.geoRaw,
        reason: [
          catchUpParsed.kind === 'unparseable' ? catchUpParsed.reason : null,
          geoParsed.kind === 'unparseable' ? geoParsed.reason : null,
        ]
          .filter((x): x is string => Boolean(x))
          .join(' / '),
      });
      continue;
    }

    const hasVodRights = Boolean(entry.vodRightsStart && entry.vodRightsEnd);
    const apiDays =
      entry.vodRightsStart && entry.vodRightsEnd ? daysBetween(entry.vodRightsStart, entry.vodRightsEnd) : null;

    const mismatchReasons: MismatchReason[] = [];

    if (catchUpParsed.kind === 'no_vod') {
      if (hasVodRights) mismatchReasons.push('catchup');
    } else if (catchUpParsed.kind === 'unlimited') {
      if (!hasVodRights || !entry.vodRightsEnd) {
        mismatchReasons.push('catchup');
      } else {
        const endFarEnough = new Date(entry.vodRightsEnd).getTime() - Date.now() > UNLIMITED_THRESHOLD_MS;
        if (!endFarEnough) mismatchReasons.push('catchup');
      }
    } else if (catchUpParsed.kind === 'days') {
      if (apiDays === null || Math.abs(apiDays - catchUpParsed.days) > 1) {
        mismatchReasons.push('catchup');
      }
    } else if (catchUpParsed.kind === 'fixed_date') {
      const apiEndDate = entry.vodRightsEnd ? entry.vodRightsEnd.slice(0, 10) : null;
      if (apiEndDate !== catchUpParsed.date) {
        mismatchReasons.push('catchup');
      }
    }

    if (!geoMatches(geoParsed.expected, entry.geoblocking)) {
      mismatchReasons.push('geo');
    }

    const comparisonRow: ComparisonRow = {
      productCode: row.productCode,
      title: row.title,
      catchUpRaw: row.catchUpRaw,
      geoRaw: row.geoRaw,
      apiCatchUpDays: apiDays,
      apiGeoblocking: entry.geoblocking,
      mismatches: mismatchReasons,
    };

    if (mismatchReasons.length > 0) {
      mismatches.push(comparisonRow);
    }

    if (catchUpParsed.kind === 'days' && catchUpParsed.days === 7) {
      catchUpBuckets['7'].push(comparisonRow);
    } else if (catchUpParsed.kind === 'days' && catchUpParsed.days === 30) {
      catchUpBuckets['30'].push(comparisonRow);
    } else if (catchUpParsed.kind === 'unlimited') {
      catchUpBuckets.unbegrenzt.push(comparisonRow);
    }
  }

  return { mismatches, catchUpBuckets, unparseable, notInApi, outsideDateRange, totalRows: rows.length };
}

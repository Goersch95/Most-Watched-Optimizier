import { classifySlot } from '../indexing-checker/schedule';
import { buildServusTvUrl, checkLiveAndResolveCanonical, fetchPublishDate } from '../indexing-checker/servustv';
import * as repo from './db';
import { isUrlIndexedByGoogleSearchConsole } from './search-console-client';

/**
 * Selbst gesetzte Sicherheitsobergrenze für Search-Console-Anfragen pro Tag.
 * Die URL Inspection API selbst erlaubt laut Google offiziell bis zu 2.000
 * Anfragen/Tag pro Property und kostet nichts - dieses Limit hier ist kein
 * Kosten-Deckel wie beim Serper-Checker, sondern nur ein grober Schutz vor
 * einem versehentlichen Burst (z. B. bei einem sehr großen Excel-Upload),
 * deutlich unter dem echten API-Limit.
 */
const DAILY_GSC_QUOTA = 500;

const LIVE_CHECK_RETRY_MINUTES = 5;

export async function ingestId(assetId: string): Promise<{ ok: boolean; error?: string }> {
  const t1 = await fetchPublishDate(assetId);

  if (!t1) {
    return { ok: false, error: `Kein Publish-Datum (play_start) über die CMS-API für "${assetId}" gefunden.` };
  }

  if (Number.isNaN(new Date(t1).getTime())) {
    return { ok: false, error: `Publish-Datum "${t1}" für "${assetId}" ist kein gültiges Datum.` };
  }

  const { weekday, slot } = classifySlot(t1);
  const url = buildServusTvUrl(assetId);
  const nowIso = new Date().toISOString();
  const nextPollAt = t1 > nowIso ? t1 : nowIso;

  repo.upsertCheck({ id: assetId, url, t1Publish: t1, weekday, slot, nextPollAt });
  return { ok: true };
}

async function retryPendingIngestions(): Promise<{ retried: number; nowIngested: number }> {
  const pending = repo.getPendingIds();
  if (pending.length === 0) return { retried: 0, nowIngested: 0 };

  let nowIngested = 0;
  const stillPending: string[] = [];

  for (const id of pending) {
    const result = await ingestId(id);
    if (result.ok) {
      nowIngested += 1;
    } else {
      stillPending.push(id);
    }
  }

  repo.setPendingIds(stillPending);
  return { retried: pending.length, nowIngested };
}

function pollDelayMinutes(pollCount: number): number {
  if (pollCount < 4) return 30;
  if (pollCount < 10) return 60;
  if (pollCount < 20) return 180;
  return 24 * 60;
}

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/**
 * Löst für alle bereits "live" ODER "found" markierten Zeilen die kanonische
 * URL neu auf (siehe checkLiveAndResolveCanonical in
 * lib/indexing-checker/servustv.ts) - für die Search-Console-API besonders
 * wichtig, da sie (anders als Serpers unscharfe `site:`-Suche) exaktes
 * URL-Matching macht und die reine ID-URL ohne Slug fälschlich als "unknown"
 * meldet. "found"-Zeilen werden nur in der URL-Anzeige korrigiert (wichtig
 * für den direkten Vergleich mit dem parallel laufenden anderen Checker),
 * nicht erneut auf Indexierung geprüft. Wird vom "Offene sofort neu
 * prüfen"-Button mitausgelöst. Gibt die Anzahl der tatsächlich geänderten
 * URLs zurück.
 */
export async function resyncLiveRowUrls(): Promise<number> {
  const rows = repo.getAllChecks().filter((r) => r.status === 'live' || r.status === 'found');
  let updated = 0;

  for (const row of rows) {
    const { canonicalUrl } = await checkLiveAndResolveCanonical(row.url);
    if (canonicalUrl && canonicalUrl !== row.url) {
      repo.updateUrl(row.id, canonicalUrl);
      updated += 1;
    }
  }

  return updated;
}

export async function runPollingPass(): Promise<{
  checked: number;
  foundNow: number;
  quotaUsed: number;
  pendingRetried: number;
  pendingIngested: number;
}> {
  const { retried: pendingRetried, nowIngested: pendingIngested } = await retryPendingIngestions();

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  const due = repo.getDueChecks(nowIso);

  let quotaUsed = repo.getTodayQuotaUsed(today);
  let foundNow = 0;

  for (const row of due) {
    if (row.status === 'pending') {
      const { live, canonicalUrl } = await checkLiveAndResolveCanonical(row.url);
      if (live) {
        repo.markLive(row.id, nowIso, nowIso, canonicalUrl ?? undefined);
      } else {
        repo.reschedule(row.id, addMinutesIso(nowIso, LIVE_CHECK_RETRY_MINUTES), row.poll_count);
      }
      continue;
    }

    if (row.status === 'live') {
      if (quotaUsed >= DAILY_GSC_QUOTA) {
        repo.reschedule(row.id, addMinutesIso(nowIso, 24 * 60), row.poll_count);
        continue;
      }

      const { indexed, inspectionLink } = await isUrlIndexedByGoogleSearchConsole(row.id, row.url);
      repo.incrementQuota(today);
      quotaUsed += 1;
      repo.setInspectionLink(row.id, inspectionLink);

      if (indexed) {
        const deltaMinutes = (new Date(nowIso).getTime() - new Date(row.t1_publish).getTime()) / 60_000;
        repo.markFound(row.id, nowIso, deltaMinutes);
        foundNow += 1;
      } else {
        const nextPollCount = row.poll_count + 1;
        repo.reschedule(row.id, addMinutesIso(nowIso, pollDelayMinutes(nextPollCount)), nextPollCount);
      }
    }
  }

  const result = { checked: due.length, foundNow, quotaUsed, pendingRetried, pendingIngested };
  repo.setLastPollRun({ at: nowIso, ...result });
  return result;
}

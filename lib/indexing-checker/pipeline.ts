import * as repo from './db';
import { classifySlot } from './schedule';
import { isUrlIndexedByGoogle } from './serper-search';
import { buildServusTvUrl, checkLiveAndResolveCanonical, fetchPublishDate } from './servustv';

/**
 * Selbst gesetzte Sicherheitsobergrenze für Serper.dev-Anfragen pro Tag -
 * anders als bei der früheren Google Custom Search JSON API gibt es hier
 * kein "X Anfragen/Tag sind immer kostenlos"-Kontingent, jede Anfrage über
 * das einmalige Gratisguthaben hinaus kostet (Bruchteile von Cent). Diese
 * Grenze deckelt bei einem Bug o. Ä. das maximale Tagesrisiko auf wenige
 * Cent, statt unbegrenzt Anfragen auszulösen.
 */
const DAILY_SERP_QUOTA = 50;

/** Kein Google-Call, kostet nichts - eigener HTTP-Check, ob die URL schon live ist. */
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

/**
 * Versucht IDs erneut, die beim letzten Excel-Upload noch fehlgeschlagen
 * sind (z. B. weil das CMS noch kein `play_start` hatte). Kostet keine
 * Google-Quota, nur einen CMS-Fetch pro noch offener ID - kann also bei
 * jedem Poll-Lauf gefahrlos mitlaufen.
 */
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
 * Löst für alle bereits "live" markierten Zeilen die kanonische URL neu auf
 * (siehe checkLiveAndResolveCanonical - ServusTV liefert dieselbe Seite ohne
 * Redirect sowohl unter der reinen ID-URL als auch einer Slug-URL aus,
 * Google indexiert aber nur die per <link rel="canonical"> deklarierte
 * Slug-URL). Wird vom "Offene sofort neu prüfen"-Button mitausgelöst, damit
 * Zeilen, die vor diesem Fix bereits mit der falschen URL live gingen,
 * nicht dauerhaft falsch geprüft werden. Gibt die Anzahl der tatsächlich
 * geänderten URLs zurück.
 */
export async function resyncLiveRowUrls(): Promise<number> {
  const liveRows = repo.getAllChecks().filter((r) => r.status === 'live');
  let updated = 0;

  for (const row of liveRows) {
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
      if (quotaUsed >= DAILY_SERP_QUOTA) {
        // Tageslimit erreicht - erst wieder morgen versuchen, statt weiter anzufragen.
        repo.reschedule(row.id, addMinutesIso(nowIso, 24 * 60), row.poll_count);
        continue;
      }

      const found = await isUrlIndexedByGoogle(row.id, row.url);
      repo.incrementQuota(today);
      quotaUsed += 1;

      if (found) {
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

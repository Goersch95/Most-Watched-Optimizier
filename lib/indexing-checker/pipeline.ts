import * as repo from './db';
import { isUrlIndexedByGoogle } from './google-search';
import { classifySlot } from './schedule';
import { buildServusTvUrl, fetchPublishDate } from './servustv';

/**
 * Hartes Tageslimit für die Google Custom Search JSON API - 100 Anfragen/Tag
 * sind immer kostenlos. Wird strikt durchgesetzt, damit nie versehentlich
 * kostenpflichtige Anfragen ausgelöst werden.
 */
const DAILY_SERP_QUOTA = 100;

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

function pollDelayMinutes(pollCount: number): number {
  if (pollCount < 4) return 30;
  if (pollCount < 10) return 60;
  if (pollCount < 20) return 180;
  return 24 * 60;
}

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

async function isUrlLive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function runPollingPass(): Promise<{ checked: number; foundNow: number; quotaUsed: number }> {
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  const due = repo.getDueChecks(nowIso);

  let quotaUsed = repo.getTodayQuotaUsed(today);
  let foundNow = 0;

  for (const row of due) {
    if (row.status === 'pending') {
      const live = await isUrlLive(row.url);
      if (live) {
        repo.markLive(row.id, nowIso, nowIso);
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

  const result = { checked: due.length, foundNow, quotaUsed };
  repo.setLastPollRun({ at: nowIso, ...result });
  return result;
}

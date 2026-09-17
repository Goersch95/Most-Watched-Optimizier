import { fetchCmsProduct } from '@/lib/cms-client';
import { classifySlot, viennaDateKey } from '../indexing-checker/schedule';
import { buildServusTvUrl, checkLiveAndResolveCanonical, fetchIngestMetadata } from '../indexing-checker/servustv';
import * as repo from './db';
import { isUrlIndexedByGoogleSearchConsole } from './search-console-client';

/**
 * Unser Server (Coolify) steht in Nürnberg - manche Assets sind laut CMS
 * (`blocked_countries`) gezielt für Deutschland gesperrt (Rechte-/Geo-
 * Beschränkung), unabhängig davon, ob sie z. B. in Österreich frei verfügbar
 * sind. Live-verifiziert an einem konkreten Fall: 403 beim Live-Check, CMS
 * bestätigte "DE" in `blocked_countries`. Für diesen Fall lohnt sich eine
 * klare, eigene Fehlermeldung statt eines irreführenden generischen
 * "nicht erreichbar" - der Live-Fetch würde ohnehin fehlschlagen.
 */
const OUR_SERVER_COUNTRY_CODE = 'DE';

/**
 * Selbst gesetzte Sicherheitsobergrenze für Search-Console-Anfragen pro Tag.
 * Die URL Inspection API selbst erlaubt laut Google offiziell bis zu 2.000
 * Anfragen/Tag pro Property und kostet nichts - dieses Limit hier ist kein
 * Kosten-Deckel wie beim Serper-Checker, sondern nur ein grober Schutz vor
 * einem versehentlichen Burst (z. B. bei einem sehr großen Excel-Upload),
 * mit Sicherheitsabstand zum echten API-Limit. Seit jede offene Zeile bei
 * jedem automatischen Lauf geprüft wird (kein Backoff mehr, siehe
 * getDueChecks in db.ts), reichen schon relativ wenige gleichzeitig offene
 * Zeilen (alle 20 Min. geprüft = bis zu 72x/Tag pro Zeile), um ein zu
 * niedriges Limit binnen weniger Stunden zu erreichen - vormals 500 war
 * dafür deutlich zu knapp (in der Praxis schon bei 13 offenen Zeilen nach
 * ca. 6-7 Stunden erreicht, wodurch alle weiteren Checks für den Rest des
 * Tages stillschweigend übersprungen wurden, ohne dass eine echte Anfrage
 * passierte).
 */
const DAILY_GSC_QUOTA = 1800;

const LIVE_CHECK_RETRY_MINUTES = 5;

export async function ingestId(assetId: string): Promise<{ ok: boolean; error?: string }> {
  const { playStart: t1, label } = await fetchIngestMetadata(assetId);

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

  repo.upsertCheck({ id: assetId, url, t1Publish: t1, weekday, slot, nextPollAt, label });
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
 * Führt einen einzelnen Search-Console-Check für eine "live" Zeile aus und
 * verbucht das Ergebnis (Quota, inspection_link, gefunden/reschedule). Wird
 * sowohl für bereits länger "live" Zeilen als auch direkt beim Sprung von
 * "pending" auf "live" aufgerufen, damit der Inspection-Link (und damit der
 * "Indexierung beantragen"-Button) schon im selben Poll-Durchlauf gesetzt
 * wird, statt erst einen ganzen Poll-Zyklus später.
 */
async function checkAndRecordIndexing(
  row: { id: string; url: string; t1_publish: string; poll_count: number },
  nowIso: string,
  today: string
): Promise<boolean> {
  const { indexed, inspectionLink } = await isUrlIndexedByGoogleSearchConsole(row.id, row.url);
  repo.incrementQuota(today);
  repo.setInspectionLink(row.id, inspectionLink);

  if (indexed) {
    const deltaMinutes = (new Date(nowIso).getTime() - new Date(row.t1_publish).getTime()) / 60_000;
    repo.markFound(row.id, nowIso, deltaMinutes);
  } else {
    const nextPollCount = row.poll_count + 1;
    repo.reschedule(row.id, addMinutesIso(nowIso, pollDelayMinutes(nextPollCount)), nextPollCount);
  }

  return indexed;
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

/**
 * Manuelle On-Demand-Neuprüfung einer einzelnen archivierten Zeile: macht
 * einen echten, frischen Search-Console-Call statt den gespeicherten
 * (ggf. veralteten) inspection_link wiederzuverwenden, und aktualisiert die
 * archivierte Zeile in place, falls sich der Status auf "indexiert" ändert.
 * Läuft NUR auf expliziten Klick (siehe app/api/.../archive/[id]/recheck),
 * archivierte Runden werden sonst nie automatisch weiterverfolgt.
 */
export async function recheckArchivedRow(
  archiveId: string,
  rowId: string
): Promise<{ ok: boolean; error?: string; indexed?: boolean; row?: repo.IndexingCheckRow }> {
  const row = repo.getArchivedCheck(archiveId, rowId);
  if (!row) {
    return { ok: false, error: 'Archivierte Zeile nicht gefunden.' };
  }

  const today = viennaDateKey(new Date().toISOString());
  if (repo.getTodayQuotaUsed(today) >= DAILY_GSC_QUOTA) {
    return { ok: false, error: 'Tages-Sicherheitslimit für Search-Console-Anfragen erreicht - bitte später erneut versuchen.' };
  }

  const { indexed, inspectionLink } = await isUrlIndexedByGoogleSearchConsole(row.id, row.url);
  repo.incrementQuota(today);

  const nowIso = new Date().toISOString();
  const patch: Parameters<typeof repo.updateArchivedCheck>[2] = { inspection_link: inspectionLink };

  if (indexed && row.status !== 'found') {
    patch.status = 'found';
    patch.t2_indexed = nowIso;
    patch.delta_minutes = (new Date(nowIso).getTime() - new Date(row.t1_publish).getTime()) / 60_000;
  }

  const updated = repo.updateArchivedCheck(archiveId, rowId, patch);
  return { ok: true, indexed, row: updated ?? undefined };
}

/**
 * Eigenständiges Nachschlage-Werkzeug: nur eine ID eingeben, keine
 * Excel-Runde nötig - liefert live, welche URL Google für diese ID
 * tatsächlich als kanonisch/indexiert führt (`googleCanonical` aus der
 * echten Search-Console-Antwort, nicht nur unsere eigene aus dem
 * `<link rel="canonical">`-Tag gescrapte Vermutung). Verbraucht bewusst
 * dieselbe Tages-Quota wie die automatischen Läufe, damit ein exzessives
 * manuelles Nachschlagen nicht versehentlich Googles echtes Limit sprengt.
 */
export async function lookupIndexedUrl(assetId: string): Promise<{
  ok: boolean;
  error?: string;
  requestedUrl?: string;
  indexed?: boolean;
  googleCanonical?: string | null;
  coverageState?: string | null;
  inspectionLink?: string | null;
}> {
  const trimmedId = assetId.trim();
  if (!trimmedId) {
    return { ok: false, error: 'Bitte eine ID eingeben.' };
  }

  const today = viennaDateKey(new Date().toISOString());
  if (repo.getTodayQuotaUsed(today) >= DAILY_GSC_QUOTA) {
    return { ok: false, error: 'Tages-Sicherheitslimit für Search-Console-Anfragen erreicht - bitte später erneut versuchen.' };
  }

  const cmsProduct = await fetchCmsProduct(trimmedId);
  const rawBlockedCountries = cmsProduct?.blocked_countries;
  const blockedCountries = Array.isArray(rawBlockedCountries) ? rawBlockedCountries : [];
  if (blockedCountries.includes(OUR_SERVER_COUNTRY_CODE)) {
    return {
      ok: false,
      error: `Dieses Asset ist für Deutschland geoblockt (blocked_countries: ${blockedCountries.join(', ')}) - unser Server steht in Nürnberg und kann es deshalb nicht automatisch prüfen, auch wenn es z. B. in Österreich frei verfügbar ist. Bitte manuell in der Search Console nachsehen.`,
    };
  }

  const bareUrl = buildServusTvUrl(trimmedId);
  const { live, canonicalUrl, httpStatus, fetchError } = await checkLiveAndResolveCanonical(bareUrl);

  if (!live) {
    const detail = fetchError ? `Netzwerkfehler: ${fetchError}` : `HTTP-Status ${httpStatus}`;
    return { ok: false, error: `Seite für "${trimmedId}" ist aktuell nicht erreichbar (geprüft: ${bareUrl}, ${detail}).` };
  }

  const requestedUrl = canonicalUrl ?? bareUrl;
  const { indexed, googleCanonical, coverageState, inspectionLink } = await isUrlIndexedByGoogleSearchConsole(
    trimmedId,
    requestedUrl
  );
  repo.incrementQuota(today);

  return { ok: true, requestedUrl, indexed, googleCanonical, coverageState, inspectionLink };
}

export async function runPollingPass(source: 'auto' | 'manual' = 'auto'): Promise<{
  checked: number;
  foundNow: number;
  quotaUsed: number;
  quotaUsedThisRun: number;
  pendingRetried: number;
  pendingIngested: number;
  source: 'auto' | 'manual';
}> {
  const { retried: pendingRetried, nowIngested: pendingIngested } = await retryPendingIngestions();

  const nowIso = new Date().toISOString();
  const today = viennaDateKey(nowIso);
  const due = repo.getDueChecks(nowIso);

  let quotaUsed = repo.getTodayQuotaUsed(today);
  /**
   * Anders als `quotaUsed` (kumulierter Tageswert, auch für die
   * DAILY_GSC_QUOTA-Obergrenze gebraucht) zählt das hier NUR Anfragen aus
   * diesem einen automatischen Durchlauf - manuelle "Jetzt prüfen &
   * öffnen"-Klicks auf archivierten Zeilen (siehe recheckArchivedRow) tragen
   * bewusst nicht dazu bei, damit die Lauf-Historie wirklich nur den
   * automatischen Task beweist und nicht durch manuelle Aktionen verfälscht
   * wird.
   */
  let quotaUsedThisRun = 0;
  let foundNow = 0;

  for (const row of due) {
    if (row.status === 'pending') {
      const { live, canonicalUrl } = await checkLiveAndResolveCanonical(row.url);
      if (!live) {
        repo.reschedule(row.id, addMinutesIso(nowIso, LIVE_CHECK_RETRY_MINUTES), row.poll_count);
        continue;
      }

      const url = canonicalUrl ?? row.url;
      repo.markLive(row.id, nowIso, nowIso, canonicalUrl ?? undefined);

      if (quotaUsed >= DAILY_GSC_QUOTA) {
        continue;
      }

      quotaUsed += 1;
      quotaUsedThisRun += 1;
      const indexed = await checkAndRecordIndexing({ ...row, url }, nowIso, today);
      if (indexed) foundNow += 1;
      continue;
    }

    if (row.status === 'live') {
      if (quotaUsed >= DAILY_GSC_QUOTA) {
        repo.reschedule(row.id, addMinutesIso(nowIso, 24 * 60), row.poll_count);
        continue;
      }

      quotaUsed += 1;
      quotaUsedThisRun += 1;
      const indexed = await checkAndRecordIndexing(row, nowIso, today);
      if (indexed) foundNow += 1;
    }
  }

  const result = { checked: due.length, foundNow, quotaUsed, quotaUsedThisRun, pendingRetried, pendingIngested, source };
  repo.setLastPollRun({ at: nowIso, ...result });
  return result;
}

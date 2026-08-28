import fs from 'node:fs';
import path from 'node:path';
import type { IndexingCheckRow, IndexingStatus } from '../indexing-checker/types';

/**
 * Eigenständiger Datenstand für den parallel laufenden Search-Console-
 * basierten Checker - bewusst komplett getrennt von
 * lib/indexing-checker/db.ts (Serper-Variante), damit beide unabhängig
 * voneinander laufen und sich vergleichen lassen, ohne dass ein Bugfix an
 * der einen Variante die andere versehentlich mitbeeinflusst. Struktur
 * identisch zum Serper-Checker (siehe dortige Kommentare zur Begründung
 * für JSON-Datei statt echter DB).
 */
export type LastUpload = {
  filename: string;
  uploadedAt: string;
  ingested: number;
  failed: number;
};

export type LastPollRun = {
  at: string;
  checked: number;
  foundNow: number;
  /** Kumulierter Tageswert (auch für die DAILY_GSC_QUOTA-Obergrenze relevant). */
  quotaUsed: number;
  /**
   * Anfragen NUR aus diesem einen Lauf - undefined bei Alteinträgen, die vor
   * Einführung dieses Felds geloggt wurden.
   */
  quotaUsedThisRun?: number;
  pendingRetried: number;
  pendingIngested: number;
  /** Wodurch dieser Lauf ausgelöst wurde - undefined bei Alteinträgen vor Einführung dieses Felds. */
  source?: 'auto' | 'manual';
};

export type ArchiveEntry = {
  id: string;
  archivedAt: string;
  filename: string | null;
  checks: IndexingCheckRow[];
};

export type ArchiveSummary = {
  id: string;
  archivedAt: string;
  filename: string | null;
  count: number;
};

type Store = {
  checks: Record<string, IndexingCheckRow>;
  quota: Record<string, number>;
  lastUpload: LastUpload | null;
  lastPollRun: LastPollRun | null;
  /**
   * Chronologisches Log aller bisherigen Poll-Läufe (neueste zuerst), als
   * Nachweis, dass der Coolify Scheduled Task tatsächlich im 20-Minuten-Takt
   * feuert - eine Lücke in dieser Liste zeigt einen ausgefallenen Lauf.
   * Gedeckelt auf MAX_POLL_RUN_HISTORY, damit die Datei nicht unbegrenzt
   * wächst.
   */
  pollRunHistory: LastPollRun[];
  pendingIds: string[];
  archives: ArchiveEntry[];
};

const MAX_POLL_RUN_HISTORY = 500;

const DB_PATH = process.env.INDEXING_GSC_DB_PATH || path.join(process.cwd(), 'data', 'indexing-checker-gsc.json');
const UPLOAD_FILE_PATH = path.join(path.dirname(DB_PATH), 'last-upload-gsc.xlsx');

let store: Store | null = null;

function load(): Store {
  if (store) return store;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const empty: Store = {
    checks: {},
    quota: {},
    lastUpload: null,
    lastPollRun: null,
    pollRunHistory: [],
    pendingIds: [],
    archives: [],
  };

  if (fs.existsSync(DB_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      store = { ...empty, ...parsed };
    } catch {
      store = empty;
    }
  } else {
    store = empty;
  }

  return store as Store;
}

function persist(): void {
  if (!store) return;
  fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

export function upsertCheck(row: {
  id: string;
  url: string;
  t1Publish: string;
  weekday: string;
  slot: string;
  nextPollAt: string;
}): void {
  const s = load();
  const existing = s.checks[row.id];

  s.checks[row.id] = {
    id: row.id,
    url: row.url,
    t1_publish: row.t1Publish,
    t1_live_confirmed: existing?.t1_live_confirmed ?? null,
    t2_indexed: existing?.t2_indexed ?? null,
    delta_minutes: existing?.delta_minutes ?? null,
    weekday: row.weekday,
    slot: row.slot,
    status: existing?.status ?? 'pending',
    poll_count: existing?.poll_count ?? 0,
    next_poll_at: existing ? existing.next_poll_at : row.nextPollAt,
    created_at: existing?.created_at ?? new Date().toISOString(),
    inspection_link: existing?.inspection_link ?? null,
  };

  persist();
}

/**
 * "pending"-Zeilen (noch nicht live) bleiben am next_poll_at-Rhythmus (alle
 * LIVE_CHECK_RETRY_MINUTES, siehe pipeline.ts) - reiner Live-Check, kostet
 * keine Search-Console-Quota. "live"-Zeilen (bereits online, noch nicht
 * indexiert) werden dagegen IMMER als fällig zurückgegeben, unabhängig vom
 * gespeicherten next_poll_at - anders als beim Serper-Checker gibt es bei
 * Search Console kein enges Kosten-Tageslimit, das ein Backoff nötig machen
 * würde, und jede offene Zeile soll bei jedem automatischen Lauf geprüft
 * werden.
 */
export function getDueChecks(nowIso: string): IndexingCheckRow[] {
  return Object.values(load().checks)
    .filter((r) => {
      if (r.status === 'found') return false;
      if (r.status === 'live') return true;
      return r.next_poll_at <= nowIso;
    })
    .sort((a, b) => (a.next_poll_at < b.next_poll_at ? -1 : a.next_poll_at > b.next_poll_at ? 1 : 0));
}

export function getAllChecks(): IndexingCheckRow[] {
  return Object.values(load().checks).sort((a, b) =>
    a.t1_publish < b.t1_publish ? 1 : a.t1_publish > b.t1_publish ? -1 : 0
  );
}

export function resetLiveRowsToDueNow(): number {
  const s = load();
  const nowIso = new Date().toISOString();
  let count = 0;

  for (const row of Object.values(s.checks)) {
    if (row.status === 'live' && row.next_poll_at > nowIso) {
      row.next_poll_at = nowIso;
      count += 1;
    }
  }

  if (count > 0) persist();
  return count;
}

export function archiveCurrentChecksAndReset(): void {
  const s = load();
  const currentChecks = Object.values(s.checks);

  if (currentChecks.length > 0) {
    s.archives.unshift({
      id: new Date().toISOString(),
      archivedAt: new Date().toISOString(),
      filename: s.lastUpload?.filename ?? null,
      checks: currentChecks,
    });
  }

  s.checks = {};
  s.pendingIds = [];
  persist();
}

export function getArchives(): ArchiveSummary[] {
  return load().archives.map((a) => ({
    id: a.id,
    archivedAt: a.archivedAt,
    filename: a.filename,
    count: a.checks.length,
  }));
}

export function getArchiveById(id: string): ArchiveEntry | null {
  return load().archives.find((a) => a.id === id) ?? null;
}

export function getArchivedCheck(archiveId: string, rowId: string): IndexingCheckRow | null {
  const archive = load().archives.find((a) => a.id === archiveId);
  return archive?.checks.find((r) => r.id === rowId) ?? null;
}

/**
 * Aktualisiert eine einzelne Zeile innerhalb eines Archiv-Eintrags in place -
 * für die manuelle On-Demand-Neuprüfung archivierter Zeilen (siehe
 * recheckArchivedRow in pipeline.ts). Archivierte Runden werden sonst nie
 * automatisch weiterverfolgt; das hier ist bewusst der einzige Weg, wie sich
 * eine archivierte Zeile noch ändern kann, und passiert nur auf expliziten
 * Klick, nie im Hintergrund.
 */
export function updateArchivedCheck(
  archiveId: string,
  rowId: string,
  patch: Partial<Pick<IndexingCheckRow, 'inspection_link' | 'status' | 't2_indexed' | 'delta_minutes'>>
): IndexingCheckRow | null {
  const s = load();
  const archive = s.archives.find((a) => a.id === archiveId);
  const row = archive?.checks.find((r) => r.id === rowId);
  if (!row) return null;
  Object.assign(row, patch);
  persist();
  return row;
}

export function markLive(id: string, confirmedAtIso: string, nextPollAtIso: string, canonicalUrl?: string): void {
  const row = load().checks[id];
  if (!row) return;
  row.status = 'live';
  row.t1_live_confirmed = confirmedAtIso;
  row.next_poll_at = nextPollAtIso;
  if (canonicalUrl) row.url = canonicalUrl;
  persist();
}

/** Für den Resync-Fall: URL nachträglich korrigieren, ohne den restlichen Status anzufassen. */
export function updateUrl(id: string, url: string): void {
  const row = load().checks[id];
  if (!row) return;
  row.url = url;
  persist();
}

export function reschedule(id: string, nextPollAtIso: string, pollCount: number): void {
  const row = load().checks[id];
  if (!row) return;
  row.next_poll_at = nextPollAtIso;
  row.poll_count = pollCount;
  persist();
}

export function markFound(id: string, foundAtIso: string, deltaMinutes: number): void {
  const row = load().checks[id];
  if (!row) return;
  row.status = 'found';
  row.t2_indexed = foundAtIso;
  row.delta_minutes = deltaMinutes;
  persist();
}

/**
 * Hält den von Google bei jeder Inspection mitgelieferten Direktlink zur
 * Search-Console-Ansicht aktuell - auch für noch nicht gefundene Zeilen,
 * damit man von dort aus die Indexierung manuell beantragen kann, ohne die
 * URL erst selbst suchen zu müssen.
 */
export function setInspectionLink(id: string, link: string | null): void {
  const row = load().checks[id];
  if (!row || !link) return;
  row.inspection_link = link;
  persist();
}

export function getTodayQuotaUsed(dateStr: string): number {
  return load().quota[dateStr] ?? 0;
}

export function incrementQuota(dateStr: string): void {
  const s = load();
  s.quota[dateStr] = (s.quota[dateStr] ?? 0) + 1;
  persist();
}

export function saveUploadedFile(buffer: Buffer, meta: Omit<LastUpload, 'uploadedAt'>): void {
  fs.mkdirSync(path.dirname(UPLOAD_FILE_PATH), { recursive: true });
  fs.writeFileSync(UPLOAD_FILE_PATH, buffer);

  const s = load();
  s.lastUpload = { ...meta, uploadedAt: new Date().toISOString() };
  persist();
}

export function getLastUpload(): LastUpload | null {
  return load().lastUpload;
}

export function getUploadedFileBuffer(): Buffer | null {
  if (!fs.existsSync(UPLOAD_FILE_PATH)) return null;
  return fs.readFileSync(UPLOAD_FILE_PATH);
}

export function clearLastUpload(): void {
  if (fs.existsSync(UPLOAD_FILE_PATH)) {
    fs.unlinkSync(UPLOAD_FILE_PATH);
  }

  const s = load();
  s.lastUpload = null;
  persist();
}

export function setLastPollRun(run: LastPollRun): void {
  const s = load();
  s.lastPollRun = run;
  s.pollRunHistory.unshift(run);
  if (s.pollRunHistory.length > MAX_POLL_RUN_HISTORY) {
    s.pollRunHistory.length = MAX_POLL_RUN_HISTORY;
  }
  persist();
}

export function getLastPollRun(): LastPollRun | null {
  return load().lastPollRun;
}

export function getPollRunHistory(): LastPollRun[] {
  return load().pollRunHistory;
}

export function setPendingIds(ids: string[]): void {
  const s = load();
  s.pendingIds = ids;
  persist();
}

export function getPendingIds(): string[] {
  return load().pendingIds;
}

export type { IndexingCheckRow, IndexingStatus };

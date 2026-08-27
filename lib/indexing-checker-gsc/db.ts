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
  quotaUsed: number;
  pendingRetried: number;
  pendingIngested: number;
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
  pendingIds: string[];
  archives: ArchiveEntry[];
};

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
  };

  persist();
}

export function getDueChecks(nowIso: string): IndexingCheckRow[] {
  return Object.values(load().checks)
    .filter((r) => r.status !== 'found' && r.next_poll_at <= nowIso)
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
  persist();
}

export function getLastPollRun(): LastPollRun | null {
  return load().lastPollRun;
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

import fs from 'node:fs';
import path from 'node:path';
import type { IndexingCheckRow, IndexingStatus } from './types';

/**
 * Bewusst eine simple JSON-Datei statt einer echten DB (z. B. SQLite): bei
 * dieser Datenmenge (ein paar Dutzend Zeilen, ein Schreibvorgang alle
 * 15-30 Min) mehr als ausreichend, und vermeidet natives Node-Addon-Gepäck
 * komplett - better-sqlite3 hatte in Docker (Alpine/musl UND Debian/glibc)
 * Laufzeitabstürze verursacht, die zu 502ern führten, obwohl der
 * Next.js-Prozess selbst sauber lief.
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
  /** Dateiname des Uploads, zu dem dieser Stand gehörte (falls bekannt). */
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
   * IDs aus dem letzten Excel-Upload, die beim Ingest (noch) fehlgeschlagen
   * sind (z. B. weil das CMS noch kein `play_start` hat). Werden bei jedem
   * Poll-Lauf erneut versucht, bis sie erfolgreich aufgenommen werden - sonst
   * würde eine ID, die zum Upload-Zeitpunkt noch nicht bereit war, nie wieder
   * geprüft.
   */
  pendingIds: string[];
  /**
   * Eingefrorene Stände früherer Upload-Runden - jeder neue Excel-Upload
   * archiviert den bisherigen `checks`-Stand hier, bevor er zurückgesetzt
   * wird. So zeigt die aktive Ergebnistabelle immer nur die aktuelle Datei,
   * alte Runden bleiben aber über das Archiv einsehbar.
   */
  archives: ArchiveEntry[];
};

const DB_PATH = process.env.INDEXING_DB_PATH || path.join(process.cwd(), 'data', 'indexing-checker.json');
const UPLOAD_FILE_PATH = path.join(path.dirname(DB_PATH), 'last-upload.xlsx');

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
    inspection_link: existing?.inspection_link ?? null,
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

/**
 * Setzt bei allen noch nicht gefundenen "live"-Zeilen den nächsten
 * Prüfzeitpunkt auf "jetzt" - z. B. nach einem Bugfix am Matching, damit
 * Zeilen, die durch viele erfolglose Versuche schon im 24h-Rhythmus
 * gelandet sind, nicht erst bis zu einen Tag auf die nächste (jetzt
 * korrekte) Prüfung warten müssen. Gibt die Anzahl der zurückgesetzten
 * Zeilen zurück.
 */
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

/**
 * Friert den aktuellen `checks`-Stand als Archiv-Eintrag ein (verknüpft mit
 * dem Dateinamen des bisherigen Uploads) und setzt die aktive Tracking-Runde
 * zurück. Wird vor jedem neuen Excel-Upload aufgerufen. Kein Archiv-Eintrag,
 * falls noch nichts erfasst war (z. B. beim allerersten Upload).
 */
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

/**
 * Speichert die zuletzt hochgeladene Excel-Datei auf demselben Persistent-
 * Storage-Volume wie die JSON-Daten (übernimmt also automatisch dessen
 * Konfiguration). Es wird bewusst nur die jeweils letzte Datei aufgehoben,
 * keine Historie - deckt den Bedarf "welches Dokument liegt gerade drin".
 */
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

/** Entfernt nur die gespeicherte Datei + Metadaten, nicht die bereits erfassten Checks. */
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

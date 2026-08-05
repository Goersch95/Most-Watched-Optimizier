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
type Store = {
  checks: Record<string, IndexingCheckRow>;
  quota: Record<string, number>;
};

const DB_PATH = process.env.INDEXING_DB_PATH || path.join(process.cwd(), 'data', 'indexing-checker.json');

let store: Store | null = null;

function load(): Store {
  if (store) return store;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    try {
      store = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch {
      store = { checks: {}, quota: {} };
    }
  } else {
    store = { checks: {}, quota: {} };
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

export function markLive(id: string, confirmedAtIso: string, nextPollAtIso: string): void {
  const row = load().checks[id];
  if (!row) return;
  row.status = 'live';
  row.t1_live_confirmed = confirmedAtIso;
  row.next_poll_at = nextPollAtIso;
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

export type { IndexingCheckRow, IndexingStatus };

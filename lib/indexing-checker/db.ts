import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { IndexingCheckRow, IndexingStatus } from './types';

type DB = Database.Database;

let dbInstance: DB | null = null;

/**
 * Lazy statt Top-Level-Initialisierung: Next.js führt beim Build-Schritt
 * "Collecting page data" jedes Route-Modul in einem Worker-Thread aus, um es
 * zu analysieren - dabei stürzte der Build-Worker mit SIGSEGV ab, sobald
 * better-sqlite3 (natives Addon) allein durch den Modul-Import geladen und
 * eine DB geöffnet wurde. Zur eigentlichen Laufzeit (normaler Node-Prozess,
 * kein Worker-Thread) ist das unproblematisch - daher wird `require()` und
 * die DB-Öffnung bewusst erst beim ersten echten Aufruf ausgeführt, nicht
 * beim reinen Import.
 */
function getDb(): DB {
  if (dbInstance) return dbInstance;

  const DatabaseCtor = require('better-sqlite3') as typeof Database;
  const dbPath = process.env.INDEXING_DB_PATH || path.join(process.cwd(), 'data', 'indexing-checker.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseCtor(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS indexing_checks (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      t1_publish TEXT NOT NULL,
      t1_live_confirmed TEXT,
      t2_indexed TEXT,
      delta_minutes REAL,
      weekday TEXT NOT NULL,
      slot TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      poll_count INTEGER NOT NULL DEFAULT 0,
      next_poll_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS serp_quota_usage (
      date TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    );
  `);

  dbInstance = db;
  return db;
}

export function upsertCheck(row: {
  id: string;
  url: string;
  t1Publish: string;
  weekday: string;
  slot: string;
  nextPollAt: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO indexing_checks (id, url, t1_publish, weekday, slot, status, poll_count, next_poll_at)
       VALUES (@id, @url, @t1Publish, @weekday, @slot, 'pending', 0, @nextPollAt)
       ON CONFLICT(id) DO UPDATE SET
         url = excluded.url,
         t1_publish = excluded.t1_publish,
         weekday = excluded.weekday,
         slot = excluded.slot`
    )
    .run(row);
}

export function getDueChecks(nowIso: string): IndexingCheckRow[] {
  return getDb()
    .prepare(`SELECT * FROM indexing_checks WHERE status != 'found' AND next_poll_at <= ? ORDER BY next_poll_at ASC`)
    .all(nowIso) as IndexingCheckRow[];
}

export function getAllChecks(): IndexingCheckRow[] {
  return getDb().prepare(`SELECT * FROM indexing_checks ORDER BY t1_publish DESC`).all() as IndexingCheckRow[];
}

export function markLive(id: string, confirmedAtIso: string, nextPollAtIso: string): void {
  getDb()
    .prepare(`UPDATE indexing_checks SET status = 'live', t1_live_confirmed = ?, next_poll_at = ? WHERE id = ?`)
    .run(confirmedAtIso, nextPollAtIso, id);
}

export function reschedule(id: string, nextPollAtIso: string, pollCount: number): void {
  getDb()
    .prepare(`UPDATE indexing_checks SET next_poll_at = ?, poll_count = ? WHERE id = ?`)
    .run(nextPollAtIso, pollCount, id);
}

export function markFound(id: string, foundAtIso: string, deltaMinutes: number): void {
  getDb()
    .prepare(`UPDATE indexing_checks SET status = 'found', t2_indexed = ?, delta_minutes = ? WHERE id = ?`)
    .run(foundAtIso, deltaMinutes, id);
}

export function getTodayQuotaUsed(dateStr: string): number {
  const row = getDb().prepare(`SELECT count FROM serp_quota_usage WHERE date = ?`).get(dateStr) as
    | { count: number }
    | undefined;
  return row?.count ?? 0;
}

export function incrementQuota(dateStr: string): void {
  getDb()
    .prepare(
      `INSERT INTO serp_quota_usage (date, count) VALUES (?, 1)
       ON CONFLICT(date) DO UPDATE SET count = count + 1`
    )
    .run(dateStr);
}

export type { IndexingCheckRow, IndexingStatus };

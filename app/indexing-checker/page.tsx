'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppNav } from '@/components/AppNav';
import { formatViennaDateTime } from '@/lib/indexing-checker/schedule';

type IndexingStatus = 'pending' | 'live' | 'found';

type IndexingCheckRow = {
  id: string;
  url: string;
  t1_publish: string;
  t1_live_confirmed: string | null;
  t2_indexed: string | null;
  delta_minutes: number | null;
  weekday: string;
  slot: string;
  status: IndexingStatus;
  poll_count: number;
  next_poll_at: string;
  created_at: string;
};

const STATUS_LABELS: Record<IndexingStatus, string> = {
  pending: 'Wartet auf Publish',
  live: 'Live, wartet auf Google',
  found: 'Indexiert',
};

const STATUS_STYLES: Record<IndexingStatus, string> = {
  pending: 'bg-slate-800 text-slate-300',
  live: 'border border-amber-800 bg-amber-950/50 text-amber-300',
  found: 'border border-emerald-800 bg-emerald-950/50 text-emerald-300',
};

type LastUpload = {
  filename: string;
  uploadedAt: string;
  ingested: number;
  failed: number;
};

type LastPollRun = {
  at: string;
  checked: number;
  foundNow: number;
  quotaUsed: number;
};

export default function IndexingCheckerPage() {
  const [rows, setRows] = useState<IndexingCheckRow[]>([]);
  const [lastUpload, setLastUpload] = useState<LastUpload | null>(null);
  const [lastPollRun, setLastPollRun] = useState<LastPollRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadSummary, setUploadSummary] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  async function loadResults() {
    setLoading(true);
    try {
      const res = await fetch('/api/indexing-checker/results', { cache: 'no-store' });
      const data = await res.json();
      setRows(data.checks ?? []);
      setLastUpload(data.lastUpload ?? null);
      setLastPollRun(data.lastPollRun ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteUpload() {
    if (!confirm('Gespeicherte Datei wirklich löschen? Die bereits erfassten Videos/Ergebnisse bleiben erhalten.')) {
      return;
    }

    setDeleting(true);
    try {
      await fetch('/api/indexing-checker/last-upload', { method: 'DELETE' });
      setLastUpload(null);
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    loadResults();
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setUploadSummary(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/indexing-checker/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Fehler beim Verarbeiten der Excel-Datei.');
        return;
      }

      const failedCount = data.failed?.length ?? 0;
      setUploadSummary(`${data.ingested} ID(s) aufgenommen${failedCount ? `, ${failedCount} fehlgeschlagen` : ''}.`);
      await loadResults();
    } catch {
      setError('Upload fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function exportCsv() {
    const header = ['ID', 'URL', 'Wochentag', 'Slot', 'T1 (Publish)', 'T2 (Indexiert)', 'Delta (Min)', 'Status'];
    const lines = rows.map((r) =>
      [r.id, r.url, r.weekday, r.slot, r.t1_publish, r.t2_indexed ?? '', r.delta_minutes ?? '', STATUS_LABELS[r.status]]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'indexierungs-check.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const foundRows = rows.filter((r) => r.status === 'found' && r.delta_minutes != null);
  const averagesBySlot = groupAverage(foundRows, (r) => r.slot);
  const averagesByWeekday = groupAverage(foundRows, (r) => r.weekday);

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <AppNav />
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-2xl font-bold">Google-Indexierungs-Checker</h1>
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap"
        >
          Abmelden
        </button>
      </div>
      <p className="text-slate-400 mb-8">
        Misst, wie lange es dauert, bis ein neu veröffentlichtes SEN-Video über Google auffindbar ist. T1 = realer
        Publish-Zeitpunkt aus dem CMS, T2 = erster Google-Treffer für die URL.
      </p>

      <div className="mb-8 rounded border border-dashed border-slate-700 p-6 text-center">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleUpload}
          className="block w-full text-sm text-slate-300 file:mr-4 file:rounded file:border-0 file:bg-red-600 file:px-4 file:py-2 file:text-white hover:file:bg-red-500 file:cursor-pointer"
        />
        <p className="mt-3 text-xs text-slate-500">
          Excel (.xlsx) mit einer Spalte "ID" (z. B. der Dashboard-Export "AssetListExport") oder einfach eine ID
          pro Zeile in Spalte A.
        </p>
        {uploading && <p className="mt-3 text-sm text-slate-400">Wird verarbeitet…</p>}
        {uploadSummary && <p className="mt-3 text-sm text-emerald-400">{uploadSummary}</p>}
      </div>

      {error && (
        <div className="mb-8 rounded border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mb-8 space-y-2 rounded border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm">
        {lastUpload ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-slate-300">
              Letzter Upload: <span className="font-medium text-slate-100">{lastUpload.filename}</span> ·{' '}
              {formatViennaDateTime(lastUpload.uploadedAt)} Uhr · {lastUpload.ingested} ID(s) übernommen
              {lastUpload.failed > 0 ? `, ${lastUpload.failed} fehlgeschlagen` : ''}
            </p>
            <div className="flex gap-3">
              <a
                href="/api/indexing-checker/last-upload"
                className="text-sm text-slate-400 underline decoration-slate-600 hover:text-slate-200 hover:decoration-slate-300"
              >
                Datei herunterladen
              </a>
              <button
                type="button"
                onClick={handleDeleteUpload}
                disabled={deleting}
                className="text-sm text-red-400 underline decoration-red-800 hover:text-red-300 hover:decoration-red-600 disabled:opacity-50"
              >
                Löschen
              </button>
            </div>
          </div>
        ) : (
          <p className="text-slate-400">Noch keine Datei hochgeladen.</p>
        )}

        <p className="text-slate-500">
          Letzter automatischer Check-Lauf:{' '}
          {lastPollRun ? (
            <>
              {formatViennaDateTime(lastPollRun.at)} Uhr · {lastPollRun.checked} geprüft, {lastPollRun.foundNow} neu
              gefunden
            </>
          ) : (
            'noch nicht gelaufen'
          )}
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ergebnisse ({rows.length})</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadResults}
            className="rounded border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-900"
          >
            Aktualisieren
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            CSV-Export
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Lädt…</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-400 text-sm">Noch keine Videos erfasst.</p>
      ) : (
        <div className="mb-8 overflow-x-auto rounded border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">Wochentag</th>
                <th className="px-3 py-2 text-left font-medium">Slot</th>
                <th className="px-3 py-2 text-left font-medium">T1 (Publish)</th>
                <th className="px-3 py-2 text-left font-medium">T2 (Indexiert)</th>
                <th className="px-3 py-2 text-right font-medium">Delta</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-800 hover:bg-slate-900/50">
                  <td className="px-3 py-2">
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-slate-600 hover:decoration-slate-300"
                    >
                      {row.id}
                    </a>
                  </td>
                  <td className="px-3 py-2">{row.weekday}</td>
                  <td className="px-3 py-2">{row.slot}</td>
                  <td className="px-3 py-2">{formatViennaDateTime(row.t1_publish)}</td>
                  <td className="px-3 py-2">{row.t2_indexed ? formatViennaDateTime(row.t2_indexed) : '–'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.delta_minutes != null ? formatDelta(row.delta_minutes) : '–'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-1 text-xs ${STATUS_STYLES[row.status]}`}>
                      {STATUS_LABELS[row.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {foundRows.length > 0 && (
        <div className="grid gap-8 lg:grid-cols-2">
          <AverageTable title="Ø Latenz pro Slot" data={averagesBySlot} />
          <AverageTable title="Ø Latenz pro Wochentag" data={averagesByWeekday} />
        </div>
      )}
    </main>
  );
}

function groupAverage(
  rows: IndexingCheckRow[],
  keyFn: (row: IndexingCheckRow) => string
): { key: string; avgMinutes: number; count: number }[] {
  const groups = new Map<string, number[]>();

  for (const row of rows) {
    const key = keyFn(row);
    const values = groups.get(key) ?? [];
    values.push(row.delta_minutes as number);
    groups.set(key, values);
  }

  return Array.from(groups.entries())
    .map(([key, values]) => ({
      key,
      avgMinutes: values.reduce((a, b) => a + b, 0) / values.length,
      count: values.length,
    }))
    .sort((a, b) => a.avgMinutes - b.avgMinutes);
}

function AverageTable({
  title,
  data,
}: {
  title: string;
  data: { key: string; avgMinutes: number; count: number }[];
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-300">{title}</h3>
      <div className="overflow-x-auto rounded border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Gruppe</th>
              <th className="px-3 py-2 text-right font-medium">Ø Delta</th>
              <th className="px-3 py-2 text-right font-medium">n</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-t border-slate-800">
                <td className="px-3 py-2">{d.key}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatDelta(d.avgMinutes)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatDelta(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
}

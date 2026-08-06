'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppNav } from '@/components/AppNav';

type MismatchReason = 'catchup' | 'geo';

type ComparisonRow = {
  productCode: string;
  title: string;
  catchUpRaw: string;
  geoRaw: string;
  apiCatchUpDays: number | null;
  apiGeoblocking: string[];
  mismatches: MismatchReason[];
};

type UnparseableRow = {
  productCode: string;
  title: string;
  catchUpRaw: string;
  geoRaw: string;
  reason: string;
};

type LegalCheckResult = {
  mismatches: ComparisonRow[];
  catchUpBuckets: Record<'7' | '30' | 'unbegrenzt', ComparisonRow[]>;
  unparseable: UnparseableRow[];
  notInApi: number;
  totalRows: number;
};

const MISMATCH_LABELS: Record<MismatchReason, string> = {
  catchup: 'CatchUp',
  geo: 'Geo-Sperre',
};

export default function LegalCheckPage() {
  const [result, setResult] = useState<LegalCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/legal-check/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Fehler beim Verarbeiten der Datei.');
        return;
      }

      setResult(data as LegalCheckResult);
    } catch {
      setError('Verarbeitung fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function exportRows(rows: ComparisonRow[], filename: string) {
    const header = ['Product Code', 'Titel', 'CatchUp (Excel)', 'CatchUp (API, Tage)', 'GEO-REST (Excel)', 'Geoblocking (API)', 'Abweichung'];
    const lines = rows.map((r) =>
      [
        r.productCode,
        r.title,
        r.catchUpRaw,
        r.apiCatchUpDays != null ? Math.round(r.apiCatchUpDays * 10) / 10 : '',
        r.geoRaw,
        r.apiGeoblocking.join(', '),
        r.mismatches.map((m) => MISMATCH_LABELS[m]).join(', '),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <AppNav />
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-2xl font-bold">Legal Heavy Check</h1>
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap"
        >
          Abmelden
        </button>
      </div>
      <p className="text-slate-400 mb-8">
        Gleicht die geplanten CatchUp-/Geo-Rechte aus dem Legal-Export gegen die tatsächlich live geschaltete
        EPG-API ab. Vergleich läuft direkt beim Upload, es wird nichts gespeichert.
      </p>

      <div className="mb-8 rounded border border-dashed border-slate-700 p-6 text-center">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleUpload}
          className="block w-full text-sm text-slate-300 file:mr-4 file:rounded file:border-0 file:bg-red-600 file:px-4 file:py-2 file:text-white hover:file:bg-red-500 file:cursor-pointer"
        />
        <p className="mt-3 text-xs text-slate-500">
          CSV-Export mit Spalten "Product code", "CatchUp", "GEO-REST." (z. B. "VOD_LEGAL_Infos GESAMTÜBERSICHT").
        </p>
        {loading && <p className="mt-3 text-sm text-slate-400">Wird verarbeitet, bei ~19.000 Zeilen kann das etwas dauern…</p>}
      </div>

      {error && (
        <div className="mb-8 rounded border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="mb-8 rounded border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
            {result.totalRows} Zeilen in der Datei · {result.notInApi} nicht in der API gefunden (übersprungen) ·{' '}
            {result.unparseable.length} nicht auswertbar · {result.mismatches.length} Abweichung(en)
          </div>

          <Section
            title={`Abweichungen (${result.mismatches.length})`}
            rows={result.mismatches}
            onExport={() => exportRows(result.mismatches, 'legal-check-abweichungen.csv')}
            defaultOpen
            emptyText="Keine Abweichungen gefunden."
          />

          <Section
            title={`CatchUp 7 Tage (${result.catchUpBuckets['7'].length})`}
            rows={result.catchUpBuckets['7']}
            onExport={() => exportRows(result.catchUpBuckets['7'], 'legal-check-catchup-7-tage.csv')}
          />

          <Section
            title={`CatchUp 30 Tage (${result.catchUpBuckets['30'].length})`}
            rows={result.catchUpBuckets['30']}
            onExport={() => exportRows(result.catchUpBuckets['30'], 'legal-check-catchup-30-tage.csv')}
          />

          <Section
            title={`Unbegrenzt verfügbar (${result.catchUpBuckets.unbegrenzt.length})`}
            rows={result.catchUpBuckets.unbegrenzt}
            onExport={() => exportRows(result.catchUpBuckets.unbegrenzt, 'legal-check-unbegrenzt.csv')}
          />

          {result.unparseable.length > 0 && (
            <details className="mb-8 rounded border border-slate-800">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-300">
                Nicht auswertbar ({result.unparseable.length})
              </summary>
              <p className="px-4 pb-2 text-xs text-slate-500">
                CatchUp- oder GEO-REST.-Wert konnte nicht eindeutig interpretiert werden (z. B. Freitext,
                Spalten-Verrutscher, unsichere "?"-Markierung) - wurden nicht geraten, sondern hier gesammelt.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Product Code</th>
                      <th className="px-3 py-2 text-left font-medium">Titel</th>
                      <th className="px-3 py-2 text-left font-medium">CatchUp</th>
                      <th className="px-3 py-2 text-left font-medium">GEO-REST.</th>
                      <th className="px-3 py-2 text-left font-medium">Grund</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.unparseable.map((r) => (
                      <tr key={r.productCode} className="border-t border-slate-800">
                        <td className="px-3 py-2">{r.productCode}</td>
                        <td className="px-3 py-2">{r.title}</td>
                        <td className="px-3 py-2">{r.catchUpRaw}</td>
                        <td className="px-3 py-2">{r.geoRaw}</td>
                        <td className="px-3 py-2 text-slate-400">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </main>
  );
}

function Section({
  title,
  rows,
  onExport,
  defaultOpen = false,
  emptyText = 'Keine Einträge.',
}: {
  title: string;
  rows: ComparisonRow[];
  onExport: () => void;
  defaultOpen?: boolean;
  emptyText?: string;
}) {
  return (
    <details className="mb-8 rounded border border-slate-800" open={defaultOpen}>
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold text-slate-300">{title}</span>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onExport();
            }}
            className="rounded bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-500"
          >
            CSV-Export
          </button>
        )}
      </summary>

      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Product Code</th>
                <th className="px-3 py-2 text-left font-medium">Titel</th>
                <th className="px-3 py-2 text-left font-medium">CatchUp (Excel)</th>
                <th className="px-3 py-2 text-left font-medium">CatchUp (API)</th>
                <th className="px-3 py-2 text-left font-medium">GEO-REST. (Excel)</th>
                <th className="px-3 py-2 text-left font-medium">Geoblocking (API)</th>
                <th className="px-3 py-2 text-left font-medium">Abweichung</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productCode} className="border-t border-slate-800 hover:bg-slate-900/50">
                  <td className="px-3 py-2">{r.productCode}</td>
                  <td className="px-3 py-2">{r.title}</td>
                  <td className="px-3 py-2">{r.catchUpRaw}</td>
                  <td className="px-3 py-2">{r.apiCatchUpDays != null ? `${Math.round(r.apiCatchUpDays * 10) / 10} Tage` : '–'}</td>
                  <td className="px-3 py-2">{r.geoRaw || '–'}</td>
                  <td className="px-3 py-2">{r.apiGeoblocking.length > 0 ? r.apiGeoblocking.join(', ') : '–'}</td>
                  <td className="px-3 py-2">
                    {r.mismatches.length > 0 ? (
                      <span className="rounded border border-red-800 bg-red-950/50 px-2 py-1 text-xs text-red-300">
                        {r.mismatches.map((m) => MISMATCH_LABELS[m]).join(', ')}
                      </span>
                    ) : (
                      '–'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

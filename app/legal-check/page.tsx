'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppNav } from '@/components/AppNav';
import { DatePicker } from '@/components/DatePicker';
import { downloadXlsx } from '@/lib/download-xlsx';

type MismatchReason = 'catchup' | 'geo';
type Daypart = 'PRIME-TIME' | 'LATE-PRIME' | null;

type ComparisonRow = {
  productCode: string;
  assetId: string | null;
  title: string;
  label: string | null;
  titleShort: string | null;
  catchUpRaw: string;
  geoRaw: string;
  apiCatchUpDays: number | null;
  apiGeoblocking: string[];
  daypart: Daypart;
  mismatches: MismatchReason[];
};

type UnparseableRow = {
  productCode: string;
  assetId: string | null;
  title: string;
  label: string | null;
  titleShort: string | null;
  catchUpRaw: string;
  geoRaw: string;
  daypart: Daypart;
  reason: string;
};

type LegalCheckResult = {
  mismatches: ComparisonRow[];
  catchUpBuckets: Record<'7' | '30' | 'unbegrenzt', ComparisonRow[]>;
  unparseable: UnparseableRow[];
  notInApi: number;
  outsideDateRange: number;
  totalRows: number;
};

const MISMATCH_LABELS: Record<MismatchReason, string> = {
  catchup: 'CatchUp',
  geo: 'Geo-Sperre',
};

const DAYPART_STYLES: Record<'PRIME-TIME' | 'LATE-PRIME', string> = {
  'PRIME-TIME': 'border-amber-800 bg-amber-950/50 text-amber-300',
  'LATE-PRIME': 'border-indigo-800 bg-indigo-950/50 text-indigo-300',
};

function DaypartBadge({ daypart }: { daypart: Daypart }) {
  if (!daypart) return <>{'–'}</>;
  return (
    <span className={`rounded border px-2 py-1 text-xs ${DAYPART_STYLES[daypart]}`}>{daypart}</span>
  );
}

const COMPARISON_ROW_HEADERS = [
  'Product Code',
  'Label',
  'Titel (kurz)',
  'Daypart',
  'CatchUp (Excel)',
  'CatchUp (API, Tage)',
  'GEO-REST (Excel)',
  'Geoblocking (API)',
  'Abweichung',
];

function comparisonRowToXlsxRow(r: ComparisonRow): (string | number)[] {
  return [
    r.productCode,
    r.label ?? r.title,
    r.titleShort ?? '',
    r.daypart ?? '',
    r.catchUpRaw,
    r.apiCatchUpDays != null ? Math.round(r.apiCatchUpDays * 10) / 10 : '',
    r.geoRaw,
    r.apiGeoblocking.join(', '),
    r.mismatches.map((m) => MISMATCH_LABELS[m]).join(', '),
  ];
}

export default function LegalCheckPage() {
  const [result, setResult] = useState<LegalCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Dieselbe Zeile kann gleichzeitig in mehreren Tabellen auftauchen (z. B.
  // Abweichungen + CatchUp 7 Tage) - eine Map über den Product Code dedupliziert
  // automatisch, egal in welcher Tabelle sie markiert wurde.
  const rowsByProductCode = useMemo(() => {
    const map = new Map<string, ComparisonRow>();
    if (!result) return map;
    for (const r of [
      ...result.mismatches,
      ...result.catchUpBuckets['7'],
      ...result.catchUpBuckets['30'],
      ...result.catchUpBuckets.unbegrenzt,
    ]) {
      map.set(r.productCode, r);
    }
    return map;
  }, [result]);

  function toggleSelected(productCode: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productCode)) next.delete(productCode);
      else next.add(productCode);
      return next;
    });
  }

  function toggleSelectedMany(productCodes: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const code of productCodes) {
        if (checked) next.add(code);
        else next.delete(code);
      }
      return next;
    });
  }

  async function exportSelected() {
    const rows = [...selected].map((code) => rowsByProductCode.get(code)).filter((r): r is ComparisonRow => Boolean(r));
    await downloadXlsx('legal-check-ausgewaehlte-ergebnisse.xlsx', [
      { name: 'Ausgewählte Ergebnisse', headers: COMPARISON_ROW_HEADERS, rows: rows.map(comparisonRowToXlsxRow) },
    ]);
  }

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
    setSelected(new Set());

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (dateFrom) formData.append('dateFrom', dateFrom);
      if (dateTo) formData.append('dateTo', dateTo);

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

  async function exportRows(rows: ComparisonRow[], filename: string) {
    await downloadXlsx(filename, [
      { name: 'Ergebnisse', headers: COMPARISON_ROW_HEADERS, rows: rows.map(comparisonRowToXlsxRow) },
    ]);
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

      <div className="mb-4 flex flex-wrap items-end gap-4 rounded border border-slate-800 bg-slate-900/50 p-4">
        <DatePicker label="Zeitraum von" value={dateFrom} onChange={setDateFrom} />
        <DatePicker label="bis" value={dateTo} onChange={setDateTo} />
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
            className="text-sm text-slate-400 underline decoration-slate-600 hover:text-slate-200 hover:decoration-slate-300"
          >
            Zurücksetzen
          </button>
        )}
        <p className="text-xs text-slate-500">
          Filtert nach dem tatsächlichen Start der VOD-Rechte laut API (vod_rights.start). Leer lassen für alle
          Zeiträume.
        </p>
      </div>

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
        {loading && (
          <p className="mt-3 text-sm text-slate-400">
            Wird verarbeitet (inkl. CMS-Abgleich für Titel), kann bei vielen Treffern etwas dauern…
          </p>
        )}
      </div>

      {error && (
        <div className="mb-8 rounded border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
            <span>
              {result.totalRows} Zeilen in der Datei · {result.notInApi} nicht in der API gefunden (übersprungen)
              {result.outsideDateRange > 0 ? ` · ${result.outsideDateRange} außerhalb des Zeitraums` : ''} ·{' '}
              {result.unparseable.length} nicht auswertbar · {result.mismatches.length} Abweichung(en)
            </span>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={exportSelected}
                className="rounded bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-500"
              >
                Ausgewählte exportieren ({selected.size})
              </button>
            )}
          </div>

          <Section
            title={`Abweichungen (${result.mismatches.length})`}
            rows={result.mismatches}
            onExport={() => exportRows(result.mismatches, 'legal-check-abweichungen.xlsx')}
            selected={selected}
            onToggle={toggleSelected}
            onToggleAll={toggleSelectedMany}
            defaultOpen
            emptyText="Keine Abweichungen gefunden."
          />

          <Section
            title={`CatchUp 7 Tage (${result.catchUpBuckets['7'].length})`}
            rows={result.catchUpBuckets['7']}
            onExport={() => exportRows(result.catchUpBuckets['7'], 'legal-check-catchup-7-tage.xlsx')}
            selected={selected}
            onToggle={toggleSelected}
            onToggleAll={toggleSelectedMany}
          />

          <Section
            title={`CatchUp 30 Tage (${result.catchUpBuckets['30'].length})`}
            rows={result.catchUpBuckets['30']}
            onExport={() => exportRows(result.catchUpBuckets['30'], 'legal-check-catchup-30-tage.xlsx')}
            selected={selected}
            onToggle={toggleSelected}
            onToggleAll={toggleSelectedMany}
          />

          <Section
            title={`Unbegrenzt verfügbar (${result.catchUpBuckets.unbegrenzt.length})`}
            rows={result.catchUpBuckets.unbegrenzt}
            onExport={() => exportRows(result.catchUpBuckets.unbegrenzt, 'legal-check-unbegrenzt.xlsx')}
            selected={selected}
            onToggle={toggleSelected}
            onToggleAll={toggleSelectedMany}
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
                      <th className="px-3 py-2 text-left font-medium">Label</th>
                      <th className="px-3 py-2 text-left font-medium">Titel (kurz)</th>
                      <th className="px-3 py-2 text-left font-medium">Daypart</th>
                      <th className="px-3 py-2 text-left font-medium">CatchUp</th>
                      <th className="px-3 py-2 text-left font-medium">GEO-REST.</th>
                      <th className="px-3 py-2 text-left font-medium">Grund</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.unparseable.map((r) => (
                      <tr key={r.productCode} className="border-t border-slate-800">
                        <td className="px-3 py-2">{r.productCode}</td>
                        <td className="px-3 py-2">{r.label ?? r.title}</td>
                        <td className="px-3 py-2">{r.titleShort ?? '–'}</td>
                        <td className="px-3 py-2">
                          <DaypartBadge daypart={r.daypart} />
                        </td>
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
  selected,
  onToggle,
  onToggleAll,
  defaultOpen = false,
  emptyText = 'Keine Einträge.',
}: {
  title: string;
  rows: ComparisonRow[];
  onExport: () => void;
  selected: Set<string>;
  onToggle: (productCode: string) => void;
  onToggleAll: (productCodes: string[], checked: boolean) => void;
  defaultOpen?: boolean;
  emptyText?: string;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.productCode));

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
            Excel-Export
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
                <th className="px-3 py-2 text-left font-medium">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) =>
                      onToggleAll(
                        rows.map((r) => r.productCode),
                        e.target.checked
                      )
                    }
                    aria-label="Alle in dieser Tabelle auswählen"
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">Product Code</th>
                <th className="px-3 py-2 text-left font-medium">Label</th>
                <th className="px-3 py-2 text-left font-medium">Titel (kurz)</th>
                <th className="px-3 py-2 text-left font-medium">Daypart</th>
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
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.productCode)}
                      onChange={() => onToggle(r.productCode)}
                      aria-label={`${r.productCode} auswählen`}
                    />
                  </td>
                  <td className="px-3 py-2">{r.productCode}</td>
                  <td className="px-3 py-2">{r.label ?? r.title}</td>
                  <td className="px-3 py-2">{r.titleShort ?? '–'}</td>
                  <td className="px-3 py-2">
                    <DaypartBadge daypart={r.daypart} />
                  </td>
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

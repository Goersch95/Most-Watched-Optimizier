'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RankedTable } from '@/components/RankedTable';
import { RAIL_LINKS } from '@/lib/constants';
import type { UploadResult } from '@/lib/types';

export default function HomePage() {
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  async function submitFormData(formData: FormData) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Unbekannter Fehler beim Verarbeiten der Daten.');
        return;
      }

      setResult(data as UploadResult);
    } catch {
      setError('Verarbeitung fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setLoading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    await submitFormData(formData);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handlePasteSubmit() {
    if (!pastedText.trim()) return;

    const formData = new FormData();
    formData.append('text', pastedText);
    await submitFormData(formData);
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-2xl font-bold">Most Watched Optimizer</h1>
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap"
        >
          Abmelden
        </button>
      </div>
      <p className="text-slate-400 mb-8">
        CSV aus dem Traffic-Dashboard hochladen, mit dem CMS abgleichen und die Top-Rails direkt bearbeiten.
      </p>

      <div className="mb-8 rounded border border-dashed border-slate-700 p-6 text-center">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          className="block w-full text-sm text-slate-300 file:mr-4 file:rounded file:border-0 file:bg-red-600 file:px-4 file:py-2 file:text-white hover:file:bg-red-500 file:cursor-pointer"
        />
        {loading && <p className="mt-3 text-sm text-slate-400">Wird verarbeitet…</p>}
      </div>

      <details className="mb-8 rounded border border-slate-700 p-6">
        <summary className="cursor-pointer text-sm font-medium text-slate-300">
          Kein CSV-Export möglich? Text einfügen
        </summary>
        <p className="mt-3 text-sm text-slate-400">
          Aus dem Dashboard direkt die Tabelle markieren und kopieren (Zeilen abwechselnd Asset-ID und Views) und
          hier einfügen.
        </p>
        <textarea
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          rows={6}
          placeholder={'AA1IHU82IXXJIA9UX4NV\n4744\nAAZ07YTUP9UF7BL1G2XR\n1104'}
          className="mt-3 w-full rounded border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200 placeholder:text-slate-600"
        />
        <button
          type="button"
          onClick={handlePasteSubmit}
          disabled={loading || !pastedText.trim()}
          className="mt-3 rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Verarbeiten
        </button>
      </details>

      {error && (
        <div className="mb-8 rounded border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && !result.cmsConnected && (
        <div className="mb-8 rounded border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          CMS-API ist noch nicht konfiguriert. Titel und Sendung/Clip-Zuordnung basieren aktuell auf einer
          Platzhalter-Heuristik anhand des ID-Präfixes, nicht auf echten CMS-Daten.
        </div>
      )}

      {result && (
        <div className="flex flex-col lg:flex-row gap-8">
          <RankedTable title="Meistgesehene Sendungen" rows={result.shows} railLink={RAIL_LINKS.shows} />
          <RankedTable title="Meistgesehene Clips" rows={result.clips} railLink={RAIL_LINKS.clips} />
        </div>
      )}

      {result && result.unknown.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-2 text-slate-400">Nicht zuordenbar</h2>
          <p className="text-sm text-slate-500 mb-3">
            Diese IDs konnten weder als Sendung noch als Clip erkannt werden (CMS-Metadaten fehlen oder Präfix
            unbekannt).
          </p>
          <RankedTable title="" rows={result.unknown} />
        </div>
      )}
    </main>
  );
}

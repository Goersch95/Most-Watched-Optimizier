import type { EnrichedRow } from '@/lib/types';
import { CopyButton } from './CopyButton';

export function RankedTable({
  title,
  rows,
  railLink,
}: {
  title: string;
  rows: EnrichedRow[];
  railLink?: string;
}) {
  return (
    <section className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-3">
        {title && <h2 className="text-lg font-semibold">{title}</h2>}
        {railLink && (
          <a
            href={railLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm rounded bg-red-600 hover:bg-red-500 px-3 py-1.5 font-medium transition-colors whitespace-nowrap"
          >
            Rail im CMS bearbeiten →
          </a>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-slate-400 text-sm">Keine Einträge.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="text-left px-3 py-2 font-medium w-10">#</th>
                <th className="text-left px-3 py-2 font-medium">Titel</th>
                <th className="text-left px-3 py-2 font-medium">Asset-ID</th>
                <th className="text-right px-3 py-2 font-medium">Views</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.assetId} className="border-t border-slate-800 hover:bg-slate-900/50">
                  <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2">{row.title}</td>
                  <td className="px-3 py-2">
                    <CopyButton value={row.assetId} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.viewCount.toLocaleString('de-DE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

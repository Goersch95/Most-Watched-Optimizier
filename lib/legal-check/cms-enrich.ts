import { fetchCmsProduct } from '@/lib/cms-client';
import type { ComparisonRow, UnparseableRow } from './types';

const BATCH_SIZE = 10;

type CmsLabelInfo = { label: string | null; titleShort: string | null };

/**
 * Holt `label` und `title_short` von derselben CMS-Scheduling-API, die auch
 * der Most-Watched-Abgleich nutzt - über die assetId aus dem EPG-Eintrag
 * (nicht über den "Product code"/vin, andere ID-Welt). Batches wie
 * enrichRows() in lib/cms-client.ts, um die API nicht mit hunderten
 * gleichzeitigen Requests zu bombardieren.
 */
async function fetchCmsLabels(assetIds: string[]): Promise<Map<string, CmsLabelInfo>> {
  const unique = Array.from(new Set(assetIds));
  const map = new Map<string, CmsLabelInfo>();

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (id) => {
        const data = await fetchCmsProduct(id);
        return [
          id,
          {
            label: typeof data?.label === 'string' ? data.label : null,
            titleShort: typeof data?.title_short === 'string' ? data.title_short : null,
          },
        ] as const;
      })
    );
    for (const [id, info] of results) map.set(id, info);
  }

  return map;
}

function applyLabels<T extends { assetId: string | null; label: string | null; titleShort: string | null }>(
  rows: T[],
  labels: Map<string, CmsLabelInfo>
): T[] {
  return rows.map((row) => {
    const info = row.assetId ? labels.get(row.assetId) : undefined;
    return { ...row, label: info?.label ?? null, titleShort: info?.titleShort ?? null };
  });
}

export async function enrichWithCmsLabels<
  T extends { mismatches: ComparisonRow[]; catchUpBuckets: Record<string, ComparisonRow[]>; unparseable: UnparseableRow[] },
>(result: T): Promise<T> {
  const allAssetIds = [
    ...result.mismatches,
    ...Object.values(result.catchUpBuckets).flat(),
    ...result.unparseable,
  ]
    .map((r) => r.assetId)
    .filter((id): id is string => Boolean(id));

  const labels = await fetchCmsLabels(allAssetIds);

  return {
    ...result,
    mismatches: applyLabels(result.mismatches, labels),
    catchUpBuckets: Object.fromEntries(
      Object.entries(result.catchUpBuckets).map(([key, rows]) => [key, applyLabels(rows, labels)])
    ) as T['catchUpBuckets'],
    unparseable: applyLabels(result.unparseable, labels),
  };
}

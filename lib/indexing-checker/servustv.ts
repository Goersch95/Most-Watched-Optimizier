import { fetchCmsProduct } from '@/lib/cms-client';

export function buildServusTvUrl(assetId: string): string {
  return `https://www.servustv.com/de/page/${encodeURIComponent(assetId)}`;
}

/**
 * T1 = realer Publish-Zeitpunkt. Die Scheduling-API hat kein Feld, das
 * explizit "publish_date" heißt - `vis_start` (Sichtbarkeits-Start) ist der
 * plausibelste Kandidat und wurde als Annahme bestätigt. Falls sich das an
 * echten Daten als falsch herausstellt, ist das der einzige Ort, der
 * angepasst werden muss.
 */
export async function fetchPublishDate(assetId: string): Promise<string | null> {
  const data = await fetchCmsProduct(assetId);
  const visStart = data?.vis_start;
  return typeof visStart === 'string' ? visStart : null;
}

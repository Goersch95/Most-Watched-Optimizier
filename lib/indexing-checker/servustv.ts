import { fetchCmsProduct } from '@/lib/cms-client';

export function buildServusTvUrl(assetId: string): string {
  return `https://www.servustv.com/de/page/${encodeURIComponent(assetId)}`;
}

/**
 * T1 = realer Publish-Zeitpunkt = `play_start` (Zeitpunkt ab wann bei
 * ServusTV On verfügbar, entspricht "Current Sunrise" im Dashboard-Export) -
 * bestätigtes Feld, keine Annahme mehr.
 */
export async function fetchPublishDate(assetId: string): Promise<string | null> {
  const data = await fetchCmsProduct(assetId);
  const playStart = data?.play_start;
  return typeof playStart === 'string' ? playStart : null;
}

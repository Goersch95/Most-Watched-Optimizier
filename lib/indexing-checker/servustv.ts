import { fetchCmsProduct } from '@/lib/cms-client';

export function buildServusTvUrl(assetId: string): string {
  return `https://www.servustv.com/de/page/${encodeURIComponent(assetId)}`;
}

/**
 * Extrahiert die href aus einem `<link rel="canonical" ...>`-Tag, falls
 * vorhanden - unabhängig von der Attribut-Reihenfolge im Tag.
 */
function extractCanonicalUrl(html: string): string | null {
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];

  for (const tag of linkTags) {
    if (!/rel=["']canonical["']/i.test(tag)) continue;
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (hrefMatch) return hrefMatch[1];
  }

  return null;
}

/**
 * ServusTV liefert dieselbe Seite sowohl unter der reinen ID-URL als auch
 * unter einer sprechenden URL mit Slug aus (kein Redirect zwischen beiden -
 * live verifiziert), erklärt aber per `<link rel="canonical">` im HTML,
 * welche der beiden die tatsächlich von Google indexierte ist. Ohne diesen
 * Abgleich prüft die Search-Console-URL-Inspection-API (exaktes Matching,
 * anders als Serpers unscharfe `site:`-Suche) die falsche URL und liefert
 * fälschlich "unknown" zurück, obwohl die Seite unter der Slug-URL
 * tatsächlich indexiert ist.
 *
 * Ein Fetch statt zwei getrennter (Live-Check + Canonical-Auflösung) -
 * der Live-Check braucht ohnehin den vollen Response-Body.
 */
export async function checkLiveAndResolveCanonical(
  url: string
): Promise<{ live: boolean; canonicalUrl: string | null }> {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', cache: 'no-store' });
    if (!res.ok) return { live: false, canonicalUrl: null };

    const html = await res.text();
    return { live: true, canonicalUrl: extractCanonicalUrl(html) };
  } catch {
    return { live: false, canonicalUrl: null };
  }
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

/**
 * Auffindbarkeits-Check über Googles offizielle Custom Search JSON API
 * (Programmable Search Engine), nicht per Scraping (Blocking-Risiko würde
 * die Zeitstempel-Messung entwerten) und nicht per Search Console (kein
 * Zugriff auf die ServusTV-On-Property). Bewusst als einzelne, leicht
 * austauschbare Funktion gekapselt - das Tageslimit wird separat in
 * lib/indexing-checker/db.ts durchgesetzt, nicht hier.
 */
export async function isUrlIndexedByGoogle(assetId: string, url: string): Promise<boolean> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;

  if (!apiKey || !cx) return false;

  const params = new URLSearchParams({ key: apiKey, cx, q: `"${url}"` });

  try {
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`, {
      cache: 'no-store',
    });

    if (!res.ok) return false;

    const data = await res.json();
    const items: unknown = data.items;
    if (!Array.isArray(items)) return false;

    return items.some((item) => typeof item?.link === 'string' && item.link.includes(assetId));
  } catch {
    return false;
  }
}

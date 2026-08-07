/**
 * Auffindbarkeits-Check über Serper.dev (Drittanbieter-SERP-API auf Basis
 * echter Google-Suchergebnisse), nicht per Scraping (Blocking-Risiko würde
 * die Zeitstempel-Messung entwerten) und nicht per Search Console (kein
 * Zugriff auf die ServusTV-On-Property).
 *
 * Ersetzt die vorherige Google Custom Search JSON API: die wurde für
 * Neukunden geschlossen (Google stellt sie zum 1.1.2027 komplett ein) und
 * blieb bei uns durchgängig mit 403 PERMISSION_DENIED gesperrt, obwohl
 * Billing/API-Aktivierung/Key-Konfiguration nachweislich korrekt waren -
 * offenbar reine Google-seitige Policy, nicht behebbar. Vertex AI Search
 * (Googles offiziell empfohlener Ersatz) wurde geprüft und verworfen: es
 * durchsucht nicht den öffentlichen Google-Webindex, sondern nur selbst
 * angegebene Inhalte - würde also nie widerspiegeln, ob eine Seite
 * tatsächlich für normale Nutzer in der echten Google-Suche auftaucht.
 *
 * Bewusst als einzelne, leicht austauschbare Funktion gekapselt - das
 * Tageslimit wird separat in lib/indexing-checker/pipeline.ts durchgesetzt,
 * nicht hier.
 */
export async function isUrlIndexedByGoogle(assetId: string, url: string): Promise<boolean> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return false;

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      // Live verifiziert: eine bloße URL als Freitext-Query matcht auch
      // Seiten, die die URL nur als Text erwähnen (z. B. ein Facebook-Post,
      // der die URL im Snippet zitiert), nicht nur die URL selbst - false
      // negative trotz tatsächlich indexierter Seite. "site:" schränkt
      // gezielt auf die URL selbst ein, zuverlässige Standardmethode für
      // einen Indexierungs-Check.
      body: JSON.stringify({ q: `site:${url}` }),
      cache: 'no-store',
    });

    if (!res.ok) return false;

    const data = await res.json();
    const organic: unknown = data.organic;
    if (!Array.isArray(organic)) return false;

    return organic.some((item) => typeof item?.link === 'string' && item.link.includes(assetId));
  } catch {
    return false;
  }
}

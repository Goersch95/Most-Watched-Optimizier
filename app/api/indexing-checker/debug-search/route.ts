import { NextRequest, NextResponse } from 'next/server';
import { buildServusTvUrl, checkLiveAndResolveCanonical } from '@/lib/indexing-checker/servustv';

export const dynamic = 'force-dynamic';

async function serperQuery(apiKey: string, q: string) {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q }),
    cache: 'no-store',
  });
  const data = await res.json();
  return { q, httpStatus: res.status, response: data };
}

/**
 * Diagnose-Endpoint, um die rohe Antwort der Serper.dev-API für eine ID zu
 * sehen (kein Boolean wie isUrlIndexedByGoogle). Fragt bewusst DREI
 * Query-Varianten ab, um Googles `site:`-Verhalten für diese eine ID zu
 * vergleichen:
 * 1. `site:` + rohe ID-URL (die alte Query, vor dem Canonical-Fix)
 * 2. `site:` + aufgelöste Slug-URL (die aktuelle Produktions-Query)
 * 3. `site:servustv.com inurl:<ID>` (nur Domain-Einschränkung statt
 *    vollständigem Pfad, testweise - Verdacht: eine sehr spezifische
 *    Pfad-Einschränkung bei `site:` liefert teils unvollständigere
 *    Ergebnisse als eine breitere Domain-Einschränkung + `inurl:`-Filter)
 *
 * Rein diagnostisch, ändert nichts an der echten Prüf-Logik
 * (isUrlIndexedByGoogle). Geschützt durch die normale Session-Cookie-Prüfung
 * wie jede andere Nicht-Poll-Route.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Query-Parameter "id" fehlt, z. B. /api/indexing-checker/debug-search?id=AAW0JVVWYBVDFKG7MWKS' },
      { status: 400 }
    );
  }

  const apiKey = process.env.SERPER_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'SERPER_API_KEY ist nicht gesetzt.' }, { status: 500 });
  }

  const bareUrl = buildServusTvUrl(id);
  const { live, canonicalUrl } = await checkLiveAndResolveCanonical(bareUrl);

  try {
    const bareResult = await serperQuery(apiKey, `site:${bareUrl}`);
    const canonicalResult = canonicalUrl ? await serperQuery(apiKey, `site:${canonicalUrl}`) : null;
    const domainInurlResult = await serperQuery(apiKey, `site:servustv.com inurl:${id}`);

    return NextResponse.json({
      bareUrl,
      live,
      canonicalUrl,
      bareUrlQuery: bareResult,
      canonicalUrlQuery: canonicalResult,
      domainInurlQuery: domainInurlResult,
    });
  } catch (err) {
    return NextResponse.json(
      { bareUrl, live, canonicalUrl, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

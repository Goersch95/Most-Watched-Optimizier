import { NextRequest, NextResponse } from 'next/server';
import { buildServusTvUrl, checkLiveAndResolveCanonical } from '@/lib/indexing-checker/servustv';

export const dynamic = 'force-dynamic';

async function serperSiteQuery(apiKey: string, url: string) {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: `site:${url}` }),
    cache: 'no-store',
  });
  const data = await res.json();
  return { httpStatus: res.status, response: data };
}

/**
 * Diagnose-Endpoint, um die rohe Antwort der Serper.dev-API für eine ID zu
 * sehen (kein Boolean wie isUrlIndexedByGoogle). Fragt bewusst BEIDE
 * URL-Varianten ab - die rohe ID-URL und die per <link rel="canonical">
 * aufgelöste Slug-URL (dieselbe, die das echte Polling seit dem
 * Canonical-Fix tatsächlich verwendet) - um zu prüfen, ob Googles
 * `site:`-Operator bei der langen, spezifischen Slug-URL schlechter matcht
 * als bei der kurzen ID-URL. Geschützt durch die normale
 * Session-Cookie-Prüfung wie jede andere Nicht-Poll-Route.
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
    const bareResult = await serperSiteQuery(apiKey, bareUrl);
    const canonicalResult = canonicalUrl ? await serperSiteQuery(apiKey, canonicalUrl) : null;

    return NextResponse.json({
      bareUrl,
      live,
      canonicalUrl,
      bareUrlQuery: bareResult,
      canonicalUrlQuery: canonicalResult,
    });
  } catch (err) {
    return NextResponse.json(
      { bareUrl, live, canonicalUrl, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

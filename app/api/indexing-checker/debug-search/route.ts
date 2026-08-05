import { NextRequest, NextResponse } from 'next/server';
import { buildServusTvUrl } from '@/lib/indexing-checker/servustv';

export const dynamic = 'force-dynamic';

/**
 * Diagnose-Endpoint, um die rohe Antwort der Google Custom Search API für
 * eine ID zu sehen (kein Boolean wie isUrlIndexedByGoogle). Geschützt durch
 * die normale Session-Cookie-Prüfung wie jede andere Nicht-Poll-Route.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Query-Parameter "id" fehlt, z. B. /api/indexing-checker/debug-search?id=AAW0JVVWYBVDFKG7MWKS' },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;

  if (!apiKey || !cx) {
    return NextResponse.json({ error: 'GOOGLE_CSE_API_KEY oder GOOGLE_CSE_CX ist nicht gesetzt.' }, { status: 500 });
  }

  const url = buildServusTvUrl(id);
  const params = new URLSearchParams({ key: apiKey, cx, q: url });
  const apiUrl = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;

  try {
    const res = await fetch(apiUrl, { cache: 'no-store' });
    const data = await res.json();

    return NextResponse.json({
      requestedUrl: url,
      googleApiHttpStatus: res.status,
      response: data,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

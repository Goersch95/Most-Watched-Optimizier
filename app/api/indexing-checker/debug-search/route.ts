import { NextRequest, NextResponse } from 'next/server';
import { buildServusTvUrl } from '@/lib/indexing-checker/servustv';

export const dynamic = 'force-dynamic';

/**
 * Diagnose-Endpoint, um die rohe Antwort der Serper.dev-API für eine ID zu
 * sehen (kein Boolean wie isUrlIndexedByGoogle). Geschützt durch die normale
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

  const url = buildServusTvUrl(id);

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: `site:${url}` }),
      cache: 'no-store',
    });
    const data = await res.json();

    return NextResponse.json({
      requestedUrl: url,
      serperApiHttpStatus: res.status,
      response: data,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

import { JWT } from 'google-auth-library';
import { NextRequest, NextResponse } from 'next/server';
import { buildServusTvUrl, checkLiveAndResolveCanonical } from '@/lib/indexing-checker/servustv';
import { normalizePrivateKey } from '@/lib/indexing-checker-gsc/search-console-client';

export const dynamic = 'force-dynamic';

/**
 * Diagnose-Endpoint, um die rohe Antwort der Search Console URL Inspection
 * API für eine ID zu sehen (kein Boolean wie isUrlIndexedByGoogleSearchConsole).
 * Geschützt durch die normale Session-Cookie-Prüfung wie jede andere
 * Nicht-Poll-Route.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Query-Parameter "id" fehlt, z. B. /api/indexing-checker-gsc/debug-search?id=AAW0JVVWYBVDFKG7MWKS' },
      { status: 400 }
    );
  }

  const email = process.env.GSC_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GSC_SERVICE_ACCOUNT_PRIVATE_KEY;
  const siteUrl = process.env.GSC_SITE_URL;

  if (!email || !rawKey || !siteUrl) {
    return NextResponse.json(
      { error: 'GSC_SERVICE_ACCOUNT_EMAIL, GSC_SERVICE_ACCOUNT_PRIVATE_KEY oder GSC_SITE_URL ist nicht gesetzt.' },
      { status: 500 }
    );
  }

  const bareUrl = buildServusTvUrl(id);
  // ServusTV liefert dieselbe Seite ohne Redirect sowohl unter der reinen
  // ID-URL als auch einer Slug-URL aus, aber nur die per <link rel="canonical">
  // deklarierte Slug-URL wird von Google tatsächlich indexiert - die
  // Inspection muss deshalb gegen die aufgelöste URL laufen, nicht die rohe.
  const { live, canonicalUrl } = await checkLiveAndResolveCanonical(bareUrl);
  const url = canonicalUrl ?? bareUrl;

  const client = new JWT({
    email,
    key: normalizePrivateKey(rawKey),
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });

  try {
    const res = await client.request({
      url: 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
      method: 'POST',
      data: { inspectionUrl: url, siteUrl },
    });

    return NextResponse.json({
      bareUrl,
      live,
      canonicalUrl,
      requestedUrl: url,
      searchConsoleHttpStatus: res.status,
      response: res.data,
    });
  } catch (err) {
    const anyErr = err as { response?: { status?: number; data?: unknown }; message?: string };
    return NextResponse.json(
      {
        bareUrl,
        live,
        canonicalUrl,
        requestedUrl: url,
        searchConsoleHttpStatus: anyErr.response?.status ?? null,
        response: anyErr.response?.data ?? null,
        error: anyErr.message ?? String(err),
      },
      { status: 500 }
    );
  }
}

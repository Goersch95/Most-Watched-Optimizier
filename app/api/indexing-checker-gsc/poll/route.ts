import { NextRequest, NextResponse } from 'next/server';
import { runPollingPass } from '@/lib/indexing-checker-gsc/pipeline';

/**
 * Eigener Coolify Scheduled Task + eigenes Secret, unabhängig vom
 * Serper-Checker (INDEXING_POLL_SECRET) - beide Checker laufen komplett
 * parallel und unabhängig voneinander.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INDEXING_GSC_POLL_SECRET;
  const authHeader = req.headers.get('authorization');

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  try {
    const result = await runPollingPass('auto');
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: `Unerwarteter Fehler beim Polling: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

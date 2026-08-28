import { NextRequest, NextResponse } from 'next/server';
import { runPollingPass } from '@/lib/indexing-checker/pipeline';

/**
 * Wird von einem Coolify "Scheduled Task" per curl aufgerufen (z. B. alle
 * 15-30 Min), nicht von der UI - deshalb kein Session-Cookie, sondern ein
 * eigenes Secret. Siehe middleware.ts, das diesen Pfad von der
 * Session-Prüfung ausnimmt.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INDEXING_POLL_SECRET;
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

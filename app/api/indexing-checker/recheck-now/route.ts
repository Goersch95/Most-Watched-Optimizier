import { NextResponse } from 'next/server';
import { resetLiveRowsToDueNow } from '@/lib/indexing-checker/db';
import { resyncLiveRowUrls, runPollingPass } from '@/lib/indexing-checker/pipeline';

/**
 * Von der UI aus auslösbar (normale Session-Cookie-Prüfung, kein Secret wie
 * /poll) - macht alle offenen "live"-Zeilen sofort fällig und stößt direkt
 * einen Polling-Durchlauf an, statt bis zu 24h auf den nächsten planmäßigen
 * Check zu warten (z. B. sinnvoll direkt nach einem Bugfix am Matching).
 */
export async function POST() {
  try {
    const urlsResynced = await resyncLiveRowUrls();
    const reset = resetLiveRowsToDueNow();
    const result = await runPollingPass();
    return NextResponse.json({ reset, urlsResynced, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: `Unerwarteter Fehler beim Neu-Prüfen: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

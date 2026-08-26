import { NextResponse } from 'next/server';
import { resetLiveRowsToDueNow } from '@/lib/indexing-checker-gsc/db';
import { runPollingPass } from '@/lib/indexing-checker-gsc/pipeline';

export async function POST() {
  try {
    const reset = resetLiveRowsToDueNow();
    const result = await runPollingPass();
    return NextResponse.json({ reset, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: `Unerwarteter Fehler beim Neu-Prüfen: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

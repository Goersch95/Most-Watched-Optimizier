import { NextRequest, NextResponse } from 'next/server';
import { lookupIndexedUrl } from '@/lib/indexing-checker-gsc/pipeline';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = body?.id;

  if (typeof id !== 'string') {
    return NextResponse.json({ error: 'Fehlende ID.' }, { status: 400 });
  }

  const result = await lookupIndexedUrl(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Nachschlagen fehlgeschlagen.' }, { status: 400 });
  }

  return NextResponse.json(result);
}

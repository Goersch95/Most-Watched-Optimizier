import { NextRequest, NextResponse } from 'next/server';
import { recheckArchivedRow } from '@/lib/indexing-checker-gsc/pipeline';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const rowId = body?.id;

  if (typeof rowId !== 'string') {
    return NextResponse.json({ error: 'Fehlende ID.' }, { status: 400 });
  }

  const result = await recheckArchivedRow(params.id, rowId);

  if (!result.ok || !result.row) {
    return NextResponse.json({ error: result.error ?? 'Neu-Prüfen fehlgeschlagen.' }, { status: 400 });
  }

  return NextResponse.json({ indexed: result.indexed, row: result.row });
}

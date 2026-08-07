import { NextRequest, NextResponse } from 'next/server';
import { getArchiveById } from '@/lib/indexing-checker/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const archive = getArchiveById(params.id);

  if (!archive) {
    return NextResponse.json({ error: 'Archiv-Eintrag nicht gefunden.' }, { status: 404 });
  }

  return NextResponse.json(archive);
}

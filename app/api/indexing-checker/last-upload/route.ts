import { NextResponse } from 'next/server';
import { getLastUpload, getUploadedFileBuffer } from '@/lib/indexing-checker/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const meta = getLastUpload();
  const buffer = getUploadedFileBuffer();

  if (!meta || !buffer) {
    return NextResponse.json({ error: 'Es wurde noch keine Datei hochgeladen.' }, { status: 404 });
  }

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${meta.filename.replace(/"/g, '')}"`,
    },
  });
}

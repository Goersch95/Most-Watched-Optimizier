import { NextRequest, NextResponse } from 'next/server';
import { parseTrafficCsv } from '@/lib/csv-parser';
import { enrichRows, isCmsConfigured } from '@/lib/cms-client';
import type { UploadResult } from '@/lib/types';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Keine Datei hochgeladen.' }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseTrafficCsv(text);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'Die CSV enthält keine gültigen Zeilen. Erwartet werden Asset-ID und Session-Count je Zeile.' },
      { status: 400 }
    );
  }

  const enriched = await enrichRows(rows);

  const byViewsDesc = (a: { viewCount: number }, b: { viewCount: number }) => b.viewCount - a.viewCount;

  const result: UploadResult = {
    shows: enriched.filter((r) => r.contentType === 'show').sort(byViewsDesc),
    clips: enriched.filter((r) => r.contentType === 'clip').sort(byViewsDesc),
    unknown: enriched.filter((r) => r.contentType === 'unknown').sort(byViewsDesc),
    cmsConnected: isCmsConfigured(),
  };

  return NextResponse.json(result);
}

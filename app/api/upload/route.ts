import { NextRequest, NextResponse } from 'next/server';
import { parsePastedRows, parseTrafficCsv } from '@/lib/csv-parser';
import { enrichRows, isCmsConfigured } from '@/lib/cms-client';
import type { AssetRow, UploadResult } from '@/lib/types';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file');
  const pastedText = formData.get('text');

  let rows: AssetRow[];

  if (file instanceof File) {
    rows = parseTrafficCsv(await file.text());
  } else if (typeof pastedText === 'string' && pastedText.trim()) {
    rows = parsePastedRows(pastedText);
  } else {
    return NextResponse.json({ error: 'Keine Datei hochgeladen und kein Text eingefügt.' }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      {
        error:
          'Keine gültigen Zeilen gefunden. Erwartet werden Asset-ID und Session-Count je Zeile (als CSV oder ' +
          'abwechselnd Asset-ID/Views beim Einfügen).',
      },
      { status: 400 }
    );
  }

  const enriched = await enrichRows(rows);

  const byViewsDesc = (a: { viewCount: number }, b: { viewCount: number }) => b.viewCount - a.viewCount;

  const result: UploadResult = {
    shows: enriched.filter((r) => r.contentType === 'show').sort(byViewsDesc),
    clips: enriched.filter((r) => r.contentType === 'clip').sort(byViewsDesc),
    liveProgram: enriched.filter((r) => r.contentType === 'liveProgram').sort(byViewsDesc),
    tvChannel: enriched.filter((r) => r.contentType === 'tvChannel').sort(byViewsDesc),
    unknown: enriched.filter((r) => r.contentType === 'unknown').sort(byViewsDesc),
    cmsConnected: isCmsConfigured(),
  };

  return NextResponse.json(result);
}

import { NextRequest, NextResponse } from 'next/server';
import { archiveCurrentChecksAndReset, saveUploadedFile, setPendingIds } from '@/lib/indexing-checker/db';
import { ingestId } from '@/lib/indexing-checker/pipeline';
import { parseIdsFromXlsx } from '@/lib/indexing-checker/xlsx-parser';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Keine Datei hochgeladen.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ids = await parseIdsFromXlsx(buffer);

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Keine IDs in der Excel-Datei gefunden.' }, { status: 400 });
    }

    // Bisherige Tracking-Runde archivieren (noch unter dem alten Dateinamen,
    // saveUploadedFile() überschreibt lastUpload erst danach), bevor die neue
    // Datei die aktive Ergebnistabelle übernimmt.
    archiveCurrentChecksAndReset();

    const results = await Promise.all(ids.map(async (id) => ({ id, ...(await ingestId(id)) })));
    const failed = results.filter((r) => !r.ok).map((r) => ({ id: r.id, error: r.error }));
    const ingested = results.length - failed.length;

    saveUploadedFile(buffer, { filename: file.name, ingested, failed: failed.length });
    // Fehlgeschlagene IDs merken - werden bei jedem Poll-Lauf automatisch
    // erneut versucht (z. B. sobald das CMS ein play_start-Datum nachliefert),
    // statt endgültig verworfen zu werden.
    setPendingIds(failed.map((f) => f.id));

    return NextResponse.json({ ingested, failed });
  } catch (err) {
    return NextResponse.json(
      { error: `Unerwarteter Fehler beim Verarbeiten der Excel-Datei: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

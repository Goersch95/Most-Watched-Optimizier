import { NextRequest, NextResponse } from 'next/server';
import { compareLegalData } from '@/lib/legal-check/compare';
import { parseLegalCsv } from '@/lib/legal-check/csv-parser';
import { fetchEpgEntries } from '@/lib/legal-check/epg-client';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Keine Datei hochgeladen.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = parseLegalCsv(buffer);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Keine Zeilen mit "Product code" in der Datei gefunden.' },
        { status: 400 }
      );
    }

    const epgByVin = await fetchEpgEntries();
    const result = compareLegalData(rows, epgByVin);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: `Unerwarteter Fehler: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

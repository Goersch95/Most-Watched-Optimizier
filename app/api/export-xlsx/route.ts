import { NextRequest, NextResponse } from 'next/server';
import { buildXlsxBuffer, type XlsxSheet } from '@/lib/xlsx-export';

/** Generischer Excel-Export-Endpoint - nimmt bereits fertig aufbereitete Tabellen entgegen, baut nur die xlsx-Datei. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const filename = typeof body.filename === 'string' && body.filename ? body.filename : 'export.xlsx';
    const sheets: XlsxSheet[] = Array.isArray(body.sheets) ? body.sheets : [];

    if (sheets.length === 0) {
      return NextResponse.json({ error: 'Keine Daten zum Exportieren.' }, { status: 400 });
    }

    const buffer = await buildXlsxBuffer(sheets);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Export fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

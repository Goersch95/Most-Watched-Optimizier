import ExcelJS from 'exceljs';

export type XlsxSheet = {
  name: string;
  headers: string[];
  rows: (string | number)[][];
};

/**
 * Server-seitig (exceljs hat Node-Abhängigkeiten wie fs/stream, im
 * Browser-Bundle riskant) - Export-Buttons rufen stattdessen
 * /api/export-xlsx auf und laden das fertige Binary herunter.
 */
export async function buildXlsxBuffer(sheets: XlsxSheet[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    // Excel erlaubt max. 31 Zeichen pro Sheet-Namen.
    const ws = workbook.addWorksheet(sheet.name.slice(0, 31));
    ws.addRow(sheet.headers);
    ws.getRow(1).font = { bold: true };

    for (const row of sheet.rows) {
      ws.addRow(row);
    }

    ws.columns.forEach((col) => {
      col.width = 20;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

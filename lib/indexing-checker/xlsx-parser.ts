import ExcelJS from 'exceljs';

function cellText(value: ExcelJS.CellValue): string {
  if (typeof value === 'string') return value.trim();
  if (value != null) return String(value).trim();
  return '';
}

/**
 * Der echte Dashboard-Export ("AssetListExport") hat 14 Spalten, "ID" steht
 * in Spalte D, nicht in Spalte A - deshalb wird die Spalte über die
 * Kopfzeile gesucht statt fix Spalte 1 anzunehmen. Falls keine Spalte
 * "ID" heißt (z. B. eine simple, selbst erstellte Liste ohne Header),
 * wird auf Spalte 1 zurückgefallen und keine Zeile übersprungen.
 */
export async function parseIdsFromXlsx(buffer: Buffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  let idColumn = 1;
  let headerFound = false;

  for (let c = 1; c <= sheet.columnCount; c++) {
    if (cellText(headerRow.getCell(c).value).toLowerCase() === 'id') {
      idColumn = c;
      headerFound = true;
      break;
    }
  }

  const firstDataRow = headerFound ? 2 : 1;
  const ids: string[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < firstDataRow) return;
    const value = cellText(row.getCell(idColumn).value);
    if (value) ids.push(value);
  });

  return ids;
}

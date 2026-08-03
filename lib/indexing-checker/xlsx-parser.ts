import ExcelJS from 'exceljs';

/**
 * Liest die IDs aus der ersten Spalte des ersten Sheets. Erwartet eine Zelle
 * pro ID (mit oder ohne Header-Zeile "ID" o. ä.), keine weiteren Spalten
 * nötig - anders als beim Most-Watched-CSV geht es hier nur um Upcoming-IDs,
 * keine Views.
 */
export async function parseIdsFromXlsx(buffer: Buffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const ids: string[] = [];

  sheet.eachRow((row) => {
    const cellValue = row.getCell(1).value;
    const value =
      typeof cellValue === 'string'
        ? cellValue.trim()
        : cellValue != null
          ? String(cellValue).trim()
          : '';

    if (value && value.toLowerCase() !== 'id') {
      ids.push(value);
    }
  });

  return ids;
}

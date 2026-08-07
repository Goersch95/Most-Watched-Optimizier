export type XlsxSheetInput = {
  name: string;
  headers: string[];
  rows: (string | number)[][];
};

/** Ruft /api/export-xlsx auf und stößt den Datei-Download im Browser an. */
export async function downloadXlsx(filename: string, sheets: XlsxSheetInput[]): Promise<void> {
  const res = await fetch('/api/export-xlsx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, sheets }),
  });

  if (!res.ok) {
    throw new Error('Export fehlgeschlagen.');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

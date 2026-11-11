import type { Worksheet } from 'exceljs';

export const EXPORT_LIMIT = 10_000;
export type ExportRow = (string | number | null | undefined)[];

export interface ExportColumn {
  header: string;
  width?: number;
  numFmt?: string;
}

export type ExportFormatter = (sheet: Worksheet, rows: ExportRow[]) => void;

export function colorCell(sheet: Worksheet, row: number, col: number, ink: string, fill?: string): void {
  const cell = sheet.getCell(row, col);
  cell.font = { ...cell.font, color: { argb: ink.replace('#', 'FF') } };
  if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill.replace('#', 'FF') } };
}

export async function exportExcel(rows: ExportRow[], name: string, columns: ExportColumn[], format?: ExportFormatter): Promise<void> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Details');
  sheet.columns = columns.map(({ header, width, numFmt }) => ({
    header, width: width ?? 22, style: numFmt ? { numFmt } : {},
  }));
  const data = rows.slice(0, EXPORT_LIMIT);
  data.forEach((row) => sheet.addRow(row.map((value) => value ?? null)));
  sheet.eachRow((row, rowNo) => {
    row.font = { name: 'Arial', size: 10, bold: rowNo === 1, color: { argb: 'FF1B2432' } };
    row.height = rowNo === 1 ? 30 : 34;
    row.alignment = { vertical: 'middle', wrapText: true };
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE4E7EE' } } };
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: typeof cell.value === 'number' ? 'right' : 'left' };
      if (rowNo === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF0F4' } };
    });
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  format?.(sheet, data);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const link = document.createElement('a');
  link.href = url;
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  link.download = `Stock Analysis V6_${name}_${stamp}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

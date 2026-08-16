import ExcelJS from 'exceljs';
import type { DocumentRenderer, OfficeBlock, ParsedDoc } from '../office.types';
import { THEME_COLORS, stripMdAndEmoji, runsToText } from '../md-validator';

export class XlsxRenderer implements DocumentRenderer {
  readonly format = 'xlsx' as const;

  async render(doc: ParsedDoc): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(doc.title.slice(0, 31) || '表格');
    const c = THEME_COLORS[doc.theme] ?? THEME_COLORS.default;

    // 标题行
    ws.mergeCells(1, 1, 1, 10);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = stripMdAndEmoji(doc.title);
    titleCell.font = { bold: true, size: 16, color: { argb: c.primary.replace('#', 'FF') } };
    ws.getRow(1).height = 28;
    if (doc.author) ws.getCell(2, 1).value = `编制人：${doc.author}`;

    // 找第一个表格块作为数据表；无表格则把段落写入 A 列
    const table = doc.blocks.find((b) => b.type === 'table');
    if (table && table.type === 'table') {
      const startRow = doc.author ? 4 : 3;
      const headerRow = ws.getRow(startRow);
      table.headers.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = stripMdAndEmoji(h);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.primary.replace('#', 'FF') } };
      });
      table.rows.forEach((row, ri) => {
        row.forEach((val, ci) => {
          ws.getCell(startRow + 1 + ri, ci + 1).value = stripMdAndEmoji(val);
        });
      });
      // 列宽自适应
      const maxCols = Math.max(table.headers.length, ...table.rows.map((r) => r.length));
      for (let i = 1; i <= maxCols; i++) {
        let maxLen = table.headers[i - 1]?.length ?? 4;
        for (const row of table.rows) maxLen = Math.max(maxLen, row[i - 1]?.length ?? 0);
        ws.getColumn(i).width = Math.min(Math.max(maxLen * 2 + 4, 10), 40);
      }
    } else {
      let r = doc.author ? 4 : 3;
      for (const b of doc.blocks) {
        if (b.type === 'paragraph' || b.type === 'heading') ws.getCell(r++, 1).value = runsToText(b.runs, b.text);
        if (b.type === 'list') b.items.forEach((it, i) => ws.getCell(r++, 1).value = runsToText(b.itemRuns?.[i], it));
      }
      ws.getColumn(1).width = 40;
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}

import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import type { DocumentRenderer, InlineRun, OfficeBlock, ParsedDoc } from '../office.types';
import { THEME_COLORS, stripMdAndEmoji } from '../md-validator';

/** 中文字体：正文宋体、标题黑体（Windows 通用字体名，避免丢失） */
const FONT_BODY = 'SimSun';
const FONT_HEADING = 'SimHei';
const FONT_CODE = 'Consolas';

/** 行内 runs → TextRun[]（bold/italic/code 样式还原；含 \n 拆分为多个 run 保持换行） */
function runsToTextRuns(runs: InlineRun[] | undefined, fallback: string, base: { size: number; color?: string; bold?: boolean }): TextRun[] {
  const src = runs && runs.length ? runs : [{ text: fallback }];
  const out: TextRun[] = [];
  for (const r of src) {
    const chunks = r.text.split('\n');
    chunks.forEach((chunk, idx) => {
      if (idx > 0) out.push(new TextRun({ break: 1, size: base.size, color: base.color }));
      if (!chunk) return;
      out.push(new TextRun({
        text: stripMdAndEmoji(chunk),
        bold: r.bold || base.bold,
        italics: r.italic,
        font: r.code ? FONT_CODE : FONT_BODY,
        size: base.size,
        color: r.code ? '#c7254e' : base.color,
        shading: r.code ? { type: 'clear', fill: '#f4f4f4' } : undefined,
      }));
    });
  }
  return out;
}

export class DocxRenderer implements DocumentRenderer {
  readonly format = 'docx' as const;

  /** 块 → 文档元素。Table 与 Paragraph 同级（均为 section children），不能包进 Paragraph */
  private blockOf(block: OfficeBlock, theme: string): (Paragraph | Table)[] {
    const c = THEME_COLORS[theme] ?? THEME_COLORS.default;
    switch (block.type) {
      case 'heading': {
        const levels = [
          { level: HeadingLevel.HEADING_1, size: 28, color: c.primary },
          { level: HeadingLevel.HEADING_2, size: 26, color: c.primary },
          { level: HeadingLevel.HEADING_3, size: 24, color: c.secondary },
          { level: HeadingLevel.HEADING_4, size: 22, color: c.secondary },
        ];
        const lv = levels[Math.min(block.level - 1, 3)];
        return [new Paragraph({
          heading: lv.level,
          spacing: { before: 280, after: 160 },
          children: runsToTextRuns(block.runs, block.text, { size: lv.size, color: lv.color, bold: true }),
        })];
      }
      case 'paragraph':
        return [new Paragraph({
          spacing: { after: 120, line: 360 },
          children: runsToTextRuns(block.runs, block.text, { size: 24, color: '#333333' }),
        })];
      case 'list':
        return block.items.map((item, i) =>
          new Paragraph({
            spacing: { after: 60, line: 340 },
            bullet: !block.ordered ? { level: 0 } : undefined,
            numbering: block.ordered ? { reference: 'ordered', level: 0 } : undefined,
            children: runsToTextRuns(block.itemRuns?.[i], item, { size: 24, color: '#333333' }),
          }),
        );
      case 'code':
        return [new Paragraph({
          spacing: { after: 120 },
          shading: { type: 'clear', fill: '#f4f4f4' },
          border: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'e0e0e0' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'e0e0e0' },
            left: { style: BorderStyle.SINGLE, size: 4, color: c.primary },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'e0e0e0' },
          },
          children: [new TextRun({ text: stripMdAndEmoji(block.code), font: FONT_CODE, size: 20, color: '#1a1a1a' })],
        })];
      case 'table': {
        const headerCells = block.headers.map((h, idx) => {
          const runs = runsToTextRuns(block.headerRuns?.[idx], h, { size: 22, color: 'FFFFFF', bold: true });
          return new TableCell({ shading: { type: 'clear', fill: c.primary }, children: [new Paragraph({ children: runs })] });
        });
        const dataRows = block.rows.map((row, ri) =>
          new TableRow({
            children: row.map((cell, ci) => {
              const runs = runsToTextRuns(block.rowRuns?.[ri]?.[ci], cell, { size: 22, color: '#333333' });
              return new TableCell({ children: [new Paragraph({ children: runs })] });
            }),
          }),
        );
        const rows: TableRow[] = [
          new TableRow({ tableHeader: true, children: headerCells }),
          ...dataRows,
        ];
        return [new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: c.primary },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'c9d4cc' },
            left: { style: BorderStyle.SINGLE, size: 1, color: 'c9d4cc' },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'c9d4cc' },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'c9d4cc' },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'c9d4cc' },
          },
        })];
      }
      default:
        return [];
    }
  }

  async render(doc: ParsedDoc): Promise<Buffer> {
    const c = THEME_COLORS[doc.theme] ?? THEME_COLORS.default;
    const children: (Paragraph | Table)[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 320, before: 120 },
        children: [new TextRun({ text: stripMdAndEmoji(doc.title), bold: true, size: 36, color: c.primary, font: FONT_HEADING })],
      }),
      ...(doc.author ? [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 320 },
        children: [new TextRun({ text: `编制人：${doc.author}`, size: 22, color: '666666' })],
      })] : []),
    ];
    for (const b of doc.blocks) children.push(...this.blockOf(b, doc.theme));
    const d = new Document({
      numbering: { config: [{ reference: 'ordered', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }] }] },
      styles: {
        default: {
          document: { run: { font: FONT_BODY, size: 24, color: '#333333' } },
        },
      },
      sections: [{ children }],
    });
    return Buffer.from(await Packer.toBuffer(d));
  }
}

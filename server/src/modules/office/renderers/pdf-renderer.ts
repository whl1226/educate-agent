import fs from 'fs';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { DocumentRenderer, OfficeBlock, ParsedDoc } from '../office.types';
import { THEME_COLORS, runsToText, stripMdAndEmoji } from '../md-validator';

/** 主题色 hex(#RRGGBB) → [r,g,b] 0~1 分量（供 pdf-lib rgb() 使用） */
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.15, 0.15, 0.15];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/** 预定义颜色常量（替代按字符串拆分 rgb 的脆弱用法） */
const COLOR_TITLE = rgb(0.18, 0.42, 0.3);
const COLOR_TEXT = rgb(0.15, 0.15, 0.15);
const COLOR_MUTED = rgb(0.4, 0.4, 0.4);
const COLOR_CODE = rgb(0.35, 0.35, 0.35);
const COLOR_TABLE_HEADER_BG = rgb(0.18, 0.42, 0.3);
const COLOR_TABLE_CELL_BG = rgb(0.96, 0.96, 0.96);
const COLOR_WHITE = rgb(1, 1, 1);
const COLOR_TABLE_CELL_TEXT = rgb(0.1, 0.1, 0.1);

/** 中文字体路径候选（Windows 常见黑体），渲染前校验存在性 */
export function findChineseFont(): string | null {
  const candidates = [
    process.env.CHINESE_FONT_PATH,
    'C:\\Windows\\Fonts\\simhei.ttf',
    'C:\\Windows\\Fonts\\msyh.ttc',
    '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf',
  ].filter(Boolean) as string[];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

export class PdfRenderer implements DocumentRenderer {
  readonly format = 'pdf' as const;

  private wrapText(font: PDFFont, size: number, maxWidth: number, text: string): string[] {
    const lines: string[] = [];
    let line = '';
    for (const ch of text) {
      if (font.widthOfTextAtSize(line + ch, size) > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  private drawBlock(
    page: PDFPage,
    font: PDFFont,
    block: OfficeBlock,
    x: number,
    y: number,
    maxWidth: number,
  ): { page: PDFPage; y: number } {
    const margin = 20;
    const lineGap = 4;
    const bottom = 30;
    let cur = y;
    let active = page;

    const drawLines = (text: string, size: number, color: ReturnType<typeof rgb>, gap: number) => {
      for (const line of this.wrapText(font, size, maxWidth - 2 * margin, text)) {
        if (cur < bottom + size) break;
        active.drawText(line, { x: x + margin, y: cur, size, font, color });
        cur -= size + gap;
      }
      return cur;
    };

    switch (block.type) {
      case 'heading': {
        const size = Math.max(20 - (block.level - 1) * 2, 12);
        const y2 = drawLines(runsToText(block.runs, block.text), size, COLOR_TITLE, lineGap + 6);
        return { page: active, y: y2 };
      }
      case 'paragraph': {
        const y2 = drawLines(runsToText(block.runs, block.text), 11, COLOR_TEXT, lineGap);
        return { page: active, y: y2 };
      }
      case 'list': {
        const y2 = block.items.reduce((yPos, item) => drawLines(`• ${item}`, 11, COLOR_TEXT, lineGap), cur);
        return { page: active, y: y2 };
      }
      case 'code': {
        const y2 = drawLines(stripMdAndEmoji(block.code), 9, COLOR_CODE, lineGap);
        return { page: active, y: y2 };
      }
      case 'table': {
        const pdf = page.doc;
        const cellPad = 4;
        const colCount = Math.max(block.headers.length, 1);
        const colWidth = (maxWidth - 2 * margin) / colCount;
        const cellFontSize = 9;
        const lineHeight = cellFontSize + 3;
        const wrapCell = (text: string): string[] => {
          const lines: string[] = [];
          let line = '';
          for (const ch of stripMdAndEmoji(text)) {
            if (font.widthOfTextAtSize(line + ch, cellFontSize) > colWidth - 2 * cellPad - 2) {
              lines.push(line);
              line = ch;
            } else {
              line += ch;
            }
          }
          if (line) lines.push(line);
          return lines.length ? lines : [''];
        };
        const rowOf = (cells: string[], header: boolean) => {
          const wrapped = cells.slice(0, colCount).map(wrapCell);
          const maxLines = Math.max(...wrapped.map((l) => l.length), 1);
          const rowHeight = maxLines * lineHeight + 6;
          if (cur < bottom + rowHeight + 8) {
            active = pdf.addPage([595.28, 841.89]);
            cur = active.getSize().height - 60;
          }
          for (let i = 0; i < colCount; i++) {
            active.drawRectangle({
              x: x + margin + i * colWidth, y: cur - rowHeight,
              width: colWidth - 2, height: rowHeight - 2,
              color: header ? COLOR_TABLE_HEADER_BG : COLOR_TABLE_CELL_BG,
            });
          }
          for (let i = 0; i < colCount; i++) {
            const cellX = x + margin + i * colWidth;
            wrapped[i].forEach((ln, li) => {
              active.drawText(ln, {
                x: cellX + cellPad, y: cur - cellFontSize - 2 - li * lineHeight,
                size: cellFontSize, font,
                color: header ? COLOR_WHITE : COLOR_TABLE_CELL_TEXT,
              });
            });
          }
          cur -= rowHeight + 2;
        };
        rowOf(block.headers, true);
        for (const row of block.rows) rowOf(row, false);
        return { page: active, y: cur };
      }
      default:
        return { page: active, y: cur };
    }
  }

  async render(doc: ParsedDoc): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    // 嵌入自定义字体（simhei.ttf）需要 fontkit，每个文档实例必须注册
    pdf.registerFontkit(fontkit);

    // 中文字体必须随文档实例重新嵌入（font 属于具体 PDFDocument，不可跨实例复用）。
    // 字体缺失时（非 Windows 部署）回退 Helvetica，中文会显示为空白。
    const fontPath = findChineseFont();
    const font = fontPath
      ? await pdf.embedFont(fs.readFileSync(fontPath))
      : await pdf.embedFont(StandardFonts.Helvetica);
    if (!fontPath) {
      console.warn('[pdf-renderer] 未找到中文字体，已回退 Helvetica，中文可能显示异常');
    }

    let active = pdf.addPage([595.28, 841.89]); // A4
    const { width, height } = active.getSize();
    const [tr, tg, tb] = hexToRgb((THEME_COLORS[doc.theme] ?? THEME_COLORS.default).primary);

    // 标题
    let y = height - 60;
    active.drawText(stripMdAndEmoji(doc.title), { x: 40, y, size: 20, font, color: rgb(tr, tg, tb) });
    y -= 40;
    if (doc.author) {
      active.drawText(`编制人：${doc.author}`, { x: 40, y, size: 11, font, color: COLOR_MUTED });
      y -= 30;
    }
    for (const b of doc.blocks) {
      const r = this.drawBlock(active, font, b, 20, y, width);
      active = r.page;
      y = r.y;
      y -= 10;
      if (y < 50) {
        active = pdf.addPage([595.28, 841.89]);
        y = height - 60;
      }
    }
    return Buffer.from(await pdf.save());
  }
}

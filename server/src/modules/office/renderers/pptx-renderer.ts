import PptxGenJS from 'pptxgenjs';
import type { DocumentRenderer, InlineRun, OfficeBlock, ParsedDoc } from '../office.types';
import { THEME_COLORS, stripMdAndEmoji, runsToText } from '../md-validator';

/** runs → pptxgenjs richText（bold/italic 还原） */
function runsToRich(runs: InlineRun[] | undefined, fallback: string): PptxGenJS.TextProps[] {
  const src = runs && runs.length ? runs : [{ text: fallback }];
  return src.map((r) => ({
    text: stripMdAndEmoji(r.text),
    options: { bold: r.bold, italic: r.italic },
  }));
}

export class PptxRenderer implements DocumentRenderer {
  readonly format = 'pptx' as const;

  private addBlock(slide: PptxGenJS.Slide, block: OfficeBlock, theme: string) {
    const c = THEME_COLORS[theme] ?? THEME_COLORS.default;
    switch (block.type) {
      case 'heading':
        slide.addText(runsToRich(block.runs, block.text), { x: 0.6, y: 0.4, w: 12.3, h: 0.7, fontSize: 28, bold: true, color: c.primary });
        break;
      case 'paragraph':
        slide.addText(runsToRich(block.runs, block.text), { x: 0.6, y: 1.3, w: 12.3, h: 0.6, fontSize: 16, color: '333333' });
        break;
      case 'list':
        // pptxgenjs 4.x 的 addText 不再接受 string[]，改为 TextProps[]（逐项携带 bullet 选项）
        slide.addText(
          block.items.map((item, i) => ({
            text: stripMdAndEmoji(item),
            options: { bullet: { characterCode: '25CF' }, ...(block.itemRuns?.[i]?.[0]?.bold ? { bold: true } : {}) },
          })),
          { x: 0.8, y: 1.2, w: 11.8, h: Math.max(1, block.items.length * 0.5), fontSize: 16, color: '333333' },
        );
        break;
      case 'code':
        slide.addText(stripMdAndEmoji(block.code), { x: 0.8, y: 1.2, w: 11.8, h: 3, fontSize: 12, fontFace: 'Consolas', color: '1a1a1a', fill: { color: 'F4F4F4' } });
        break;
      case 'table': {
        // pptxgenjs 4.x 已移除 headerRowFill/headerRowColor（3.x 遗留参数），
        // 等价适配：表头单元格 options.fill/options.color/options.bold
        const rows: PptxGenJS.TableRow[] = [
          block.headers.map((h, i) => ({
            text: runsToText(block.headerRuns?.[i], h),
            options: { fill: { color: c.primary }, color: 'FFFFFF', bold: true },
          })),
          ...block.rows.map((row, ri) => row.map((cell, ci) => ({ text: runsToText(block.rowRuns?.[ri]?.[ci], cell) }))),
        ];
        slide.addTable(rows, { x: 0.6, y: 1.3, w: 12.3, border: { pt: 0.5, color: c.secondary } });
        break;
      }
    }
  }

  async render(doc: ParsedDoc): Promise<Buffer> {
    const pptx = new PptxGenJS();
    const c = THEME_COLORS[doc.theme] ?? THEME_COLORS.default;
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = doc.author ?? '乡芽';

    // 标题页（标题 + 编制人同行，避免编制人独占一页）
    const titleSlide = pptx.addSlide();
    titleSlide.addText(stripMdAndEmoji(doc.title), { x: 0.8, y: 2.0, w: 12.8, h: 1.2, fontSize: 40, bold: true, color: c.primary, align: 'center' });
    if (doc.author) {
      titleSlide.addText(`编制人：${doc.author}`, { x: 0.8, y: 3.4, w: 12.8, h: 0.6, fontSize: 18, color: '666666', align: 'center' });
    }

    // 按 h1 分组：每个 h1 后的内容进同页；无 h1 则整页
    let slide = pptx.addSlide();
    for (const b of doc.blocks) {
      if (b.type === 'heading' && b.level === 1) {
        slide = pptx.addSlide();
        slide.addText(stripMdAndEmoji(b.text), { x: 0.6, y: 0.3, w: 12.3, h: 0.8, fontSize: 30, bold: true, color: c.primary });
        continue;
      }
      this.addBlock(slide, b, doc.theme);
    }
    // pptxgenjs 4.x write() 类型为联合类型，nodebuffer 输出实际为 Buffer/Uint8Array
    return Buffer.from((await pptx.write({ outputType: 'nodebuffer' })) as Uint8Array);
  }
}

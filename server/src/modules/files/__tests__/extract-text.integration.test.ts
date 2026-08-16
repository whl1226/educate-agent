import { describe, expect, it } from 'vitest';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { FilesService } from '../files.service';

function makeService() {
  // FilesService 构造参数（records / students / tcls）在 extractText 路径上不涉及
  return new FilesService({} as any, {} as any, {} as any);
}

describe('FilesService.extractText 真实文件集成（不 stub 解析库）', () => {
  it('docx 库生成的真实 docx 可提取出文本', async () => {
    const doc = new Document({
      sections: [
        {
          children: [new Paragraph({ children: [new TextRun('乡芽教育集成测试词汇 XYZ123')] })],
        },
      ],
    });
    const buf = Buffer.from(await Packer.toBuffer(doc));
    const text = await makeService().extractText(buf, 'real.docx');
    expect(text).toContain('乡芽教育集成测试词汇 XYZ123');
  });

  it('pdf-lib 生成的真实 pdf 可提取出文本', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([400, 300]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    // 标准字体为 WinAnsi 编码，中文无法编码，故用 ASCII 词汇
    page.drawText('Integration Test XYZ123', { x: 50, y: 200, size: 14, font });
    const bytes = await pdf.save();
    const text = await makeService().extractText(Buffer.from(bytes), 'real.pdf');
    expect(text).toContain('Integration Test XYZ123');
  });
});

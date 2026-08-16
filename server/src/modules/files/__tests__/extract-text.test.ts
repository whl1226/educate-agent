import { describe, expect, it, beforeEach, vi } from 'vitest';
import { FilesService } from '../files.service';
import { BizException } from '../../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../../common/exceptions/error-codes';

const { mammothExtract, pdfParseFn } = vi.hoisted(() => ({
  mammothExtract: vi.fn(),
  pdfParseFn: vi.fn(),
}));

vi.mock('mammoth', () => ({ default: { extractRawText: mammothExtract } }));
vi.mock('pdf-parse', () => ({ default: pdfParseFn }));

function makeService() {
  // FilesService 构造参数（records / students / tcls）在 extractText 路径上不涉及
  return new FilesService({} as any, {} as any, {} as any);
}

function docxBuf() {
  return Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
}

describe('FilesService.extractText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('docx 魔数识别 + mammoth 调用（不触发 pdf-parse）', async () => {
    mammothExtract.mockResolvedValue({ value: '' });
    const svc = makeService();
    const text = await svc.extractText(docxBuf(), 'a.docx');
    expect(text).toBe('');
    expect(mammothExtract).toHaveBeenCalledWith({ buffer: docxBuf() });
    expect(pdfParseFn).not.toHaveBeenCalled();
  });

  it('pdf 魔数识别 + pdf-parse 调用（不触发 mammoth）', async () => {
    pdfParseFn.mockResolvedValue({ text: '' });
    const svc = makeService();
    const buf = Buffer.from('%PDF-1.4\n%%EOF');
    const text = await svc.extractText(buf, 'a.pdf');
    expect(text).toBe('');
    expect(pdfParseFn).toHaveBeenCalledWith(buf);
    expect(mammothExtract).not.toHaveBeenCalled();
  });

  it('不支持格式抛 BizException（42201）', async () => {
    const svc = makeService();
    const promise = svc.extractText(Buffer.from('hello world'), 'a.txt');
    await expect(promise).rejects.toThrow(BizException);
    await expect(promise).rejects.toThrow('仅支持 Word(.docx) 或 PDF 文件（收到：a.txt）');
  });

  it('超过 10MB 上限抛 FILE_TOO_LARGE（42202）', async () => {
    const svc = makeService();
    const err = await svc.extractText(Buffer.alloc(10 * 1024 * 1024 + 1), 'big.docx').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BizException);
    expect((err as BizException).getResponse()).toMatchObject({ code: ErrorCodes.FILE_TOO_LARGE });
    expect(mammothExtract).not.toHaveBeenCalled();
  });

  it('docx 解析失败归类 FILE_CONTENT_INVALID（42203）', async () => {
    mammothExtract.mockRejectedValue(new Error('boom'));
    const svc = makeService();
    const err = await svc.extractText(docxBuf(), 'broken.docx').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BizException);
    expect((err as BizException).getResponse()).toMatchObject({
      code: ErrorCodes.FILE_CONTENT_INVALID,
      message: '文件解析失败，请检查文件是否完整',
    });
  });

  it('pdf 解析失败归类 FILE_CONTENT_INVALID（42203）', async () => {
    pdfParseFn.mockRejectedValue(new Error('boom'));
    const svc = makeService();
    const err = await svc.extractText(Buffer.from('%PDF-1.4\n%%EOF'), 'broken.pdf').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BizException);
    expect((err as BizException).getResponse()).toMatchObject({ code: ErrorCodes.FILE_CONTENT_INVALID });
  });

  it('超出 60000 字符时截断', async () => {
    mammothExtract.mockResolvedValue({ value: 'x'.repeat(70000) });
    const svc = makeService();
    const text = await svc.extractText(docxBuf(), 'long.docx');
    expect(text.length).toBe(60000);
  });
});

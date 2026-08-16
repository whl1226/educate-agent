import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { validateMarkdown } from './md-validator';
import { latexToUnicode } from './latex-unicode';
import { DocxRenderer } from './renderers/docx-renderer';
import { PptxRenderer } from './renderers/pptx-renderer';
import { PdfRenderer } from './renderers/pdf-renderer';
import { XlsxRenderer } from './renderers/xlsx-renderer';
import type { DocFormat, DocumentRenderer, GenerateDocumentInput, ValidationIssue } from './office.types';
import { FileRecord } from '../../db/entities/system.entities';
import { BizException } from '../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { JwtUser } from '../../common/decorators/current-user.decorator';

export interface GenerateDocumentResult {
  valid: boolean;
  issues?: ValidationIssue[];
  fileId?: number;
  filename?: string;
  downloadUrl?: string;
  format?: DocFormat;
  bytes?: number;
}

const MIME_OF: Record<DocFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

@Injectable()
export class OfficeService {
  private readonly logger = new Logger(OfficeService.name);
  private readonly renderers = new Map<DocFormat, DocumentRenderer>([
    ['docx', new DocxRenderer()],
    ['pptx', new PptxRenderer()],
    ['pdf', new PdfRenderer()],
    ['xlsx', new XlsxRenderer()],
  ]);

  constructor(
    @InjectRepository(FileRecord) private readonly fileRecords: Repository<FileRecord>,
  ) {}

  /** 生成文档：校验（三层）→ 渲染 → 落盘 → files 表登记 → 下载链接 */
  async generateDocument(user: JwtUser, input: GenerateDocumentInput): Promise<GenerateDocumentResult> {
    const content = latexToUnicode(input.content_md ?? '');
    if (!content.trim()) {
      throw new BizException(ErrorCodes.VALIDATE_ERROR, 'content_md 必填');
    }
    // 第一层~第三层：Markdown 校验
    const v = validateMarkdown(content);
    if (!v.valid || !v.doc) {
      return { valid: false, issues: v.issues, format: input.format };
    }
    // 以工具参数为准（format/title/theme/author 覆盖 YAML 头）
    const format: DocFormat = input.format;
    const doc = { ...v.doc, format, title: input.title ?? v.doc.title, theme: input.theme ?? v.doc.theme, author: input.author ?? v.doc.author };

    // 渲染
    const renderer = this.renderers.get(format);
    if (!renderer) throw new BizException(ErrorCodes.VALIDATE_ERROR, `不支持的格式: ${format}`);
    let buffer: Buffer;
    try {
      buffer = await renderer.render(doc);
    } catch (e) {
      this.logger.error(`渲染 ${format} 失败: ${(e as Error).message}`);
      throw new BizException(ErrorCodes.INTERNAL_ERROR, '文档渲染失败，请检查内容后重试');
    }
    if (!buffer.length) throw new BizException(ErrorCodes.INTERNAL_ERROR, '文档渲染结果为空');

    // 落盘 uploads/office/（UUID 重命名防路径遍历）
    const uploadDir = path.join(process.cwd(), 'uploads', 'office');
    fs.mkdirSync(uploadDir, { recursive: true });
    const ext = format;
    const storedName = `${crypto.randomUUID()}.${ext}`;
    const fullPath = path.join(uploadDir, storedName);
    fs.writeFileSync(fullPath, buffer);

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const record = await this.fileRecords.save(
      this.fileRecords.create({
        originalName: `${doc.title.slice(0, 60)}.${ext}`,
        storedName,
        path: fullPath,
        ext,
        mime: MIME_OF[format],
        size: buffer.length,
        sha256,
        uploaderId: user.id,
        category: 'office',
      }),
    );
    const downloadUrl = `/api/v1/files/${record.id}/download`;
    return { valid: true, fileId: record.id, filename: record.originalName, downloadUrl, format, bytes: buffer.length };
  }
}

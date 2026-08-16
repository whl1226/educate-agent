import {
  Controller, Get, Param, ParseIntPipe, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import type { Response } from 'express';
import { FilesService } from './files.service';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { RateLimit, Roles } from '../../common/decorators/security.decorators';
import { BizException } from '../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Roles('teacher', 'admin', 'parent')
  @RateLimit({ limit: 30, windowSec: 60, keyPrefix: 'upload', byUser: true })
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: Express.Multer.File,
    @Query('category') category = 'document',
  ) {
    return this.files.upload(user, file, category);
  }

  @Roles('student', 'teacher', 'admin')
  @RateLimit({ limit: 20, windowSec: 60, keyPrefix: 'ocr', byUser: true })
  @Post('ocr')
  ocr(@CurrentUser() user: JwtUser, @Query('fileId', ParseIntPipe) fileId: number) {
    return this.files.ocrText(fileId, user);
  }

  /** 提取上传文档（docx/pdf）纯文本，供教研员解析材料 */
  @Roles('teacher', 'admin')
  @RateLimit({ limit: 20, windowSec: 60, keyPrefix: 'extract', byUser: true })
  @Post('extract-text')
  @UseInterceptors(FileInterceptor('file'))
  async extractText(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BizException(ErrorCodes.VALIDATE_ERROR, '缺少文件');
    const text = await this.files.extractText(file.buffer, file.originalname);
    return { ok: true, text, chars: text.length, truncated: text.length >= 60000, name: file.originalname };
  }

  /** 文件下载（流式 + 附件头；office 文档与上传文件共用此通道） */
  @Roles('student', 'teacher', 'parent', 'admin')
  @RateLimit({ limit: 60, windowSec: 60, keyPrefix: 'download', byUser: true })
  @Get(':id/download')
  async download(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { record, absPath } = await this.files.download(id, user);
    const mime = record.mime || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    // 附件下载 + 中文文件名编码（RFC 5987）
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(record.originalName)}`);
    res.setHeader('Content-Length', String(record.size));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const stream = createReadStream(absPath);
    stream.on('error', () => res.status(404).end());
    stream.pipe(res);
  }

  @Roles('teacher', 'admin')
  @Get(':id')
  meta(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.files.findById(id, user);
  }
}

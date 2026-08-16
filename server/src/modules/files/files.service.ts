import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { createHash, randomBytes } from 'crypto';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { isAbsolute, join } from 'path';
import { Repository } from 'typeorm';
import { FileRecord } from '../../db/entities/system.entities';
import { Student, TeacherClassLink } from '../../db/entities/org.entities';
import { JwtUser } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';

/** 按分类允许的魔数 → 规范扩展名（扩展名一律由服务端根据文件内容决定，忽略用户提交的扩展名） */
const MAGIC_EXT: Record<string, { bytes: string; offset?: number; ext: string }[]> = {
  image: [
    { bytes: 'ffd8ff', ext: 'jpg' },
    { bytes: '89504e470d0a1a0a', ext: 'png' },
    { bytes: '474946383761', ext: 'gif' },
    { bytes: '474946383961', ext: 'gif' },
  ],
  audio: [
    { bytes: '494433', ext: 'mp3' },
    { bytes: '4f676753', ext: 'ogg' },
    { bytes: '52494646', ext: 'wav' },
  ],
  video: [
    { bytes: '0000001866747970', ext: 'mp4' },
    { bytes: '0000002066747970', ext: 'mp4' },
  ],
  document: [
    { bytes: '25504446', ext: 'pdf' },
    { bytes: 'd0cf11e0a1b11ae1', ext: 'doc' },
  ],
  // 纯文本无魔数：单独走扩展名白名单（见 upload）
  text: [],
};

const CATEGORIES = new Set(['image', 'audio', 'video', 'document', 'text']);

/** 纯文本分类的扩展名白名单 */
const TEXT_EXTS = new Set(['txt', 'md', 'csv', 'log']);

const MAX_SIZE: Record<string, number> = {
  image: 8 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  document: 10 * 1024 * 1024,
  text: 1024 * 1024,
};

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(FileRecord)
    private readonly records: Repository<FileRecord>,
    @InjectRepository(Student)
    private readonly students: Repository<Student>,
    @InjectRepository(TeacherClassLink)
    private readonly tcls: Repository<TeacherClassLink>,
  ) {}

  private uploadDir() {
    return join(process.cwd(), 'uploads');
  }

  /** 判断当前用户能否访问指定上传者（uploaderId）的文件 */
  private async canAccess(uploaderId: number, user: JwtUser): Promise<boolean> {
    if (user.role === 'admin') return true;
    if (uploaderId === user.id) return true;
    if (user.role === 'teacher') {
      const stu = await this.students.findOne({ where: { userId: uploaderId } });
      if (stu) {
        const links = await this.tcls.find({ where: { teacherId: user.id } });
        return links.some((l) => l.classId === stu.classId);
      }
    }
    return false;
  }

  async upload(user: JwtUser, file: Express.Multer.File, category: string, allowed?: string[]) {
    if (!file) throw new BizException(ErrorCodes.VALIDATE_ERROR, '未接收到文件');
    if (!CATEGORIES.has(category)) throw new BizException(ErrorCodes.VALIDATE_ERROR, '非法分类');
    if (file.size > (MAX_SIZE[category] ?? 10 * 1024 * 1024)) {
      throw new BizException(ErrorCodes.VALIDATE_ERROR, '文件超过大小限制');
    }
    // 扩展名由文件内容决定（魔数），拒绝"图片内容 + 任意扩展名"的多态文件
    let ext: string;
    if (category === 'text') {
      ext = (file.originalname.split('.').pop() || '').toLowerCase();
      if (!TEXT_EXTS.has(ext)) throw new BizException(ErrorCodes.VALIDATE_ERROR, `不允许的文件类型 .${ext}`);
    } else {
      const head = file.buffer.subarray(0, 16).toString('hex');
      const signatures = MAGIC_EXT[category] || [];
      const matched = signatures.find((s) => {
        const off = (s.offset ?? 0) * 2;
        return s.bytes.length <= head.length - off && head.startsWith(s.bytes, off);
      });
      if (!matched) throw new BizException(ErrorCodes.VALIDATE_ERROR, '文件内容与声明类型不符');
      ext = matched.ext;
    }
    if (allowed && allowed.length && !allowed.includes(ext)) {
      throw new BizException(ErrorCodes.VALIDATE_ERROR, `不允许的文件类型 .${ext}`);
    }
    const dir = this.uploadDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const sha = createHash('sha256').update(file.buffer).digest('hex');
    const storedName = `${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;
    const path = join(dir, storedName);
    writeFileSync(path, file.buffer);
    const record = await this.records.save(
      this.records.create({
        originalName: file.originalname.slice(0, 255),
        storedName,
        path: `/uploads/${storedName}`,
        ext,
        mime: file.mimetype.slice(0, 64),
        size: file.size,
        sha256: sha,
        uploaderId: user.id,
        category,
      }),
    );
    return { id: record.id, url: record.path, ext, size: file.size, sha256: sha };
  }

  /** 读取文件元数据（越权校验：本人 / 教师可访问本班学生 / admin 全部） */
  async findById(id: number, user?: JwtUser) {
    const record = await this.records.findOne({ where: { id } });
    if (!record) throw new BizException(ErrorCodes.NOT_FOUND);
    if (user && !(await this.canAccess(record.uploaderId, user))) {
      throw new BizException(ErrorCodes.SCOPE_FORBIDDEN, '无权访问该文件');
    }
    return record;
  }

  /**
   * 下载文件（含越权校验）。
   * 兼容两种 path 存储：相对路径（/uploads/xxx，upload 接口）与绝对路径（office 模块生成）。
   * 返回 { record, absPath, contentType }，由 controller 以流式响应输出。
   */
  async download(id: number, user: JwtUser) {
    const record = await this.findById(id, user);
    const storedName = record.storedName;
    if (!/^[\w.-]+$/.test(storedName)) {
      throw new BizException(ErrorCodes.NOT_FOUND, '文件不存在');
    }
    let abs: string;
    if (record.path && isAbsolute(record.path)) {
      abs = record.path;
    } else {
      abs = join(this.uploadDir(), storedName);
    }
    if (!existsSync(abs)) throw new BizException(ErrorCodes.NOT_FOUND, '文件不存在');
    return { record, absPath: abs };
  }

  exists(id: number): Promise<boolean> {
    return this.records.exist({ where: { id } });
  }

  /** OCR 占位实现：真实部署时接入本机 PaddleOCR/Tesseract */
  async ocrText(fileId: number, user: JwtUser) {
    const record = await this.findById(fileId, user);
    if (record.category !== 'image') throw new BizException(ErrorCodes.VALIDATE_ERROR, '仅支持图片 OCR');
    // 文件实际存储在 uploads 目录（非 public/），且 storedName 为服务端生成的随机名
    const storedName = record.storedName;
    if (!/^[\w.-]+$/.test(storedName)) {
      throw new BizException(ErrorCodes.NOT_FOUND, '文件不存在');
    }
    const abs = join(this.uploadDir(), storedName);
    if (!existsSync(abs)) throw new BizException(ErrorCodes.NOT_FOUND, '文件不存在');
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(abs);
      stream.on('error', reject);
      stream.on('close', resolve);
      stream.resume();
    });
    return { fileId, text: `[OCR 占位] 文件「${record.originalName}」已收录，真实识别引擎待部署。`, chars: 0 };
  }

  /** 按魔数识别 docx/pdf 并提取纯文本（供 AI 教研员解析上传材料） */
  async extractText(buf: Buffer, filename: string): Promise<string> {
    if (buf.length > MAX_SIZE.document) throw new BizException(ErrorCodes.FILE_TOO_LARGE);
    const isDocx = buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    const isPdf = buf.subarray(0, 5).toString('latin1') === '%PDF-';
    if (isDocx) {
      try {
        const r = await mammoth.extractRawText({ buffer: buf });
        return (r.value || '').slice(0, 60000);
      } catch {
        throw new BizException(ErrorCodes.FILE_CONTENT_INVALID, '文件解析失败，请检查文件是否完整');
      }
    }
    if (isPdf) {
      try {
        const r = await pdfParse(buf);
        return (r.text || '').slice(0, 60000);
      } catch {
        throw new BizException(ErrorCodes.FILE_CONTENT_INVALID, '文件解析失败，请检查文件是否完整');
      }
    }
    throw new BizException(ErrorCodes.FILE_TYPE_INVALID, `仅支持 Word(.docx) 或 PDF 文件（收到：${filename || '未知类型'}）`);
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../db/entities/system.entities';
import { DeviceInfo } from '../../common/utils/device.util';
import { redact } from '../../common/utils/mask.util';

/**
 * 审计日志服务：关键操作留痕，detail 一律脱敏存储。
 * 使用队列异步写入，避免影响主链路性能。
 */
@Injectable()
export class AuditService {
  private queue: AuditLog[] = [];
  private flushing = false;

  constructor(
    @InjectRepository(AuditLog)
    private readonly logs: Repository<AuditLog>,
  ) {}

  async log(
    userId: number | null,
    action: string,
    module: string,
    targetType: string | null,
    targetId: string | null,
    device?: DeviceInfo | null,
    detail?: unknown,
  ) {
    const entry = this.logs.create({
      userId,
      action,
      module,
      targetType,
      targetId,
      ip: device?.ip ?? null,
      ua: device?.ua ? device.ua.slice(0, 300) : null,
      detail: detail !== undefined ? JSON.stringify(redact(detail)).slice(0, 2000) : null,
    });
    this.queue.push(entry);
    void this.flush();
  }

  async list(query: {
    page: number;
    pageSize: number;
    userId?: number;
    action?: string;
    module?: string;
  }) {
    const qb = this.logs.createQueryBuilder('al');
    if (query.userId) qb.andWhere('al.userId = :userId', { userId: query.userId });
    if (query.action) qb.andWhere('al.action LIKE :action', { action: `%${query.action}%` });
    if (query.module) qb.andWhere('al.module = :module', { module: query.module });
    qb.orderBy('al.id', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(Math.min(query.pageSize, 100));
    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  private async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.queue.length) {
        const batch = this.queue.splice(0, 50);
        await this.logs.save(batch).catch(() => undefined);
      }
    } finally {
      this.flushing = false;
    }
  }
}
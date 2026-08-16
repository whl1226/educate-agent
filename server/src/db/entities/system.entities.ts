import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/** 上传文件元数据（二进制存独立目录，独立资源域） */
@Entity('files')
@Index('idx_files_uploader', ['uploaderId'])
export class FileRecord extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  originalName: string;

  @Column({ type: 'varchar', length: 128 })
  storedName: string;

  @Column({ type: 'varchar', length: 255 })
  path: string;

  @Column({ type: 'varchar', length: 16 })
  ext: string;

  @Column({ type: 'varchar', length: 64 })
  mime: string;

  @Column({ type: 'int' })
  size: number;

  @Column({ type: 'varchar', length: 64 })
  sha256: string;

  @Column({ name: 'uploader_id', type: 'int' })
  uploaderId: number;

  @Column({ type: 'varchar', length: 32 })
  category: string;
}

/** 审计日志（脱敏存储，禁止完整隐私信息） */
@Entity('audit_logs')
@Index('idx_audit_user', ['userId'])
@Index('idx_audit_action', ['action'])
@Index('idx_audit_created', ['createdAt'])
export class AuditLog extends BaseEntity {
  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 64 })
  module: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  targetType: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  targetId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  ua: string | null;

  /** 脱敏后的详情 JSON */
  @Column({ type: 'text', nullable: true })
  detail: string | null;
}

/** 通知 */
@Entity('notifications')
@Index('idx_notif_user', ['userId'])
export class Notification extends BaseEntity {
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'varchar', length: 32, default: 'system' })
  type: string;

  @Column({ name: 'is_read', type: 'int', default: 0 })
  isRead: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  link: string | null;
}

/** 系统配置（安全参数/功能开关） */
@Entity('system_configs')
export class SystemConfig extends BaseEntity {
  @Index('uk_sc_key', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
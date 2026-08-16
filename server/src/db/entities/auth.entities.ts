import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';

export type UserRole = 'admin' | 'teacher' | 'student' | 'parent';
export type UserStatus = 'active' | 'disabled' | 'locked';

/** 用户表：四端统一账号（角色区分） */
@Entity('users')
export class User extends BaseEntity {
  @Unique('uk_users_username', ['username'])
  @Column({ type: 'varchar', length: 64 })
  username: string;

  /** bcrypt 加盐哈希，禁止明文 */
  @Column({ type: 'varchar', length: 100, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 64 })
  displayName: string;

  @Column({ type: 'varchar', length: 16 })
  role: UserRole;

  @Column({ type: 'varchar', length: 255, nullable: true })
  avatar: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  gender: string | null;

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate: string | null;

  /** 学生学号（学生角色） */
  @Column({ type: 'varchar', length: 32, nullable: true })
  studentNo: string | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: UserStatus;

  @Column({ name: 'login_fail_count', type: 'int', default: 0 })
  loginFailCount: number;

  @Column({ name: 'locked_until', type: 'datetime', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  lastLoginIp: string | null;
}

/** 登录会话：refresh token 管理、异地登录检测、踢出 */
@Entity('sessions')
@Index('idx_sessions_user', ['userId'])
export class Session extends BaseEntity {
  @Index('uk_sessions_rt_hash', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  refreshTokenHash: string;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  deviceName: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  ua: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  fingerprint: string | null;

  @Column({ name: 'issued_at', type: 'datetime' })
  issuedAt: Date;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'datetime', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'last_active_at', type: 'datetime', nullable: true })
  lastActiveAt: Date | null;

  /** 当前 access token 的唯一标识（强制下线/踢出时即时吊销用） */
  @Column({ type: 'varchar', length: 64, nullable: true })
  jti: string | null;
}

/** 密码重置凭证：一次性、短时效、仅存哈希 */
@Entity('password_reset_tokens')
@Index('idx_pwd_reset_user', ['userId'])
export class PasswordResetToken extends BaseEntity {
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Index('uk_pwd_reset_hash', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'datetime', nullable: true })
  usedAt: Date | null;
}

/** 登录尝试留痕（暴力破解审计；限流主用 Redis） */
@Entity('login_attempts')
@Index('idx_login_attempts_ip', ['ip'])
@Index('idx_login_attempts_username', ['username'])
export class LoginAttempt extends BaseEntity {
  @Column({ type: 'varchar', length: 64 })
  username: string;

  @Column({ type: 'varchar', length: 64 })
  ip: string;

  @Column({ type: 'int', default: 0 })
  ok: number;

  @Column({ type: 'datetime' })
  attemptAt: Date;
}
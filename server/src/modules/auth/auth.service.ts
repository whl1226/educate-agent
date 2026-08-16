import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import {
  LoginAttempt,
  PasswordResetToken,
  Session,
  User,
} from '../../db/entities/auth.entities';
import { CacheService } from '../cache/cache.service';
import { AuditService } from '../audit/audit.service';
import { ErrorCodes, ErrorMessages } from '../../common/exceptions/error-codes';
import { BizException } from '../../common/exceptions/biz.exception';
import { DeviceInfo } from '../../common/utils/device.util';
import { randomToken, sha256 } from '../../common/utils/crypto.util';
import { maskPhone } from '../../common/utils/mask.util';
import { JwtUser } from '../../common/decorators/current-user.decorator';
import { ROLE_PERMISSIONS } from '../../common/guards/rbac.guard';

const BCRYPT_COST = 12;
/** 账号枚举防护：用户不存在时也执行一次 bcrypt 比对（恒定耗时） */
const DUMMY_HASH = '$2a$12$K1p4m2N9zQ0vXyW8tUe5OeDk3c2s1y0x9w8v7u6t5r4s3q2p1o0i';

export interface SafeUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
  avatar: string | null;
  phoneMasked: string;
  studentNo: string | null;
}

export interface LoginResult {
  user: SafeUser;
  permissions: string[];
  isNewDevice: boolean;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(LoginAttempt)
    private readonly loginAttempts: Repository<LoginAttempt>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
  ) {}

  // ================= 登录 =================

  async login(
    username: string,
    password: string,
    captchaId: string | undefined,
    captchaAnswer: string | undefined,
    device: DeviceInfo,
  ): Promise<LoginResult> {
    const name = username.trim();
    // 失败计数按"用户名+IP"维度：防止攻击者用同一 IP 刷失败锁定他人账号，同时保留对单点暴力破解的防护
    const failKey = `loginfail:${name}:${device.ip || 'unknown'}`;
    const failCount = Number((await this.cache.get(failKey)) || 0);
    const captchaRequired = Number(this.config.get('CAPTCHA_REQUIRED_AFTER_FAILURES')) || 3;

    if (failCount >= captchaRequired) {
      if (!captchaId || !(await this.verifyCaptcha(captchaId, captchaAnswer))) {
        throw new BizException(ErrorCodes.CAPTCHA_ERROR);
      }
    }

    const user = await this.users.findOne({
      where: { username: name },
      select: [
        'id', 'username', 'passwordHash', 'displayName', 'role', 'avatar',
        'phone', 'studentNo', 'status', 'loginFailCount', 'lockedUntil',
      ],
    });

    const pwdOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

    if (!user) {
      // 与密码错误分支保持一致：同样递增失败计数触发验证码，
      // 避免"用户名不存在 vs 密码错误"的响应差异被用于账号枚举
      await this.recordAttempt(name, device, false);
      await this.cache.incr(failKey);
      await this.cache.expire(failKey, 30 * 60);
      throw new BizException(ErrorCodes.LOGIN_FAILED);
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new BizException(ErrorCodes.ACCOUNT_LOCKED);
    }
    if (user.status !== 'active') {
      throw new BizException(ErrorCodes.ACCOUNT_DISABLED);
    }

    if (!pwdOk) {
      await this.recordAttempt(name, device, false);
      const nextFail = await this.cache.incr(failKey);
      await this.cache.expire(failKey, 30 * 60);
      const max = Number(this.config.get('MAX_LOGIN_FAILURES')) || 5;
      if (nextFail >= max) {
        await this.users.update(user.id, {
          loginFailCount: nextFail,
          lockedUntil: new Date(Date.now() + (Number(this.config.get('LOGIN_LOCK_MINUTES')) || 30) * 60_000),
        });
      } else {
        await this.users.update(user.id, { loginFailCount: nextFail });
      }
      throw new BizException(ErrorCodes.LOGIN_FAILED);
    }

    await this.cache.del(failKey);
    await this.users.update(user.id, {
      loginFailCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: device.ip,
    });
    await this.recordAttempt(name, device, true);

    const tokens = await this.openSession(user, device);
    return {
      user: this.toSafeUser(user),
      permissions: this.permissionsOf(user.role),
      isNewDevice: tokens.isNewDevice,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  private async verifyCaptcha(id: string, answer: string | undefined): Promise<boolean> {
    if (!id || !answer) return false;
    const stored = await this.cache.get(`captcha:${id}`);
    if (!stored) return false;
    await this.cache.del(`captcha:${id}`);
    return stored === answer.trim();
  }

  private async recordAttempt(username: string, device: DeviceInfo, ok: boolean) {
    const attempt = this.loginAttempts.create({
      username,
      ip: device.ip,
      ok: ok ? 1 : 0,
      attemptAt: new Date(),
    });
    await this.loginAttempts.save(attempt).catch(() => undefined);
  }

  // ================= 会话建立 =================

  /** 创建新会话并签发令牌（登录成功后调用） */
  async openSession(
    user: User,
    device: DeviceInfo,
  ): Promise<{ accessToken: string; refreshToken: string; isNewDevice: boolean }> {
    const singleDevice = this.config.get<boolean>('SINGLE_DEVICE_MODE') === true;
    const existing = await this.sessions.find({
      where: { userId: user.id, revokedAt: IsNull() },
      order: { issuedAt: 'DESC' },
      take: 20,
    });
    const sameFingerprint = existing.some((s) => s.fingerprint === device.fingerprint);
    const isNewDevice = existing.length > 0 && !sameFingerprint;

    if (singleDevice) {
      for (const s of existing) await this.revokeSession(s);
    }

    const refreshToken = randomToken(48);
    const jti = randomUUID();
    const days = Number(this.config.get('REFRESH_TOKEN_EXPIRES_DAYS')) || 7;
    const session = this.sessions.create({
      userId: user.id,
      refreshTokenHash: sha256(refreshToken),
      deviceName: device.deviceName,
      ip: device.ip,
      ua: device.ua,
      fingerprint: device.fingerprint,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + days * 24 * 3600_000),
      jti,
    });
    await this.sessions.save(session);

    await this.audit.log(user.id, 'auth.login', 'auth', 'session', String(session.id), device, {
      device: device.deviceName,
      isNewDevice,
    });

    if (isNewDevice) {
      await this.notifyNewDevice(user.id, device);
    }

    const accessToken = await this.issueAccessToken(session);
    return { accessToken, refreshToken, isNewDevice };
  }

  private async notifyNewDevice(userId: number, device: DeviceInfo) {
    const { Notification } = await import('../../db/entities/system.entities');
    const ds = this.sessions.manager.connection;
    await ds
      .getRepository(Notification)
      .save(
        ds.getRepository(Notification).create({
          userId,
          title: '新设备登录提醒',
          content: `检测到新设备「${device.deviceName}」登录您的账号，如非本人操作请立即修改密码并退出其他设备。`,
          type: 'security',
          link: '/auth/sessions',
        }),
      )
      .catch(() => undefined);
  }

  // ================= 令牌签发 =================

  async issueAccessToken(session: Session): Promise<string> {
    const user = await this.users.findOne({
      where: { id: session.userId },
      select: ['id', 'username', 'role'],
    });
    if (!user) throw new BizException(ErrorCodes.UNAUTHORIZED);
    return this.jwt.signAsync(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        jti: session.jti,
        scopeKey: `u:${user.id}`,
      },
      { expiresIn: this.config.get('JWT_EXPIRES_IN') || '15m' },
    );
  }

  private permissionsOf(role: string): string[] {
    return ROLE_PERMISSIONS[role] || [];
  }

  private toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      avatar: user.avatar,
      phoneMasked: maskPhone(user.phone),
      studentNo: user.studentNo,
    };
  }

  // ================= 刷新（无感续期 + 轮换 + 复用检测） =================

  async refresh(refreshToken: string | undefined): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refreshToken) throw new BizException(ErrorCodes.UNAUTHORIZED);
    const hash = sha256(refreshToken);
    const session = await this.sessions.findOne({ where: { refreshTokenHash: hash } });

    if (!session) {
      const userId = await this.detectReuse(hash);
      if (userId) {
        await this.revokeAllUserSessions(userId);
        throw new BizException(ErrorCodes.TOKEN_REVOKED, '检测到令牌异常使用，已安全下线');
      }
      throw new BizException(ErrorCodes.UNAUTHORIZED);
    }
    if (session.revokedAt) throw new BizException(ErrorCodes.TOKEN_REVOKED);
    if (session.expiresAt.getTime() < Date.now()) throw new BizException(ErrorCodes.TOKEN_EXPIRED);

    const user = await this.users.findOne({ where: { id: session.userId } });
    if (!user || user.status !== 'active') throw new BizException(ErrorCodes.ACCOUNT_DISABLED);

    // 轮换：旧哈希记入会话历史并登记映射（复用检测依据），写入新哈希
    const historyKey = `rthist:${session.id}`;
    const history = JSON.parse((await this.cache.get(historyKey)) || '[]') as string[];
    history.push(hash);
    await this.cache.set(historyKey, JSON.stringify(history.slice(-10)), 7 * 24 * 3600);
    await this.cache.set(`rthash:${hash}`, String(session.id), 7 * 24 * 3600);

    const newRefresh = randomToken(48);
    const newHash = sha256(newRefresh);
    session.refreshTokenHash = newHash;
    session.jti = randomUUID();
    session.lastActiveAt = new Date();
    await this.sessions.save(session);

    await this.cache.set(`rthash:${newHash}`, String(session.id), 7 * 24 * 3600);

    const accessToken = await this.issueAccessToken(session);
    return { accessToken, refreshToken: newRefresh };
  }

  /** 轮换令牌复用检测：旧哈希命中会话历史 -> 疑似令牌被窃取 */
  private async detectReuse(hash: string): Promise<number | null> {
    const sessionId = await this.cache.get(`rthash:${hash}`);
    if (!sessionId) return null;
    const history = JSON.parse((await this.cache.get(`rthist:${sessionId}`)) || '[]') as string[];
    if (!history.includes(hash)) return null;
    const session = await this.sessions.findOne({ where: { id: Number(sessionId) } });
    return session ? session.userId : null;
  }

  // ================= 登出与会话管理 =================

  async logout(userId: number, jti: string, device: DeviceInfo) {
    const session = await this.sessions.findOne({ where: { userId, jti } });
    if (session && !session.revokedAt) await this.revokeSession(session);
    await this.audit.log(
      userId,
      'auth.logout',
      'auth',
      'session',
      session?.id ? String(session.id) : null,
      device,
    );
  }

  async logoutAll(userId: number, keepJti: string | null) {
    const list = await this.sessions.find({ where: { userId, revokedAt: IsNull() } });
    for (const s of list) {
      if (keepJti && s.jti === keepJti) continue;
      await this.revokeSession(s);
    }
  }

  async listSessions(userId: number, currentJti: string) {
    const list = await this.sessions.find({
      where: { userId },
      order: { issuedAt: 'DESC' },
      take: 20,
    });
    const active = list.filter((s) => !s.revokedAt);
    const mostRecent = active[0];
    return list.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      ip: s.ip,
      issuedAt: s.issuedAt,
      expiresAt: s.expiresAt,
      revoked: !!s.revokedAt,
      isCurrent: s.jti === currentJti,
      isRemote: !!mostRecent && !s.revokedAt && mostRecent.fingerprint !== s.fingerprint,
    }));
  }

  async revokeSessionById(userId: number, sessionId: number, device: DeviceInfo) {
    const session = await this.sessions.findOne({ where: { id: sessionId, userId } });
    if (!session) throw new BizException(ErrorCodes.NOT_FOUND, '会话不存在');
    await this.revokeSession(session);
    await this.audit.log(userId, 'auth.session.revoke', 'auth', 'session', String(sessionId), device, {
      device: session.deviceName,
    });
  }

  /** 管理端强制下线：吊销用户全部会话 */
  async forceLogout(adminId: number, targetUserId: number, device: DeviceInfo) {
    const target = await this.users.findOne({ where: { id: targetUserId } });
    if (!target) throw new BizException(ErrorCodes.NOT_FOUND, '用户不存在');
    await this.revokeAllUserSessions(targetUserId);
    await this.audit.log(adminId, 'auth.force_logout', 'auth', 'user', String(targetUserId), device, {
      target: target.username,
    });
    const { Notification } = await import('../../db/entities/system.entities');
    const ds = this.sessions.manager.connection;
    await ds
      .getRepository(Notification)
      .save(
        ds.getRepository(Notification).create({
          userId: targetUserId,
          title: '账号已被强制下线',
          content: '您的账号已被管理员强制下线，如有疑问请联系管理员。',
          type: 'security',
          link: '/login.html',
        }),
      )
      .catch(() => undefined);
  }

  private async revokeAllUserSessions(userId: number) {
    const list = await this.sessions.find({ where: { userId, revokedAt: IsNull() } });
    for (const s of list) await this.revokeSession(s);
  }

  private async revokeSession(session: Session) {
    session.revokedAt = new Date();
    await this.sessions.save(session);
    if (session.jti) {
      await this.cache.set(`revoked:${session.jti}`, '1', 60 * 15);
    }
  }

  // ================= 密码 =================

  async changePassword(userId: number, oldPassword: string, newPassword: string, device: DeviceInfo) {
    const user = await this.users.findOne({
      where: { id: userId },
      select: ['id', 'passwordHash', 'username'],
    });
    if (!user) throw new BizException(ErrorCodes.NOT_FOUND);
    const ok = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!ok) throw new BizException(ErrorCodes.OLD_PASSWORD_ERROR);
    const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await this.users.update(userId, { passwordHash: hash });
    await this.logoutAll(userId, null);
    await this.audit.log(userId, 'auth.password.change', 'auth', 'user', String(userId), device);
  }

  async requestReset(username: string, device: DeviceInfo): Promise<string | null> {
    const user = await this.users.findOne({ where: { username: username.trim() } });
    if (!user) {
      // 账号枚举防护：不区分账号是否存在
      await this.audit.log(null, 'auth.reset.request', 'auth', 'user', username, device);
      return null;
    }
    const token = randomToken(32);
    const existing = await this.resetTokens.find({
      where: { userId: user.id, usedAt: IsNull() },
      order: { createdAt: 'DESC' },
      take: 5,
    });
    const recentValid = existing.some(
      (t) => t.expiresAt.getTime() > Date.now() && t.createdAt.getTime() > Date.now() - 60_000,
    );
    if (recentValid) {
      throw new BizException(ErrorCodes.RATE_LIMITED, '重置请求过于频繁，请稍后再试');
    }
    await this.resetTokens.save(
      this.resetTokens.create({
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 15 * 60_000),
      }),
    );
    await this.audit.log(user.id, 'auth.reset.requested', 'auth', 'user', String(user.id), device);
    // 演示模式（开发环境）返回一次性令牌，生产环境通过邮件/短信下发
    return this.config.get('NODE_ENV') === 'development' ? token : null;
  }

  async resetPassword(token: string, newPassword: string, device: DeviceInfo) {
    const record = await this.resetTokens.findOne({ where: { tokenHash: sha256(token) } });
    if (!record || record.usedAt) throw new BizException(ErrorCodes.RESET_TOKEN_INVALID);
    if (record.expiresAt.getTime() < Date.now()) throw new BizException(ErrorCodes.RESET_TOKEN_EXPIRED);

    record.usedAt = new Date();
    await this.resetTokens.save(record);

    const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await this.users.update(record.userId, { passwordHash: hash });
    await this.revokeAllUserSessions(record.userId);
    await this.audit.log(record.userId, 'auth.reset.done', 'auth', 'user', String(record.userId), device);
  }

  /** 当前用户信息（含权限码） */
  async me(jwtUser: JwtUser): Promise<SafeUser & { permissions: string[] }> {
    const user = await this.users.findOne({ where: { id: jwtUser.id } });
    if (!user) throw new BizException(ErrorCodes.UNAUTHORIZED);
    return { ...this.toSafeUser(user), permissions: this.permissionsOf(user.role) };
  }
}
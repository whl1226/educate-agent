import { SetMetadata } from '@nestjs/common';

/** 标记接口为公开（跳过 JWT 认证），仍受限流/CSRF 保护 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** 角色白名单 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/** 权限码白名单（RBAC 细粒度） */
export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);

/** 启用防重放保护（X-Timestamp ±5min + X-Nonce 一次性） */
export const REPLAY_KEY = 'replay';
export const ReplayProtected = () => SetMetadata(REPLAY_KEY, true);

/** 接口级限流（叠加在全局限流之上） */
export interface RateLimitOptions {
  limit: number;
  windowSec: number;
  keyPrefix: string;
  /** 按用户维度（true）还是按 IP 维度（false，默认） */
  byUser?: boolean;
}
export const RATE_LIMIT_KEY = 'rateLimit';
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
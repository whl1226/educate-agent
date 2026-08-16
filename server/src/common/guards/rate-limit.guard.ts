import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CacheService } from '../../modules/cache/cache.service';
import { BizException } from '../exceptions/biz.exception';
import { ErrorCodes } from '../exceptions/error-codes';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/security.decorators';
import { JwtUser } from '../decorators/current-user.decorator';

/**
 * 接口级滑动窗口限流（叠加在全局 IP 限流之上）：
 * 固定窗口 + 计数，超过限制返回 429。
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = (req as Request & { user?: JwtUser }).user;
    const subject = options.byUser && user ? `u:${user.id}` : `ip:${req.ip || 'unknown'}`;
    const key = `rl:${options.keyPrefix}:${subject}:${Math.floor(Date.now() / 1000 / options.windowSec)}`;

    const count = await this.cache.incr(key);
    if (count === 1) {
      await this.cache.expire(key, options.windowSec);
    }
    if (count > options.limit) {
      throw new BizException(ErrorCodes.RATE_LIMITED);
    }
    return true;
  }
}
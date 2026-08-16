import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CacheService } from '../../modules/cache/cache.service';
import { BizException } from '../exceptions/biz.exception';
import { ErrorCodes } from '../exceptions/error-codes';
import { hmacSign, safeEqual } from '../utils/crypto.util';
import { REPLAY_KEY } from '../decorators/security.decorators';

const MAX_DRIFT_MS = 5 * 60 * 1000;
const NONCE_TTL_SEC = 10 * 60;

/**
 * 防重放保护（标注 @ReplayProtected 的敏感接口）：
 * - X-Timestamp：Unix 毫秒，与服务器时间差 ±5min
 * - X-Nonce：一次性随机串，Redis 记录后重复使用即拒绝
 * - X-Signature（可选）：HMAC(SIGNING_SECRET, method|path|timestamp)
 *   仅用于非浏览器客户端。浏览器端 bundle 不含签名密钥，签名由服务端
 *   以时间戳+Nonce 完成防重放；若请求携带签名则必须通过校验（防伪造）。
 */
@Injectable()
export class ReplayGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const enabled = this.reflector.getAllAndOverride<boolean>(REPLAY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!enabled) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const timestamp = Number(req.headers['x-timestamp']);
    const signature = req.headers['x-signature'] as string | undefined;
    const nonce = req.headers['x-nonce'] as string | undefined;

    if (!timestamp || !Number.isFinite(timestamp) || !nonce) {
      throw new BizException(ErrorCodes.CSRF_INVALID, '请求缺少安全校验头');
    }
    if (Math.abs(Date.now() - timestamp) > MAX_DRIFT_MS) {
      throw new BizException(ErrorCodes.TIMESTAMP_EXPIRED);
    }

    const secret = this.config.get<string>('SIGNING_SECRET') || '';
    if (signature) {
      const path = req.originalUrl.split('?')[0];
      const expect = hmacSign(secret, `${req.method}|${path}|${timestamp}`);
      if (!safeEqual(expect, signature)) {
        throw new BizException(ErrorCodes.CSRF_INVALID, '请求签名校验失败');
      }
    }

    const claimed = await this.cache.setNx(`nonce:${nonce}`, '1', NONCE_TTL_SEC);
    if (!claimed) {
      throw new BizException(ErrorCodes.REPLAY_DETECTED);
    }
    return true;
  }
}
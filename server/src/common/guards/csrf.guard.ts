import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { BizException } from '../exceptions/biz.exception';
import { ErrorCodes } from '../exceptions/error-codes';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF 防护（双提交 Cookie + Origin 校验）：
 * - 写操作（POST/PUT/PATCH/DELETE）必须携带 X-CSRF-Token 头，且与 XSRF-TOKEN Cookie 一致
 * - 校验 Origin/Referer 与 Host 匹配（同源）
 * - SameSite=Lax Cookie 已在服务端设置，双保险
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = req.headers['origin'] as string | undefined;
    const referer = req.headers['referer'] as string | undefined;
    const host = req.headers['host'] as string | undefined;
    const source = origin || referer;
    if (source) {
      try {
        const sourceHost = new URL(source).host;
        if (host && sourceHost !== host) {
          throw new BizException(ErrorCodes.CSRF_INVALID);
        }
      } catch {
        throw new BizException(ErrorCodes.CSRF_INVALID);
      }
    }

    const cookieToken = (req.cookies as Record<string, string> | undefined)?.['XSRF-TOKEN'];
    const headerToken = req.headers['x-csrf-token'] as string | undefined;
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new BizException(ErrorCodes.CSRF_INVALID);
    }
    return true;
  }
}
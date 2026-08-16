import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import { CacheService } from '../../modules/cache/cache.service';
import { Session } from '../../db/entities/auth.entities';
import { ErrorCodes, ErrorMessages } from '../exceptions/error-codes';
import { IS_PUBLIC_KEY } from '../decorators/security.decorators';
import { JwtUser } from '../decorators/current-user.decorator';

/**
 * JWT 认证守卫：
 * - 公开接口跳过
 * - 校验 Bearer Token 有效性（签名/时效/会话是否被吊销）
 * - 会话吊销检查：jti 在 Redis 黑名单（revoked:{jti}）或 sessions 表 revoked 状态
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly cache: CacheService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const auth = request.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: ErrorMessages[ErrorCodes.UNAUTHORIZED],
      });
    }

    const token = auth.slice(7).trim();
    try {
      const payload = await this.jwtService.verifyAsync<
        { sub: number; username: string; role: string; jti: string; scopeKey: string } & { exp: number }
      >(token, {
        secret: this.config.get('JWT_SECRET'),
        algorithms: ['HS256'],
      });

      const revoked = await this.cache.get(`revoked:${payload.jti}`);
      if (revoked === '1') {
        throw new UnauthorizedException({
          code: ErrorCodes.TOKEN_REVOKED,
          message: ErrorMessages[ErrorCodes.TOKEN_REVOKED],
        });
      }

      // 兜底：Redis 黑名单可能因重启/降级失效，会话吊销以 sessions 表为准
      if (payload.jti) {
        const session = await this.dataSource
          .getRepository(Session)
          .findOne({ where: { jti: payload.jti } });
        if (session && session.revokedAt) {
          throw new UnauthorizedException({
            code: ErrorCodes.TOKEN_REVOKED,
            message: ErrorMessages[ErrorCodes.TOKEN_REVOKED],
          });
        }
      }

      const user: JwtUser = {
        id: payload.sub,
        username: payload.username,
        role: payload.role as JwtUser['role'],
        jti: payload.jti,
        scopeKey: payload.scopeKey,
      };
      (request as Request & { user?: JwtUser }).user = user;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      const expired = err instanceof Error && err.name === 'TokenExpiredError';
      throw new UnauthorizedException({
        code: expired ? ErrorCodes.TOKEN_EXPIRED : ErrorCodes.UNAUTHORIZED,
        message: expired
          ? ErrorMessages[ErrorCodes.TOKEN_EXPIRED]
          : ErrorMessages[ErrorCodes.UNAUTHORIZED],
      });
    }
  }
}
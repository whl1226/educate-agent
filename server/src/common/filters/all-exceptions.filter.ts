import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCodes, ErrorMessages } from '../exceptions/error-codes';

/**
 * 全局异常过滤器：
 * - 对外输出标准化 { code, message, data:null }，绝不返回堆栈/数据库/内部路径
 * - 服务端细节仅写入服务端日志（脱敏）
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let code: number = ErrorCodes.INTERNAL_ERROR;
    let message: string = ErrorMessages[ErrorCodes.INTERNAL_ERROR];
    let status = HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      status = exception.getStatus();
      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        if (typeof b.code === 'number') {
          code = b.code as number;
          message = String(b.message || ErrorMessages[code]);
        } else if (typeof b.message === 'string') {
          message = b.message;
          if (status === HttpStatus.BAD_REQUEST) code = ErrorCodes.VALIDATE_ERROR;
          else if (status === HttpStatus.UNAUTHORIZED) code = ErrorCodes.UNAUTHORIZED;
          else if (status === HttpStatus.FORBIDDEN) code = ErrorCodes.FORBIDDEN;
          else if (status === HttpStatus.NOT_FOUND) code = ErrorCodes.NOT_FOUND;
          else if (status === HttpStatus.TOO_MANY_REQUESTS) code = ErrorCodes.RATE_LIMITED;
        } else if (Array.isArray(b.message)) {
          message = (b.message as string[]).join('；');
          if (status === HttpStatus.BAD_REQUEST) code = ErrorCodes.VALIDATE_ERROR;
        }
      }
    }

    if (status >= 500) {
      const err = exception as Error;
      this.logger.error(
        `[${request.method} ${request.url}] ${err?.name}: ${err?.message}`,
        err?.stack,
      );
    } else {
      this.logger.warn(`[${request.method} ${request.url}] code=${code} msg=${message}`);
    }

    if (response.headersSent) return;

    response.status(status).json({
      code,
      message,
      data: null,
      timestamp: new Date().toISOString(),
    });
  }
}

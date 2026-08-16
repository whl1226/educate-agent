import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodes, ErrorMessages } from './error-codes';

function httpStatusOf(code: number): HttpStatus {
  if (code >= 40100 && code < 40200) return HttpStatus.UNAUTHORIZED;
  if (code >= 40300 && code < 40400) return HttpStatus.FORBIDDEN;
  if (code >= 40400 && code < 40500) return HttpStatus.NOT_FOUND;
  if (code >= 40900 && code < 41000) return HttpStatus.CONFLICT;
  if (code >= 42200 && code < 42300) return HttpStatus.UNPROCESSABLE_ENTITY;
  if (code >= 42900 && code < 43000) return HttpStatus.TOO_MANY_REQUESTS;
  if (code >= 40000 && code < 40100) return HttpStatus.BAD_REQUEST;
  if (code >= 50300 && code < 50400) return HttpStatus.SERVICE_UNAVAILABLE;
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

/**
 * 业务异常：对外仅输出标准错误码与脱敏消息，不泄露内部细节。
 */
export class BizException extends HttpException {
  constructor(
    code: number = ErrorCodes.INTERNAL_ERROR,
    message?: string,
    public readonly detail?: unknown,
  ) {
    super(
      {
        code,
        message: message || ErrorMessages[code] || ErrorMessages[ErrorCodes.INTERNAL_ERROR],
      },
      httpStatusOf(code),
    );
  }

  static validate(message?: string): BizException {
    return new BizException(ErrorCodes.VALIDATE_ERROR, message);
  }
  static forbidden(message?: string): BizException {
    return new BizException(ErrorCodes.FORBIDDEN, message);
  }
  static scopeForbidden(message?: string): BizException {
    return new BizException(ErrorCodes.SCOPE_FORBIDDEN, message);
  }
  static notFound(message?: string): BizException {
    return new BizException(ErrorCodes.NOT_FOUND, message);
  }
  static conflict(message?: string): BizException {
    return new BizException(ErrorCodes.CONFLICT, message);
  }
  static unauthorized(message?: string): BizException {
    return new BizException(ErrorCodes.UNAUTHORIZED, message);
  }
}

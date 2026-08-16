import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ErrorCodes } from '../exceptions/error-codes';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T | null;
  timestamp: string;
}

/** 统一响应包装：{ code:0, message:'ok', data } */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        code: ErrorCodes.SUCCESS,
        message: 'ok',
        data: (data ?? null) as T | null,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}

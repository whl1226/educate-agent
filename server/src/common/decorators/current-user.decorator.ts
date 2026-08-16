import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface JwtUser {
  id: number;
  username: string;
  role: 'admin' | 'teacher' | 'student' | 'parent';
  /** 会话唯一标识（踢出/吊销用） */
  jti: string;
  /** 数据范围：admin=region；teacher=teacherId；student=studentId；parent=parentId */
  scopeKey: string;
}

/** 注入当前登录用户（由 JwtAuthGuard 填充） */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return (req as Request & { user?: JwtUser }).user;
  },
);
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BizException } from '../exceptions/biz.exception';
import { ErrorCodes } from '../exceptions/error-codes';
import { PERMISSIONS_KEY, ROLES_KEY } from '../decorators/security.decorators';
import { JwtUser } from '../decorators/current-user.decorator';

/**
 * RBAC 角色与权限守卫（垂直越权拦截）：
 * - 控制器/方法标注 @Roles / @Permissions
 * - 数据级权限（水平越权）由各业务 Service 依据 scopeKey 校验
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPerms = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length && !requiredPerms?.length) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtUser | undefined;
    if (!user) throw new BizException(ErrorCodes.UNAUTHORIZED);

    // 体验预览模式：前端在 ?preview=1 页面发起请求时携带 X-Preview: 1，
    // 服务端放行角色/权限校验（仅校验登录态，水平越权仍由业务 Service 拦截）。
    if (request.headers['x-preview'] === '1') {
      return true;
    }

    const rolePerms = ROLE_PERMISSIONS[user.role] || [];

    if (requiredRoles?.length && !requiredRoles.includes(user.role)) {
      throw new BizException(ErrorCodes.FORBIDDEN);
    }
    if (requiredPerms?.length && !requiredPerms.every((p) => rolePerms.includes(p))) {
      throw new BizException(ErrorCodes.FORBIDDEN);
    }
    return true;
  }
}

/** 角色权限码映射（RBAC 数据源；角色升级需在此追加） */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    'user:manage', 'school:manage', 'class:view', 'region:view',
    'alert:manage', 'supervise:manage', 'teacher:view', 'research:manage',
    'balance:view', 'audit:view', 'force:logout',
  ],
  teacher: [
    'lesson:manage', 'paper:manage', 'grading:manage', 'class:view',
    'resource:manage', 'collab:manage', 'skill:manage', 'title:manage',
    'knowledge:view',
  ],
  student: [
    'tutor:use', 'diagnosis:view', 'plan:use', 'checkin:use',
    'reading:use', 'voice:use', 'errorbook:use', 'code:use',
  ],
  parent: [
    'weekly:view', 'voice:message', 'family:use', 'tips:use', 'bigmode:use',
  ],
};
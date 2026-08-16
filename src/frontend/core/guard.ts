import { get, getCachedUser, ApiError } from './request';
import { SafeUser, redirectHome } from './auth';

export async function fetchMe(): Promise<SafeUser> {
  return get<SafeUser & { permissions: string[] }>('/auth/me');
}

export interface RoleGuardOptions {
  /** 体验预览模式：跨角色浏览（链接带 ?preview=1 时生效），仅校验登录态不校验角色 */
  preview?: boolean;
}

/** 当前页面是否处于体验预览模式（URL 带 ?preview=1） */
export function isPreviewMode(): boolean {
  try {
    return new URLSearchParams(location.search).has('preview');
  } catch {
    return false;
  }
}

/**
 * 页面守卫：校验登录态 + 角色。不通过则跳转登录页或对应角色首页。
 * preview=true 时（体验账号跨端预览）跳过角色校验，仅要求登录。
 */
export async function requireRole(roles: string[], opts: RoleGuardOptions = {}): Promise<SafeUser> {
  const preview = opts.preview ?? isPreviewMode();
  try {
    const user = await fetchMe();
    if (!preview && !roles.includes(user.role)) {
      redirectHome(user);
      throw new ApiError(403, '角色不匹配');
    }
    return user;
  } catch (e) {
    if (e instanceof ApiError && e.code !== 401) throw e;
    location.href = 'login.html';
    throw e;
  }
}

export async function tryMe(): Promise<SafeUser | null> {
  try {
    return await fetchMe();
  } catch {
    return null;
  }
}

export function initialsOf(name: string): string {
  return name ? name.charAt(0) : '?';
}

export { redirectHome };
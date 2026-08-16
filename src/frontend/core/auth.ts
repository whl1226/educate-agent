export interface SafeUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
  avatar: string | null;
  phoneMasked: string;
  studentNo: string | null;
}

export interface LoginResult {
  user: SafeUser;
  permissions: string[];
  isNewDevice: boolean;
  accessToken: string;
}

const KEY_USER = 'xy_user';
const KEY_REDIRECT = 'xy_redirect';

/**
 * accessToken 仅保存在内存中（不落 localStorage）：
 * 页面刷新后由 request.ts 的 401 → /auth/refresh（HttpOnly Cookie）自动恢复，
 * 防止 XSS 从 localStorage 直接窃取会话令牌。
 */
let memoryToken = '';

export function getToken(): string {
  return memoryToken;
}

export function setToken(t: string): void {
  memoryToken = t;
}

export function getCachedUser(): SafeUser | null {
  try {
    const raw = localStorage.getItem(KEY_USER);
    return raw ? (JSON.parse(raw) as SafeUser) : null;
  } catch {
    return null;
  }
}

export function saveLogin(res: LoginResult): void {
  setToken(res.accessToken);
  localStorage.setItem(KEY_USER, JSON.stringify(res.user));
}

export function clearSession(): void {
  memoryToken = '';
  localStorage.removeItem(KEY_USER);
}

export function setRedirect(path: string): void {
  sessionStorage.setItem(KEY_REDIRECT, path);
}

export function takeRedirect(): string {
  const v = sessionStorage.getItem(KEY_REDIRECT);
  sessionStorage.removeItem(KEY_REDIRECT);
  return v || '';
}

export function homeOf(role: string): string {
  switch (role) {
    case 'teacher':
      return 'teacher.html';
    case 'student':
      return 'student.html';
    case 'parent':
      return 'parent.html';
    case 'admin':
      return 'admin.html';
    default:
      return 'login.html';
  }
}

export function redirectHome(user?: SafeUser | null): void {
  const role = user?.role || getCachedUser()?.role || '';
  location.href = homeOf(role);
}
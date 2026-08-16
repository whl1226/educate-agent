import { signRequest, randomNonce } from './sign';
import { getToken, setToken, clearSession, getCachedUser, saveLogin, SafeUser } from './auth';
import { isPreviewMode } from './guard';

export interface ApiErrorBody {
  code: number;
  message: string;
}

export class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

const CSRF_COOKIE = 'XSRF-TOKEN';

export function readCookie(name: string): string {
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

let refreshing: Promise<boolean> | null = null;

async function refreshToken(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const csrf = readCookie(CSRF_COOKIE);
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
      });
      const json = await res.json();
      if (json && json.code === 0 && json.data && json.data.accessToken) {
        setToken(json.data.accessToken);
        return true;
      }
      clearSession();
      return false;
    } catch {
      clearSession();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export interface ApiOptions {
  noAuth?: boolean;
  noRefresh?: boolean;
  timeoutMs?: number;
}

export async function api<T = any>(
  method: string,
  path: string,
  body?: unknown,
  opts: ApiOptions = {},
): Promise<T> {
  const doFetch = async (): Promise<T> => {
    const csrf = readCookie(CSRF_COOKIE);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const token = getToken();
    if (token && !opts.noAuth) headers['Authorization'] = 'Bearer ' + token;

    // 体验预览模式：服务端 RbacGuard 依据该头放行角色校验
    if (isPreviewMode()) headers['X-Preview'] = '1';

    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
    if (isWrite) {
      const ts = Date.now();
      headers['X-Timestamp'] = String(ts);
      headers['X-Nonce'] = randomNonce();
      headers['X-Signature'] = await signRequest(method.toUpperCase(), '/api/v1' + path, ts);
    }

    const ctrl = opts.timeoutMs ? new AbortController() : null;
    const timer = ctrl
      ? setTimeout(() => ctrl.abort(), opts.timeoutMs)
      : null;
    try {
      const res = await fetch('/api/v1' + path, {
        method: method.toUpperCase(),
        credentials: 'same-origin',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined,
      });
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        /* 非 JSON 响应 */
      }
      if (json && json.code === 0) return json.data as T;
      if (res.status === 401 && !opts.noRefresh) {
        const ok = await refreshToken();
        if (ok) return doFetch();
        location.href = 'login.html';
        throw new ApiError(401, '登录已过期，请重新登录');
      }
      throw new ApiError(json?.code ?? res.status, json?.message ?? '请求失败');
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  return doFetch();
}

export function get<T = any>(path: string, opts?: ApiOptions): Promise<T> {
  return api<T>('GET', path, undefined, opts);
}

export function post<T = any>(path: string, body?: unknown, opts?: ApiOptions): Promise<T> {
  return api<T>('POST', path, body, opts);
}

export function patch<T = any>(path: string, body?: unknown, opts?: ApiOptions): Promise<T> {
  return api<T>('PATCH', path, body, opts);
}

/** 带安全头（CSRF/时间戳/签名/Nonce）的 multipart 上传 */
export async function upload<T = any>(
  path: string,
  form: FormData,
  opts: ApiOptions = {},
): Promise<T> {
  const csrf = readCookie(CSRF_COOKIE);
  const headers: Record<string, string> = {};
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const token = getToken();
  if (token && !opts.noAuth) headers['Authorization'] = 'Bearer ' + token;
  if (isPreviewMode()) headers['X-Preview'] = '1';
  const ts = Date.now();
  headers['X-Timestamp'] = String(ts);
  headers['X-Nonce'] = randomNonce();
  headers['X-Signature'] = await signRequest('POST', '/api/v1' + path, ts);
  const res = await fetch('/api/v1' + path, {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: form,
  });
  const json = await res.json();
  if (json && json.code === 0) return json.data as T;
  if (res.status === 401 && !opts.noRefresh) {
    const ok = await refreshToken();
    if (ok) return upload(path, form, opts);
    location.href = 'login.html';
  }
  throw new ApiError(json?.code ?? res.status, json?.message ?? '上传失败');
}

export { getCachedUser, saveLogin, SafeUser };
export type { LoginResult } from './auth';
export { clearSession, redirectHome, homeOf } from './auth';
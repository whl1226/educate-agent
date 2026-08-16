import { getToken } from './auth';
import { readCookie } from './request';
import { toast } from './ui';

/**
 * 带鉴权的文件获取：accessToken 仅存内存，普通 <a href> 下载会因缺少
 * Authorization 头而 401（体验账号会跳登录页）。这里统一走 fetch + Blob，
 * 由浏览器以 objectURL 触发下载 / 预览。
 */
async function fetchBlob(url: string): Promise<{ blob: Blob; filename: string }> {
  const csrf = readCookie('XSRF-TOKEN');
  const headers: Record<string, string> = {};
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(url, { credentials: 'same-origin', headers });
  if (res.status === 401) {
    const m = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(m?.message || '登录状态已过期，请刷新页面后重试');
  }
  if (!res.ok) throw new Error('文件获取失败（HTTP ' + res.status + '）');
  const cd = res.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
  let filename = '';
  if (m) {
    try {
      filename = decodeURIComponent(m[1]);
    } catch {
      filename = m[1];
    }
  }
  return { blob: await res.blob(), filename };
}

/** 提取文件扩展名（用于预览判断与兜底文件名） */
function extOf(url: string): string {
  const m = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
  return m ? m[1].toLowerCase() : '';
}

function defaultName(url: string): string {
  const base = url.split('/').pop() || 'file';
  const ext = extOf(url);
  return ext ? `document.${ext}` : base;
}

/** 下载：带鉴权拉取 Blob 后触发浏览器保存 */
export async function downloadFile(url: string, filename?: string): Promise<void> {
  const btn = document.activeElement as HTMLElement | null;
  if (btn) btn.setAttribute('disabled', '');
  try {
    const { blob, filename: serverName } = await fetchBlob(url);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || serverName || defaultName(url);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('已开始下载');
  } catch (e) {
    toast((e as Error).message || '下载失败', '!');
  } finally {
    if (btn) btn.removeAttribute('disabled');
  }
}

const PREVIEWABLE = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'txt', 'md', 'html']);

/** 预览：带鉴权拉取 Blob 后在新标签页打开（浏览器可直接渲染的类型） */
export async function previewFile(url: string, filename?: string): Promise<void> {
  const ext = filename ? (filename.split('.').pop() || '').toLowerCase() : extOf(url);
  try {
    const { blob } = await fetchBlob(url);
    const obj = URL.createObjectURL(blob);
    if (!PREVIEWABLE.has(ext)) {
      // 浏览器无法内联渲染的类型（docx/xlsx 等）直接走下载
      const a = document.createElement('a');
      a.href = obj;
      a.download = filename || defaultName(url);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(obj), 4000);
      toast('该格式不支持预览，已改为下载');
      return;
    }
    window.open(obj, '_blank');
    setTimeout(() => URL.revokeObjectURL(obj), 60000);
  } catch (e) {
    toast((e as Error).message || '预览失败', '!');
  }
}

export function isFileResult(res: unknown): boolean {
  return !!(res && typeof res === 'object' && 'downloadUrl' in (res as Record<string, unknown>));
}

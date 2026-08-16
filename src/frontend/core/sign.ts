declare const __SIGN_SECRET__: string | undefined;

/**
 * 防重放签名密钥仅存在于服务端。
 * 前端 bundle 不得携带任何可预测/可提取的密钥（否则等于向攻击者公开）。
 * 浏览器端请求由服务端以 时间戳+一次性Nonce 完成防重放校验，
 * 该值仅保留给非浏览器客户端（如内部服务）使用。
 */
export const SIGN_SECRET: string =
  typeof __SIGN_SECRET__ !== 'undefined' && __SIGN_SECRET__
    ? String(__SIGN_SECRET__)
    : '';

export async function hmacHex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function randomNonce(): string {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function signRequest(method: string, path: string, ts: number): Promise<string> {
  if (!SIGN_SECRET) return '';
  return hmacHex(SIGN_SECRET, `${method}|${path}|${ts}`);
}
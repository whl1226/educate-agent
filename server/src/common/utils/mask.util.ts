/**
 * 敏感信息脱敏工具：接口输出与审计日志统一使用。
 */

/** 手机号掩码：13812341234 -> 138****1234 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  const s = String(phone).trim();
  if (!/^1\d{10}$/.test(s)) return s;
  return s.slice(0, 3) + '****' + s.slice(7);
}

/** 身份证掩码：保留前 3 后 4 */
export function maskIdCard(id?: string | null): string {
  if (!id) return '';
  const s = String(id).trim();
  if (s.length < 8) return s;
  return s.slice(0, 3) + '*' .repeat(Math.min(s.length - 7, 8)) + s.slice(-4);
}

/** 邮箱掩码：abc@x.com -> a**@x.com */
export function maskEmail(email?: string | null): string {
  if (!email) return '';
  const s = String(email).trim();
  const at = s.indexOf('@');
  if (at <= 1) return s;
  return s[0] + '**' + s.slice(at);
}

/** 姓名脱敏：王秀兰 -> 王** */
export function maskName(name?: string | null): string {
  if (!name) return '';
  const s = String(name).trim();
  if (s.length <= 1) return s;
  return s[0] + '*'.repeat(s.length - 1);
}

const SENSITIVE_KEYS = [
  'password', 'passwordhash', 'refresh_token', 'refreshtoken',
  'token', 'secret', 'apikey', 'api_key', 'authorization',
];

/** 对对象/字符串做脱敏（用于日志与审计输出） */
export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (Array.isArray(value)) return value.map((v) => redact(v));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (SENSITIVE_KEYS.some((k) => lower.includes(k))) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redact((value as Record<string, unknown>)[key]);
      }
    }
    return out;
  }
  return value;
}

function redactString(s: string): string {
  if (s.length >= 32 && /^[A-Za-z0-9._-]{32,}$/.test(s)) return '[REDACTED]';
  return s;
}

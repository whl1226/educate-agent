import { createHash, createHmac, randomBytes } from 'crypto';

/** SHA-256 指纹（设备指纹/Token 哈希统一入口） */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** HMAC-SHA256 签名（防重放/时间戳签名） */
export function hmacSign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** 安全随机 Token（refresh token / 重置 token / nonce） */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** 恒定时间字符串比较（防时序攻击） */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

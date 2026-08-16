import { Request } from 'express';
import { sha256 } from './crypto.util';

export interface DeviceInfo {
  ip: string;
  ua: string;
  /** 设备指纹：IP+UA 等维度的哈希，用于异地登录检测 */
  fingerprint: string;
  deviceName: string;
}

/** 从请求提取设备信息（指纹不存敏感明文，仅存哈希） */
export function deviceOf(req: Request): DeviceInfo {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';
  const acceptLang = req.headers['accept-language'] || '';
  const fingerprint = sha256(`${ip}|${ua}|${acceptLang}`.slice(0, 512));
  const deviceName = describeDevice(ua);
  return { ip, ua: ua.slice(0, 300), fingerprint, deviceName };
}

function describeDevice(ua: string): string {
  const u = ua.toLowerCase();
  if (u.includes('micromessenger')) return '微信浏览器';
  if (u.includes('android')) return 'Android 设备';
  if (u.includes('iphone') || u.includes('ipad') || u.includes('ios')) return 'iOS 设备';
  if (u.includes('windows')) return 'Windows 电脑';
  if (u.includes('mac os')) return 'Mac 电脑';
  return '未知设备';
}

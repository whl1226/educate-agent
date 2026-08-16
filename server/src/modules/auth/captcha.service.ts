import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { CacheService } from '../cache/cache.service';

interface CaptchaPayload {
  id: string;
  svg: string;
}

const CAPTCHA_TTL_SEC = 300;

/** 图形验证码：算式 + SVG 渲染 + Redis 一次性存储 */
@Injectable()
export class CaptchaService {
  constructor(private readonly cache: CacheService) {}

  async generate(): Promise<CaptchaPayload> {
    let a = 2 + Math.floor(Math.random() * 9);
    let b = 2 + Math.floor(Math.random() * 9);
    const op = Math.random() > 0.5 ? '+' : '-';
    if (op === '-' && a < b) [a, b] = [b, a];
    const answer = op === '+' ? a + b : a - b;
    const id = randomBytes(12).toString('hex');
    await this.cache.set(`captcha:${id}`, String(answer), CAPTCHA_TTL_SEC);
    return { id, svg: this.renderSvg(`${a} ${op} ${b} = ?`) };
  }

  async verify(id: string, answer: string): Promise<boolean> {
    if (!id || !answer) return false;
    const key = `captcha:${id}`;
    const stored = await this.cache.get(key);
    if (!stored) return false;
    await this.cache.del(key);
    return stored === answer.trim();
  }

  private renderSvg(text: string): string {
    const noise = Array.from({ length: 6 })
      .map((_, i) => {
        const x1 = Math.floor(Math.random() * 40);
        const y1 = Math.floor(Math.random() * 44);
        const x2 = x1 + 60 + Math.floor(Math.random() * 40);
        const y2 = y1 + Math.floor(Math.random() * 40);
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8b9dc3" stroke-width="1" opacity="0.6"/>`;
      })
      .join('');
    const chars = Array.from(text).map((ch, i) => {
      const rotate = (Math.random() - 0.5) * 40;
      const x = 18 + i * 24;
      const y = 30 + (Math.random() - 0.5) * 8;
      const fill = ['#2563eb', '#7c3aed', '#0891b2', '#db2777'][i % 4];
      return `<text x="${x}" y="${y}" font-size="22" font-weight="bold" fill="${fill}" transform="rotate(${rotate.toFixed(1)} ${x} ${y})">${ch}</text>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="44" viewBox="0 0 120 44">${noise}${chars}</svg>`;
  }
}
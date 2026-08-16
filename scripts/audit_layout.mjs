import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const targets = [
  { name: '作品简介', file: '作品简介.html', w: 1454, h: 2000 },
  { name: '方案PPT', file: '方案PPT.html', w: 1454, h: 817 },
];
const BASE = 'F:/代码文件/vibe coder/无界应用-教育智能体/初赛提交材料';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});

for (const t of targets) {
  const page = await browser.newPage();
  await page.setViewport({ width: t.w, height: t.h });
  await page.goto('file://' + resolve(BASE, t.file), { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);

  const fonts = await page.evaluate(() => ({
    serifLoaded: document.fonts.check('900 20px "Noto Serif SC"'),
    sansLoaded: document.fonts.check('400 20px "Noto Sans SC"'),
  }));

  const slides = await page.$$eval('.slide, body', els => els.map((el, i) => {
    const r = el.getBoundingClientRect();
    const isSlide = el.classList.contains('slide');
    const cs = getComputedStyle(el);
    const overflow = el.scrollHeight - el.clientHeight;
    // find children overflowing the container
    const overflows = [];
    el.querySelectorAll('*').forEach(c => {
      const cr = c.getBoundingClientRect();
      if (cr.width === 0 && cr.height === 0) return;
      const clipX = cr.left < r.left - 0.5 || cr.right > r.right + 0.5;
      const clipY = cr.top < r.top - 0.5 || cr.bottom > r.bottom + 0.5;
      if (clipX || clipY) {
        // SVG 元素 tagName 为小写 "svg"；封面水印为有意溢出的装饰，排除
        const isWatermark = c.tagName.toLowerCase() === 'svg' && (c.classList.contains('watermark') || c.classList.contains('mark'));
        if (isWatermark) return;
        overflows.push({
          tag: c.tagName, cls: (c.className + '').slice(0, 40),
          left: Math.round(cr.left - r.left), top: Math.round(cr.top - r.top),
          right: Math.round(cr.right - r.left), bottom: Math.round(cr.bottom - r.top),
          clipX, clipY,
        });
      }
    });
    return { i, isSlide, h: Math.round(r.height), scrollH: el.scrollHeight, overflow, overflowCount: overflows.length, overflows: overflows.slice(0, 6) };
  }));

  console.log(`\n===== ${t.name} =====`);
  console.log('fonts:', JSON.stringify(fonts));
  for (const s of slides) {
    const flag = s.overflow > 2 || s.overflowCount > 0 ? '  ⚠️' : '  OK';
    console.log(`[${s.i}] overflow=${s.overflow}px  childrenOut=${s.overflowCount}${flag}`);
    s.overflows.forEach(o => console.log(`    └ ${o.tag}.${o.cls}  clipX=${o.clipX} clipY=${o.clipY} (${o.left},${o.top}→${o.right},${o.bottom})`));
  }
  await page.close();
}
await browser.close();

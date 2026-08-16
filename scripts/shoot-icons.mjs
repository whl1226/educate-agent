/**
 * 全面图标验证：
 * A. public/ 5 页 —— localhost:3000 服务器登录后浏览（?preview=1 跨角色）
 * B. 原型/ 4 页 —— file:// 直接打开（模拟用户双击，验证内联图标脚本）
 * 每页统计 .iconify 渲染数并截图到 _shots/。
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, '_shots');
mkdirSync(outDir, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';

async function iconStats(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('.iconify')];
    const rendered = els.filter((e) => !!e.querySelector('svg')).length;
    const empty = [...new Set(els.filter((e) => !e.querySelector('svg')).map((e) => e.getAttribute('data-icon') || '(none)'))];
    return { total: els.length, rendered, empty };
  });
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

// ===== A. public/ 服务器版 =====
console.log('===== A. public/ (localhost:3000) =====');
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(BASE + '/login.html', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('#username', 'wangxiulan');
  await page.type('#password', 'Demo@2026xy');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), page.click('#submitBtn')]);
  await new Promise((r) => setTimeout(r, 2000));
  for (const t of [
    { name: 'v2-teacher', url: '/teacher.html' },
    { name: 'v2-agent', url: '/agent.html' },
    { name: 'v2-student', url: '/student.html?preview=1' },
    { name: 'v2-parent', url: '/parent.html?preview=1' },
    { name: 'v2-admin', url: '/admin.html?preview=1' },
  ]) {
    await page.goto(BASE + t.url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1800));
    const s = await iconStats(page);
    await page.screenshot({ path: join(outDir, t.name + '.png') });
    console.log(`[${t.name}] 渲染 ${s.rendered}/${s.total}${s.empty.length ? ' 空:' + s.empty.join(',') : ''}`);
  }
  await page.close();
}

// ===== B. 原型/ file:// 版（模拟双击打开） =====
console.log('\n===== B. 原型/ (file:// 双击场景) =====');
for (const n of ['学生端', '家长端', '教师端', '管理端']) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => console.log(`  [${n}] JS错误:`, e.message.slice(0, 120)));
  await page.goto('file:///' + join(root, '原型', n + '.html').replace(/\\/g, '/'), { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  const s = await iconStats(page);
  await page.screenshot({ path: join(outDir, 'proto-' + n + '.png') });
  console.log(`[${n}] 渲染 ${s.rendered}/${s.total}${s.empty.length ? ' 空:' + s.empty.join(',') : ''}`);
  await page.close();
}

await browser.close();
console.log('\n截图目录:', outDir);

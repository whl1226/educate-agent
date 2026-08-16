import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = 'F:/代码文件/vibe coder/无界应用-教育智能体';
const PROTO = join(ROOT, '原型');
const OUT = join(ROOT, '初赛提交材料/assets');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const icons = JSON.parse(readFileSync(join(OUT, 'icons.json'), 'utf-8'));

const files = [
  { name: '教师端', file: '教师端.html', out: 'shot-teacher.png' },
  { name: '学生端', file: '学生端.html', out: 'shot-student.png' },
  { name: '家长端', file: '家长端.html', out: 'shot-parent.png' },
  { name: '管理端', file: '管理端.html', out: 'shot-admin.png' },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--force-device-scale-factor=1', '--hide-scrollbars'],
});

const W = 1440, H = 810; // 16:9, slightly larger to show more dashboard content

for (const f of files) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
  // Define Iconify stub before any page script runs
  await page.evaluateOnNewDocument(() => {
    window.Iconify = { replace: () => Promise.resolve(), ready: () => Promise.resolve(), set: () => {} };
  });
  // Inject icon map + render function
  await page.evaluateOnNewDocument((iconMap) => { window.__ICONS__ = iconMap; }, icons);

  let html = readFileSync(join(PROTO, f.file), 'utf-8');
  // Strip unreachable iconify loader script (we render icons ourselves)
  html = html.replace(/<script src="https:\/\/code\.iconify\.design[^>]*><\/script>/g, '');

  await page.goto('file://' + join(PROTO, f.file), { waitUntil: 'networkidle2', timeout: 30000 }).catch(e => console.warn('goto warn', f.file, e.message));
  // Wait for ECharts + a moment for charts to paint
  await page.waitForFunction('typeof window.echarts !== "undefined"', { timeout: 15000 }).catch(() => console.warn('echarts not loaded for', f.file));
  await new Promise(r => setTimeout(r, 2800));

  // Render icons from local map
  await page.evaluate(() => {
    const map = window.__ICONS__ || {};
    document.querySelectorAll('[data-icon]').forEach(el => {
      const ic = el.getAttribute('data-icon');
      if (map[ic]) {
        el.innerHTML = map[ic];
        el.style.display = 'inline-flex';
        el.style.verticalAlign = 'middle';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.width = '1.1em';
        el.style.height = '1.1em';
      }
    });
    // trigger any echarts resize
    if (window.echarts) document.querySelectorAll('*').forEach(() => {});
  });
  await new Promise(r => setTimeout(r, 600));

  await page.screenshot({ path: join(OUT, f.out), clip: { x: 0, y: 0, width: W, height: H } });
  console.log('Saved', f.out);
  await page.close();
}
await browser.close();
console.log('All screenshots done.');

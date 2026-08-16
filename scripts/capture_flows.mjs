import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = 'F:/代码文件/vibe coder/无界应用-教育智能体';
const PROTO = resolve(ROOT, '原型');
const OUT = resolve(ROOT, '初赛提交材料/assets/flows');
mkdirSync(OUT, { recursive: true });
const icons = JSON.parse(readFileSync(resolve(ROOT, '初赛提交材料/assets/icons.json'), 'utf-8'));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// 教师13 + 管理8 + 学生5 + 家长3
const targets = [
  { role: 'teacher', file: '教师端.html', selector: '.nav-item[data-page]', attr: 'data-page', prefix: 'teacher' },
  { role: 'admin',   file: '管理端.html', selector: '.nav-item[data-page]', attr: 'data-page', prefix: 'admin' },
  { role: 'student', file: '学生端.html', selector: '.tab-item[data-tab]',  attr: 'data-tab',  prefix: 'student' },
  { role: 'parent',  file: '家长端.html', selector: '.tab-item[data-tab]',  attr: 'data-tab',  prefix: 'parent' },
];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--force-device-scale-factor=1'],
});

for (const t of targets) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: 2 });
  // icon stub
  await page.evaluateOnNewDocument(() => { window.Iconify = { replace:()=>P, ready:()=>P, set:()=>{} }; });
  await page.evaluateOnNewDocument((m) => { window.__ICONS__ = m; }, icons);
  let html = readFileSync(resolve(PROTO, t.file), 'utf-8');
  html = html.replace(/<script src="https:\/\/code\.iconify\.design[^>]*><\/script>/g, '');
  await page.goto('file://' + resolve(PROTO, t.file), { waitUntil: 'networkidle2', timeout: 30000 }).catch(()=>{});
  // wait echarts + init
  await page.waitForFunction('typeof window.echarts!=="undefined"', { timeout: 15000 }).catch(()=>console.warn('echarts skip', t.file));
  await new Promise(r => setTimeout(r, 2500));
  // render icons
  await page.evaluate(() => {
    const m = window.__ICONS__||{};
    document.querySelectorAll('[data-icon]').forEach(el => {
      const ic = el.getAttribute('data-icon');
      if (m[ic]) {
        el.innerHTML = m[ic];
        el.style.display='inline-flex'; el.style.verticalAlign='middle';
        el.style.alignItems='center'; el.style.justifyContent='center';
        el.style.width='1.1em'; el.style.height='1.1em';
      }
    });
  });
  await new Promise(r => setTimeout(r, 400));

  // collect nav items in order, skip the first if it's already "on"
  const items = await page.$$eval(t.selector, els => els.map(e => ({
    id: e.getAttribute(e.getAttribute('data-page') ? 'data-page' : 'data-tab'),
    label: (e.textContent || '').trim().replace(/\s+/g,' ').replace(/[\\/:*?"<>|]/g,''),
    isOn: e.classList.contains('on') || e.classList.contains('active'),
  })));
  console.log(`${t.role}: ${items.length} items`);

  // screenshot each sub-page at FULL content height (no clip → 完整不裁切)
  const seen = new Set();
  const order = items.map((_, i) => i); // keep order
  for (const idx of order) {
    const item = items[idx];
    if (!item.id) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    // 回到基准视口：防止上一页视口过高导致 .main{flex:1} 被撑出大量空白
    await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: 2 });
    // click via selector nth-of-type
    const handles = await page.$$(t.selector);
    if (!handles[idx]) continue;
    // ensure visible (sidebar is visible in desktop; tabs visible at bottom)
    await handles[idx].click();
    // wait for transition + chart resize (showPage does setTimeout 120,130)
    await new Promise(r => setTimeout(r, 1200));
    // re-render icons for newly shown page (if any new icons appeared)
    await page.evaluate(() => {
      const m = window.__ICONS__||{};
      document.querySelectorAll('[data-icon]').forEach(el => {
        if (!el.querySelector('svg') && m[el.getAttribute('data-icon')]) {
          el.innerHTML = m[el.getAttribute('data-icon')];
          el.style.display='inline-flex'; el.style.verticalAlign='middle';
          el.style.alignItems='center'; el.style.justifyContent='center';
          el.style.width='1.1em'; el.style.height='1.1em';
        }
      });
      if (window.echarts && window._chartInsts) window._chartInsts.forEach(c=>{ try{c.resize();}catch(e){} });
    });
    await new Promise(r => setTimeout(r, 500));

    // 按内容真实高度设置视口，捕获完整页面（避免裁切）
    const measure = () => page.evaluate(() => Math.ceil(Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight
    )));
    let h = await measure();
    const buffer = h > 810 ? 60 : 0;          // 给重排留余量；矮页不撑高
    h = Math.min(h + buffer, 6000);
    await page.setViewport({ width: 1440, height: h, deviceScaleFactor: 2 });
    await new Promise(r => setTimeout(r, 600));
    // 视口变化后再次渲染图标 + 触发图表 resize，并复测高度
    await page.evaluate(() => {
      const m = window.__ICONS__||{};
      document.querySelectorAll('[data-icon]').forEach(el => {
        if (!el.querySelector('svg') && m[el.getAttribute('data-icon')]) {
          el.innerHTML = m[el.getAttribute('data-icon')];
        }
      });
      try { window.dispatchEvent(new Event('resize')); } catch(e){}
    });
    await new Promise(r => setTimeout(r, 500));
    const h2 = await measure();
    if (h2 > h + 30) {
      // 内容因重排显著增长，再扩一次（带小缓冲）
      await page.setViewport({ width: 1440, height: Math.min(h2 + 30, 6000), deviceScaleFactor: 2 });
      await new Promise(r => setTimeout(r, 400));
    }

    const slug = item.label || item.id;
    const file = resolve(OUT, `${t.prefix}-${item.id}-${idx}.png`);
    await page.screenshot({ path: file }); // 完整页面，无 clip
    console.log(`  saved ${file}  h=${h} (${slug})`);
  }
  await page.close();
}
await browser.close();
console.log('All flows captured to', OUT);
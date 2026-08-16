/**
 * 验证教师端「班级掌握度构成」环形图：
 * 1. 扇区数 = 5（5 色：扎实/良好/待提升/薄弱/需补强）
 * 2. 中心文字 = 78.6%（未被真实数据覆盖成 2 色 40%）
 * 3. KPI「班级平均掌握度」卡保持 78.6%
 * 4. 图表实例只初始化一次（无跳转）
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

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// 登录教师
await page.goto(BASE + '/login.html', { waitUntil: 'networkidle2', timeout: 60000 });
await page.type('#username', 'wangxiulan');
await page.type('#password', 'Demo@2026xy');
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}), page.click('#submitBtn')]);
await new Promise((r) => setTimeout(r, 1500));
await page.goto(BASE + '/teacher.html', { waitUntil: 'networkidle2', timeout: 60000 });
// 等数据加载 + 图表渲染完成
await new Promise((r) => setTimeout(r, 3500));

const result = await page.evaluate(() => {
  const out = {};
  const ring = window._chartInsts?.[0];
  out.chartInstCount = (window._chartInsts || []).length;
  out.chartsBootedOnce = !!window.__chartsBooted;
  if (ring) {
    const opt = ring.getOption();
    const series = opt?.series?.[0];
    out.sliceCount = series?.data?.length;
    out.colors = series?.data?.map((d) => d.itemStyle?.color);
    out.names = series?.data?.map((d) => d.name);
    out.labelFmt = series?.label?.formatter;
    const legend = opt?.legend?.[0] || opt?.legend;
    out.legendData = legend?.data || (legend && legend.length ? legend.map((l) => l.data) : null);
  }
  // KPI 班级平均掌握度卡（第 3 张卡）
  const kpis = [...document.querySelectorAll('#page-dashboard .kpi .kpi-num')];
  out.kpiCards = kpis.map((k) => k.textContent.trim());
  return out;
});
console.log(JSON.stringify(result, null, 2));
await page.screenshot({ path: join(outDir, 'ring-5color.png') });
await browser.close();

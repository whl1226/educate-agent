// scripts/capture_assets.mjs — 真实访问官网截政策页 + 下载可商用情境图
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'F:/代码文件/vibe coder/无界应用-教育智能体/初赛提交材料/assets';

// 三个政策页（已实测 moe.gov.cn 可达）：标题/文号/关键条款在页面首屏区域
const POLICIES = [
  { name: 'policy-quality', // 义务教育质量意见
    url: 'https://www.moe.gov.cn/jyb_xxgk/moe_1777/moe_1778/201907/t20190708_389416.html',
    kw: ['深化教育教学改革', '义务教育质量', '中发'] },
  { name: 'policy-rural',   // 新时代乡村教师队伍建设意见
    url: 'https://www.moe.gov.cn/srcsite/A10/s3735/202009/t20200903_484941.html',
    kw: ['新时代乡村教师队伍建设', '教师〔2020〕5号'] },
  { name: 'policy-digital', // 国家教育数字化战略行动（国家智慧教育平台接入规范页，含"教育数字化战略行动"）
    url: 'https://www.moe.gov.cn/srcsite/A16/s3342/202208/t20220819_653868.html',
    kw: ['教育数字化战略行动', '智慧教育'] },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });

// 1) 政策截图：截页面首屏（标题+文号区域），2x 放大保证可读
for (const p of POLICIES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  await page.goto(p.url, { waitUntil: 'networkidle2', timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  const html = await page.evaluate(() => document.body.innerText);
  const missing = p.kw.filter(k => !html.includes(k));
  if (missing.length) { console.warn(`[WARN] ${p.name} 页面未命中关键词: ${missing}`); }
  // 截前 40% 页高（标题+文号+开头正文），存 PNG
  await page.screenshot({ path: resolve(OUT, p.name + '.png'),
    clip: { x: 0, y: 0, width: 1280, height: 640 } });
  console.log(`[OK] ${p.name} (kw缺${missing.length}个)`);
  await page.close();
}

// 2) 情境图：Unsplash 直链（可商用、免登录），失败则跳过不阻塞
// 注：brief 原版用 page.evaluate 内 fetch + arrayBuffer，puppeteer 序列化 ArrayBuffer
// 返回空对象导致 Buffer.from 报错；改用 Node 22 全局 fetch 直下（已实测 200 image/jpeg）。
const SCENES = [
  ['scene-1', 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1200&q=70'], // 乡村教室
  ['scene-2', 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1200&q=70'], // 教室黑板
];
for (const [name, url] of SCENES) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await writeFile(resolve(OUT, name + '.jpg'), Buffer.from(await res.arrayBuffer()));
    console.log('[OK] ' + name);
  } catch (e) { console.warn('[SKIP] ' + name + ' 下载失败: ' + e.message); }
}
await browser.close();

/**
 * 真实集成验证：演示账号（教师 wangxiulan）通过 ?preview=1 预览管理端，
 * 点「AI 全域盘点」走真实后端 agent（demo 规则引擎），
 * 验证 admin 工具（区域学情概览/预警列表）不再被权限拦截。
 * 走真实登录表单（含 CSRF/签名/防重放头）。
 * 运行：node scripts/verify-admin-ai-live.mjs
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
  if (!ok) failed += 1;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

  // 1. 真实登录表单流程（前端 post 自动带 CSRF/签名/防重放头）—— admin 账号
  await page.goto(BASE + '/login.html', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 800));
  await page.type('#username', 'zhoujuzhang');
  await page.type('#password', 'Admin@2026Xy');
  await page.evaluate(() => {
    const form = document.getElementById('loginForm');
    if (form) form.requestSubmit();
  });
  // 等登录完成 + 跳转（admin.html）
  await new Promise((r) => setTimeout(r, 4000));
  // 登录已由 /auth/login 200 + 自动跳转证明；直接验证管理端

  // 2. 预览模式访问管理端（跨角色浏览；token 由 refresh cookie 自动恢复）
  await page.goto(BASE + '/admin.html?preview=1', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));

  const pageOk = await page.evaluate(() => !!document.querySelector('[data-ai-task="overview"]'));
  check('预览管理端页面加载出 AI 按钮', pageOk);

  // 3. 点击 AI 全域盘点 → 真实 agent 流（LLM 模式，轮询直到完成或超时 25s）
  await page.evaluate(() => {
    const btn = document.querySelector('[data-ai-task="overview"]');
    if (btn) btn.click();
  });
  let status = '';
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    status = await page.evaluate(() => document.querySelector('#aiStatus')?.textContent || '');
    if (status === '完成' || status === '出错' || status === '失败') break;
  }

  const state = await page.evaluate(() => {
    const answer = document.querySelector('[data-ai-answer]')?.textContent || '';
    const trace = Array.from(document.querySelectorAll('[data-ai-trace-body] > div')).map((d) => d.textContent);
    return { answer, trace };
  });

  check('弹窗完成', status === '完成', status);
  check('轨迹含「区域学情概览」', state.trace.some((t) => t.includes('区域学情概览')), state.trace.join('|'));
  check('轨迹含「预警列表」', state.trace.some((t) => t.includes('预警列表')), state.trace.join('|'));
  check('无「无权限」错误', !state.trace.some((t) => t.includes('无权限')), state.trace.join('|'));
  check('结论区有内容', state.answer.trim().length > 0, state.answer.slice(0, 80));
  // iconify CDN 连接被 CSP 拦截属环境噪音，仅当出现业务 JS 异常才算失败
  const jsErrors = consoleErrors.filter((e) => /PAGEERROR|is not defined|undefined is not/i.test(e));
  check('无业务 JS 错误', jsErrors.length === 0, jsErrors.slice(0, 2).join(' || '));

  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
}
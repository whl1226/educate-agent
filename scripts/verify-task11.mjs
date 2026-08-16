/**
 * Task 11 验证：教研员 resTab1 上传 docx/pdf → 解析注入「教案材料」输入区
 * 使用桩 API（与 verify-task7/8.mjs 同法），覆盖：
 *  1. resTab1 存在上传条（resUpBtn/resUpFile/resUpStatus）与教案材料 textarea
 *  2. 点上传 → 选 .docx → 状态条显示「已解析 …（N 字）」→ textarea 注入桩文本（可编辑）
 *  3. truncated=true 时状态条含「内容过长已截断」
 *  4. 超 10MB 文件被拒（toast 提示）
 *  5. 点击「发送给智能体」→ xy.agent.task 同时包含所选题目与注入的教案材料
 * 运行：node scripts/verify-task11.mjs
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';
import { join } from 'path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const ME_STUB = {
  code: 0,
  data: {
    id: 1, username: 'verify-teacher', displayName: '验证教师', role: 'teacher',
    avatar: null, phoneMasked: '138****0000', studentNo: null, permissions: ['teacher'],
  },
};

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
  if (!ok) failed += 1;
}

const tmpDocx = join(process.cwd(), 'verify-task11-教案.docx');
const tmpBig = join(process.cwd(), 'verify-task11-big.docx');
writeFileSync(tmpDocx, 'task11-verify-docx');
writeFileSync(tmpBig, 'x'.repeat(10 * 1024 * 1024 + 1));

const EXTRACT_TEXT = '【导入】复习上节课内容 5 分钟。\n【新授】讲解方程概念 20 分钟。\n【练习】学生做练习册 15 分钟。\n【总结】布置作业。';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setRequestInterception(true);

  let extractCount = 0;
  let truncatedNext = false;
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('/api/v1/auth/me')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(ME_STUB) });
    } else if (url.includes('/api/v1/files/extract-text') && method === 'POST') {
      extractCount += 1;
      req.respond({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          data: { ok: true, text: EXTRACT_TEXT, chars: EXTRACT_TEXT.length, truncated: truncatedNext, name: '教案.docx' },
        }),
      });
    } else if (url.endsWith('/agent.html') || url.includes('/agent.html')) {
      req.respond({ status: 200, contentType: 'text/html', body: '<html><body>agent-stub</body></html>' });
    } else if (url.includes('/api/v1/')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: [] }) });
    } else {
      req.continue();
    }
  });

  await page.goto(BASE + '/teacher.html', { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.switchResTab && window.switchResTab(1));
  await new Promise((r) => setTimeout(r, 300));

  /* ========== 1. resTab1 上传条与输入区存在 ========== */
  const uiState = await page.evaluate(() => {
    const tab = document.getElementById('resTab1');
    return {
      tabVisible: tab ? getComputedStyle(tab).display !== 'none' : false,
      hasBtn: !!document.getElementById('resUpBtn'),
      hasFile: !!document.getElementById('resUpFile'),
      hasStatus: !!document.getElementById('resUpStatus'),
      accept: (document.getElementById('resUpFile') || {}).accept || '',
      ta: document.querySelector('#resTab1 textarea'),
      taField: document.querySelector('#resTab1 textarea')?.getAttribute('data-field') || '',
    };
  });
  check('resTab1 可见', uiState.tabVisible);
  check('上传条三件套齐全', uiState.hasBtn && uiState.hasFile && uiState.hasStatus);
  check('accept 限定 .docx,.pdf', uiState.accept === '.docx,.pdf', uiState.accept);
  check('resTab1 存在注入用 textarea(data-field=res1Material)', !!uiState.ta && uiState.taField === 'res1Material', uiState.taField);

  /* ========== 2. 选择 .docx → 解析注入 ========== */
  let chooserPromise = page.waitForFileChooser();
  await page.evaluate(() => document.getElementById('resUpBtn').click());
  let chooser = await chooserPromise;
  await chooser.accept([tmpDocx]);
  await new Promise((r) => setTimeout(r, 800));

  const injectState = await page.evaluate(() => {
    const ta = document.querySelector('#resTab1 textarea');
    return {
      status: document.getElementById('resUpStatus')?.textContent || '',
      taValue: ta ? ta.value : '',
      taMinHeight: ta ? ta.style.minHeight : '',
      btnDisabled: (document.getElementById('resUpBtn') || {}).disabled,
      toast: document.getElementById('toastText')?.textContent || '',
    };
  });
  check('extract-text 请求发出 1 次', extractCount === 1, String(extractCount));
  check('状态条显示解析字数', injectState.status.includes('已解析') && injectState.status.includes('字'), injectState.status.slice(0, 60));
  check('状态条含文件名「教案.docx」', injectState.status.includes('教案.docx'), injectState.status.slice(0, 60));
  check('textarea 已注入解析文本', injectState.taValue.includes('【新授】讲解方程概念 20 分钟'), injectState.taValue.slice(0, 40));
  check('注入后 min-height 260px', injectState.taMinHeight === '260px', injectState.taMinHeight);
  check('按钮恢复可用', injectState.btnDisabled === false);
  check('toast 提示解析成功', injectState.toast.includes('教案已解析并注入'), injectState.toast);

  /* ========== 3. truncated=true 状态文案 ========== */
  truncatedNext = true;
  chooserPromise = page.waitForFileChooser();
  await page.evaluate(() => document.getElementById('resUpBtn').click());
  chooser = await chooserPromise;
  await chooser.accept([tmpDocx]);
  await new Promise((r) => setTimeout(r, 800));
  const truncState = await page.evaluate(() => document.getElementById('resUpStatus')?.textContent || '');
  check('truncated 时状态条含截断提示', truncState.includes('内容过长已截断'), truncState.slice(0, 60));
  truncatedNext = false;

  /* ========== 4. 超 10MB 文件被拒 ========== */
  const beforeCount = extractCount;
  chooserPromise = page.waitForFileChooser();
  await page.evaluate(() => document.getElementById('resUpBtn').click());
  chooser = await chooserPromise;
  await chooser.accept([tmpBig]);
  await new Promise((r) => setTimeout(r, 600));
  const bigState = await page.evaluate(() => ({
    toast: document.getElementById('toastText')?.textContent || '',
    btnDisabled: (document.getElementById('resUpBtn') || {}).disabled,
  }));
  check('超 10MB 拒绝且未发请求', bigState.toast.includes('10MB') && extractCount === beforeCount, bigState.toast);
  check('拒绝后按钮仍可用', bigState.btnDisabled === false);

  /* ========== 5. 发送给智能体带题目 + 教案材料 ========== */
  await page.evaluate(() => {
    const pick = document.querySelector('#resTab1 .list-row[data-q="x + 2x + 5 = 26，求 x"]');
    if (pick) pick.click();
    const btn = document.querySelector('#resTab1 [data-send-agent="res1"]');
    btn.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  const task = await page.evaluate(() => sessionStorage.getItem('xy.agent.task') || '');
  check('任务包含所选题目', task.includes('x + 2x + 5 = 26，求 x'), task.slice(0, 50));
  check('任务包含注入的教案材料', task.includes('【新授】讲解方程概念 20 分钟'), task.slice(0, 50));

  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
}
/**
 * 验证教师端全局控件绑定（bindGlobalControls）：
 *  1. radio-pill > span 点击 → .on 迁移到被点项
 *  2. .switch 点击 → .on 切换
 *  3. dataset.bound 防重绑定到位（多次触发不重复绑定）
 *  4. .opt-card 未被重复绑定（避免与 legacy CSP 层双触发）
 * 需要本地服务运行（默认 http://localhost:3000），且 Chrome 位于默认路径。
 * 运行：node scripts/verify-controls.mjs
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const ME_STUB = {
  code: 0,
  data: {
    id: 1,
    username: 'verify-teacher',
    displayName: '验证教师',
    role: 'teacher',
    avatar: null,
    phoneMasked: '138****0000',
    studentNo: null,
    permissions: ['teacher'],
  },
};

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
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/v1/auth/me')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ME_STUB),
      });
    } else if (url.includes('/api/v1/')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 1, message: 'verify-stub' }),
      });
    } else {
      req.continue();
    }
  });

  await page.goto(`${BASE}/teacher.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.radio-pill > span');
      return el && el.dataset.bound === '1';
    },
    { timeout: 15000 },
  );
  console.log('已加载 teacher.html 且 bindGlobalControls 生效（radio-pill 已绑定）\n');

  check(
    'radio-pill: 未选中项点击后 .on 迁移',
    await page.evaluate(() => {
      const pill = document.querySelector('.radio-pill[data-field="subject"]') || document.querySelector('.radio-pill');
      if (!pill) return false;
      const spans = Array.from(pill.querySelectorAll(':scope > span'));
      const target = spans.find((s) => !s.classList.contains('on')) || spans[1];
      if (!target) return false;
      const before = spans.findIndex((s) => s.classList.contains('on'));
      target.click();
      const after = spans.findIndex((s) => s.classList.contains('on'));
      return before !== -1 && after === spans.indexOf(target) && before !== after;
    }),
    'click 前仅一个 .on，click 后被点项持有 .on',
  );

  check(
    'radio-pill: 同组旧 .on 已被移除（单选互斥）',
    await page.evaluate(() => {
      const pill = document.querySelector('.radio-pill[data-field="subject"]') || document.querySelector('.radio-pill');
      if (!pill) return false;
      return pill.querySelectorAll(':scope > span.on').length === 1;
    }),
  );

  check(
    'switch: 点击切换状态（on ↔ off）',
    await page.evaluate(() => {
      const sw = document.querySelector('.switch');
      if (!sw) return false;
      const before = sw.classList.contains('on');
      sw.click();
      const after1 = sw.classList.contains('on');
      sw.click();
      const after2 = sw.classList.contains('on');
      return before !== after1 && after1 !== after2 && before === after2;
    }),
    '两次点击后回到初始状态',
  );

  check(
    'switch 已带 dataset.bound 标记（防重绑定标志）',
    await page.evaluate(() => {
      const sw = document.querySelector('.switch');
      return !!sw && sw.dataset.bound === '1';
    }),
    'radio-pill/switch 均带 dataset.bound="1"',
  );

  check(
    '.opt-card 未被绑定（无 dataset.bound，避免与 legacy CSP 层双触发）',
    await page.evaluate(() => {
      const cards = document.querySelectorAll('.opt-card[data-bound="1"]');
      return cards.length === 0;
    }),
    `当前 opt-card 总数：${await page.evaluate(() => document.querySelectorAll('.opt-card').length)}`,
  );
} catch (e) {
  failed += 1;
  console.log('FAIL  脚本异常:', e.message);
} finally {
  await browser.close();
}

console.log(`\n结果：${failed === 0 ? '全部通过' : failed + ' 项失败'}`);
process.exit(failed === 0 ? 0 : 1);

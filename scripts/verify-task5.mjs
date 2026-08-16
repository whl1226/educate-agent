/**
 * Task 5 验证：组卷下载引导 + 预览来源说明 + 教研员 tab 交互修复
 * 使用桩 API（与 verify-task4.mjs 同法），覆盖：
 *  1. 组卷空态 → paperHint 引导条可见；下载按钮 disabled
 *  2. 组卷有试卷 → paperHint 隐藏；下载按钮 enabled；预览回填
 *  3. 预览卡片来源标注（由智能体组卷结果回填）存在于 DOM
 *  4. 讲题话术：togglePick 切换 .sel + 图标；点第 2 题发送 → sessionStorage 含所选题目
 *  5. 教学建议：resAdvice 发送 → sessionStorage 含依据文本 → 跳 agent.html
 * 运行：node scripts/verify-task5.mjs
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const ME_STUB = {
  code: 0,
  data: {
    id: 1, username: 'verify-teacher', displayName: '验证教师', role: 'teacher',
    avatar: null, phoneMasked: '138****0000', studentNo: null, permissions: ['teacher'],
  },
};

const PAPER = {
  id: 9, subject: '数学', grade: '五年级', topic: '简易方程',
  createdAt: '2026-08-16T08:00:00.000Z',
};

const PAPER_EXPORT = {
  content: [
    '一、选择题',
    '1. 用含有字母的式子表示：比 x 的 3 倍多 5 的数是 ____。',
    '（参考答案：3x+5，2 分）',
    '【A 层】',
    '2. 解方程 3x + 5 = 20，x = ____。',
    '（参考答案：5，2 分）',
    '【B 层】',
    '3. 学校图书角有故事书 x 本，科技书比故事书的 2 倍少 8 本，科技书有 ____ 本。',
    '（参考答案：2x-8，3 分）',
    '【B 层】',
    '4. 王叔叔从镇上到县城卖山货，去时每小时行 v 千米，回程每小时行 (v-6) 千米。往返时间相差 0.5 小时，两地相距多少千米？',
    '（参考答案：v(v-6)/6，5 分）',
    '【C 层】',
  ].join('\n'),
};

let failed = 0;
let papersMode = 'empty';
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
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(ME_STUB) });
    } else if (url.includes('/api/v1/papers/') && url.includes('/export')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: PAPER_EXPORT }) });
    } else if (url.includes('/api/v1/papers')) {
      const data = papersMode === 'empty' ? [] : [PAPER];
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data }) });
    } else if (url.includes('/api/v1/')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: null }) });
    } else {
      req.continue();
    }
  });

  // ===== 1. 空态：引导条可见 + 下载禁用 + 来源标注 =====
  papersMode = 'empty';
  await page.goto(`${BASE}/teacher.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#paperHint', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1200));

  check(
    '组卷空态：paperHint 引导条可见',
    await page.evaluate(() => {
      const h = document.getElementById('paperHint');
      return !!h && getComputedStyle(h).display !== 'none' && h.textContent.includes('点击「发送给智能体」完成组卷后，即可下载');
    }),
  );
  check(
    '组卷空态：下载按钮 disabled',
    await page.evaluate(() => {
      const d = document.getElementById('paperDlDocx');
      const p = document.getElementById('paperDlPdf');
      return !!d && !!p && d.disabled === true && p.disabled === true;
    }),
  );
  check(
    '预览卡片：来源标注「由智能体组卷结果回填」存在',
    await page.evaluate(() => {
      const title = Array.from(document.querySelectorAll('#page-paper .card .card-title'))
        .find((t) => t.textContent?.includes('试卷预览'));
      return !!title && title.textContent.includes('由智能体组卷结果回填') && title.textContent.includes('下载 Word/PDF 与预览一致');
    }),
  );
  check(
    '组卷空态：预览占位文案存在',
    await page.evaluate(() => {
      const title = Array.from(document.querySelectorAll('#page-paper .card .card-title'))
        .find((t) => t.textContent?.includes('试卷预览'));
      const box = title?.closest('.card')?.querySelector('.card-head + div');
      return !!box && box.textContent.includes('暂无试卷');
    }),
  );

  // ===== 2. 有试卷：引导条隐藏 + 下载可用 + 预览回填 =====
  papersMode = 'has';
  await page.goto(`${BASE}/teacher.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const chip = Array.from(document.querySelectorAll('#page-paper .card .card-head .chip'))
      .find((c) => c.textContent === '4 题');
    return document.getElementById('paperDlDocx')?.disabled === false && !!chip;
  }, { timeout: 15000 });
  check(
    '有试卷：paperHint 隐藏',
    await page.evaluate(() => {
      const h = document.getElementById('paperHint');
      return !!h && getComputedStyle(h).display === 'none';
    }),
  );
  check(
    '有试卷：下载按钮 enabled',
    await page.evaluate(() => {
      const d = document.getElementById('paperDlDocx');
      const p = document.getElementById('paperDlPdf');
      return !!d && !!p && d.disabled === false && p.disabled === false;
    }),
  );
  check(
    '有试卷：预览回填题目（解析 export 4 题）',
    await page.evaluate(() => {
      const title = Array.from(document.querySelectorAll('#page-paper .card .card-title'))
        .find((t) => t.textContent?.includes('试卷预览'));
      const rows = title?.closest('.card')?.querySelectorAll('.list-row') || [];
      const chip = title?.closest('.card')?.querySelector('.card-head .chip');
      return rows.length === 4 && chip?.textContent === '4 题';
    }),
  );

  // ===== 3. 教研员页：讲题话术 togglePick 与动态题目 =====
  await page.click('.nav-item[data-page="researcher"]');
  await page.waitForSelector('#page-researcher', { timeout: 8000 });
  await page.evaluate(() => switchResTab(1));
  await page.waitForFunction(() => document.getElementById('resTab1')?.style.display !== 'none', { timeout: 8000 });

  check(
    '讲题话术：题目行带 data-q',
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#resTab1 .list-row');
      return rows.length === 2 && !!rows[0].getAttribute('data-q') && !!rows[1].getAttribute('data-q');
    }),
  );
  check(
    'togglePick：点击第 2 题 → .sel + check-circle 图标 + 主色边框',
    await page.evaluate(() => {
      const row = document.querySelectorAll('#resTab1 .list-row')[1];
      row.click();
      const ico = row.querySelector('[data-ico]');
      return row.classList.contains('sel')
        && ico?.dataset.icon === 'ph:check-circle'
        && row.style.borderColor === 'var(--primary)';
    }),
  );
  check(
    'togglePick：再次点击 → 取消 .sel + circle 图标',
    await page.evaluate(() => {
      const row = document.querySelectorAll('#resTab1 .list-row')[1];
      row.click();
      const ico = row.querySelector('[data-ico]');
      return !row.classList.contains('sel') && ico?.dataset.icon === 'ph:circle';
    }),
  );
  check(
    'togglePick 单选互斥：选第 1 题后再选第 2 题 → 仅第 2 题 .sel，第 1 题视觉复位',
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#resTab1 .list-row');
      rows[0].click();
      rows[1].click();
      const ico0 = rows[0].querySelector('[data-ico]');
      return rows[1].classList.contains('sel')
        && !rows[0].classList.contains('sel')
        && ico0?.dataset.icon === 'ph:circle'
        && ico0.style.color === 'rgb(195, 199, 212)'
        && rows[0].style.borderColor === 'var(--border)';
    }),
  );

  // 重新选中第 2 题并发送（同步捕获 setItem，避免 agent 页 boot 消费后读不到）
  await page.evaluate(() => {
    const r = document.querySelectorAll('#resTab1 .list-row')[1];
    if (!r.classList.contains('sel')) r.click();
  });
  const task1 = await page.evaluate(() => {
    window.__taskCapture = null;
    const orig = sessionStorage.setItem.bind(sessionStorage);
    sessionStorage.setItem = (k, v) => { if (k === 'xy.agent.task') window.__taskCapture = v; orig(k, v); };
    document.querySelector('#resTab1 [data-send-agent="res1"]').click();
    return window.__taskCapture;
  });
  await page.waitForFunction(() => location.pathname.endsWith('agent.html'), { timeout: 8000 });
  check(
    '讲题话术发送：任务含所选题目（长方形菜地）且非硬编码默认题',
    typeof task1 === 'string' && task1.includes('一块长方形菜地周长 48 米') && !task1.includes('解方程 x + 2x + 5 = 26'),
  );
  check(
    '讲题话术发送：已跳转 agent.html',
    page.url().includes('agent.html'),
    page.url(),
  );

  // ===== 4. 教学建议 tab：resAdvice 发送 =====
  await page.goto(`${BASE}/teacher.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.click('.nav-item[data-page="researcher"]');
  await page.waitForSelector('#page-researcher', { timeout: 8000 });
  await page.evaluate(() => switchResTab(2));
  await page.waitForFunction(() => document.getElementById('resTab2')?.style.display !== 'none', { timeout: 8000 });

  check(
    '教学建议：res2-empty 空态 + 发送按钮 + 参考样例卡存在',
    await page.evaluate(() => {
      const empty = document.getElementById('res2-empty');
      const btn = document.querySelector('#resTab2 [data-send-agent="resAdvice"]');
      const ref = document.querySelector('#resTab2 > .result-card');
      return !!empty && empty.style.display !== 'none'
        && !!btn && btn.textContent.includes('发送给智能体')
        && !!ref && ref.textContent.includes('参考样例');
    }),
  );

  const task2 = await page.evaluate(() => {
    window.__taskCapture = null;
    window.__res2Capture = null;
    const orig = sessionStorage.setItem.bind(sessionStorage);
    sessionStorage.setItem = (k, v) => {
      if (k === 'xy.agent.task') window.__taskCapture = v;
      if (k === 'xy.res2.sent') window.__res2Capture = v;
      orig(k, v);
    };
    document.querySelector('#resTab2 [data-send-agent="resAdvice"]').click();
    return { task: window.__taskCapture, sent: window.__res2Capture };
  });
  await page.waitForFunction(() => location.pathname.endsWith('agent.html'), { timeout: 8000 });
  check(
    '教学建议发送：任务含依据文本（adviceFocus）并跳转 agent.html',
    typeof task2.task === 'string' && task2.task.includes('教学建议') && task2.task.includes('移项变号') && task2.task.includes('用文档交付建议清单'),
    page.url(),
  );
  check(
    '教学建议发送：sessionStorage 写入 res2 标记（xy.res2.sent=1）',
    task2.sent === '1',
  );

  // ===== 5. res2 标记回显：返回 teacher.html → 结果卡显示（一次性） =====
  await page.goto(`${BASE}/teacher.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.getElementById('res2-result')?.style.display === 'block', { timeout: 15000 });
  check(
    '返回组卷页：res2-result 显示 + res2-empty 隐藏（标记被消费）',
    await page.evaluate(() => {
      const r = document.getElementById('res2-result');
      const e = document.getElementById('res2-empty');
      return r?.style.display === 'block' && e?.style.display === 'none'
        && r.textContent.includes('已发送至智能体') && !r.textContent.includes('详见下方对话');
    }),
  );
  check(
    '标记一次性：标记已移除',
    await page.evaluate(() => sessionStorage.getItem('xy.res2.sent') === null),
  );

  await page.goto(`${BASE}/teacher.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1200));
  check(
    '再次访问：res2-result 恢复隐藏（不常驻误导）',
    await page.evaluate(() => document.getElementById('res2-result')?.style.display === 'none'),
  );
} catch (e) {
  failed += 1;
  console.log('FAIL  脚本异常:', e.message);
} finally {
  await browser.close();
}

console.log(`\n结果：${failed === 0 ? '全部通过' : failed + ' 项失败'}`);
process.exit(failed === 0 ? 0 : 1);

/**
 * Task 6 验证：历史发言稿点击跳转（详情模态主路径 / 有 runId 跳会话）
 * 使用桩 API（与 verify-task4/5.mjs 同法），覆盖：
 *  1. 家长会材料页历史发言稿行可点击：caret 图标 + chip-blue 已保存 + sub 含「点击查看」
 *  2. 无 runId（种子数据主路径）→ 点击行弹 sdModal：主题/类型/时长/受众/正文
 *  3. sdModal 关闭按钮生效（close）
 *  4. 有 runId → 点击行跳转 agent.html?conv=
 * 运行：node scripts/verify-task6.mjs
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

const DOC_NO_RUN = {
  id: 11, teacherId: 1, docType: '家长会', theme: '期中家长会发言稿', duration: 15,
  audience: '家长', keyPoints: '班级学情总览\n进步学生表扬名单', content: '尊敬的各位家长：大家好！\n\n首先感谢你们在百忙之中抽出时间参加今天的家长会。',
  runId: null, createdAt: '2026-08-10T08:00:00.000Z',
};
const DOC_RUN = {
  id: 12, teacherId: 1, docType: '开学包', theme: '开学家长会发言稿', duration: 10,
  audience: '家长', keyPoints: null, content: '开学第一次家长会。',
  runId: 42, createdAt: '2026-08-12T08:00:00.000Z',
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
  let mode = 'no-run';
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/v1/auth/me')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(ME_STUB) });
    } else if (url.includes('/api/v1/speech-docs')) {
      const data = mode === 'no-run' ? [DOC_NO_RUN, { ...DOC_NO_RUN, id: 13, theme: '期末家长会发言稿' }] : [DOC_RUN];
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data }) });
    } else if (url.includes('/api/v1/')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: null }) });
    } else {
      req.continue();
    }
  });

  const openParentmeet = async () => {
    await page.goto(`${BASE}/teacher.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.click('.nav-item[data-page="parentmeet"]');
    await page.waitForSelector('#page-parentmeet', { timeout: 8000 });
    await page.waitForFunction(() => {
      const box = document.getElementById('pm-empty');
      return !!box && box.querySelectorAll('.list-row').length > 0;
    }, { timeout: 15000 });
  };

  // ===== 1+2. 无 runId：行可点击 → 详情模态 =====
  mode = 'no-run';
  await openParentmeet();

  check(
    '行渲染：list-row 可点击 + chip-blue 已保存 + caret + sub 含点击查看',
    await page.evaluate(() => {
      const box = document.getElementById('pm-empty');
      const rows = box?.querySelectorAll('.list-row') || [];
      const r0 = rows[0];
      return rows.length === 2
        && r0.querySelector('.chip-blue')?.textContent === '已保存'
        && !!r0.querySelector('.iconify[data-icon="ph:caret-right"]')
        && r0.querySelector('.t-cell-sub')?.textContent.includes('点击查看')
        && getComputedStyle(r0).cursor === 'pointer';
    }),
  );

  await page.evaluate(() => {
    document.querySelector('#pm-empty .list-row').click();
  });
  await page.waitForFunction(() => document.getElementById('sdModal')?.classList.contains('on'), { timeout: 8000 });
  check(
    '点击行 → sdModal 打开（无 runId 主路径）',
    await page.evaluate(() => document.getElementById('sdModal')?.classList.contains('on')),
  );
  check(
    '模态标题 = 发言稿主题',
    await page.evaluate(() => document.getElementById('sdModalTitle')?.textContent === '期中家长会发言稿'),
  );
  check(
    '模态正文：类型 chip + 时长 chip + 受众 chip + 正文全文',
    await page.evaluate(() => {
      const body = document.getElementById('sdModalBody');
      const chips = body?.querySelectorAll('.chip') || [];
      return !!body
        && chips.length === 3
        && chips[0].textContent === '家长会'
        && chips[1].textContent.includes('15') && chips[1].textContent.includes('分钟')
        && chips[2].textContent === '家长'
        && body.textContent.includes('尊敬的各位家长：大家好！');
    }),
  );

  // ===== 3. 关闭按钮 =====
  await page.evaluate(() => {
    const btn = document.querySelector('#sdModal .close');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  check(
    '关闭按钮（close）→ sdModal 关闭',
    await page.evaluate(() => !document.getElementById('sdModal')?.classList.contains('on')),
  );

  // 再次打开 → 模态底部「关闭」按钮
  await page.evaluate(() => document.querySelector('#pm-empty .list-row').click());
  await page.waitForFunction(() => document.getElementById('sdModal')?.classList.contains('on'), { timeout: 8000 });
  await page.evaluate(() => {
    const btn = document.getElementById('sdModalClose');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  check(
    '模态底部「关闭」按钮 → sdModal 关闭',
    await page.evaluate(() => !document.getElementById('sdModal')?.classList.contains('on')),
  );

  // ===== 4. 有 runId：点击行 → 跳 agent.html?conv= =====
  mode = 'run';
  await openParentmeet();
  await page.evaluate(() => {
    document.querySelector('#pm-empty .list-row').click();
  });
  await page.waitForFunction(() => location.pathname.endsWith('agent.html'), { timeout: 8000 });
  check(
    '有 runId → 跳转 agent.html?conv=42',
    page.url().includes('agent.html') && page.url().includes('conv=42'),
    page.url(),
  );
} catch (e) {
  failed += 1;
  console.log('FAIL  脚本异常:', e.message);
} finally {
  await browser.close();
}

console.log(`\n结果：${failed === 0 ? '全部通过' : failed + ' 项失败'}`);
process.exit(failed === 0 ? 0 : 1);
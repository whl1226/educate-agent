/**
 * Task 4 验证：历史教案/教案库可点击 —— 跳会话 / 详情模态 + 继续追问
 * 使用桩 API（与 verify-controls.mjs 同法），覆盖：
 *  1. 教案库列表渲染 + 数量 chip
 *  2. 无 runId 教案 → 详情模态（分节内容）+ 关闭按钮
 *  3. 继续追问 → sessionStorage TASK_CHANNEL + 跳 agent.html
 *  4. 有 runId 教案 → 跳 agent.html?conv=xxx
 * 运行：node scripts/verify-task4.mjs
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

const PLAN_WITH_RUN = {
  id: 7, subject: '数学', grade: '五年级', topic: '用字母表示数',
  createdAt: '2026-08-15T10:00:00.000Z', runId: 'run-abc-123', sourceRefs: [],
};
const PLAN_NO_RUN = {
  id: 5, subject: '语文', grade: '五年级', topic: '草船借箭',
  createdAt: '2026-08-14T09:30:00.000Z', runId: null, sourceRefs: [],
};

const PLAN_DETAIL_NO_RUN = {
  ...PLAN_NO_RUN,
  content: JSON.stringify({
    goals: ['理解借箭过程，把握人物形象', '体会诸葛亮神机妙算'],
    keyPoints: ['重点：借箭过程梳理', '难点：人物形象分析'],
    process: [
      { stage: '情境导入', minutes: 5, teacher: '播放《三国演义》片段，引出草船借箭', student: '观看并思考', intent: '激发兴趣' },
      { stage: '初读感知', minutes: 12, teacher: '指导分段朗读', student: '自读课文', intent: '整体感知' },
    ],
    board: '草船借箭\n借箭经过 → 人物形象',
    homework: [
      { layer: 'A', desc: '完成课后生字词抄写' },
      { layer: 'B', desc: '复述借箭经过' },
    ],
    reflection: '目标达成良好，参与度高',
  }),
  outline: '一、教材与学情分析\n二、教学目标\n三、教学过程',
};

let failed = 0;
let emptyMode = false;
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
    } else if (/\/api\/v1\/lesson-plans\/\d+$/.test(url)) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: PLAN_DETAIL_NO_RUN }) });
    } else if (url.includes('/api/v1/lesson-plans')) {
      const data = emptyMode ? [] : [PLAN_WITH_RUN, PLAN_NO_RUN];
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data }) });
    } else if (url.includes('/api/v1/')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: null }) });
    } else {
      req.continue();
    }
  });

  await page.goto(`${BASE}/teacher.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.click('.nav-item[data-page="lesson"]');

  await page.waitForSelector('#lesson-empty .list-row', { timeout: 15000 });
  console.log('教案库列表已渲染\n');

  check(
    '列表渲染 2 行（标题含 学科·年级《课题》与「点击查看」提示）',
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#lesson-empty .list-row');
      if (rows.length !== 2) return false;
      const t = rows[0].textContent + rows[1].textContent;
      return t.includes('用字母表示数') && t.includes('草船借箭') && t.includes('点击查看');
    }),
  );

  check(
    '数量 chip 更新为「2 份」',
    await page.evaluate(() => document.getElementById('lessonCountChip')?.textContent === '2 份'),
  );

  // ===== 无 runId 教案 → 详情模态 =====
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#lesson-empty .list-row');
    const noRun = Array.from(rows).find((r) => r.textContent.includes('草船借箭'));
    noRun.click();
  });
  await page.waitForSelector('#planModal.on', { timeout: 8000 });
  console.log('\n无 runId 教案：模态已打开');

  check(
    '模态标题 = 学科 · 年级《课题》',
    await page.evaluate(() => document.getElementById('planModalTitle')?.textContent?.includes('语文 · 五年级《草船借箭》')),
  );

  check(
    '正文分节渲染（教学目标/教学重难点/教学过程/板书设计/作业设计/教学反思）',
    await page.evaluate(() => {
      const t = document.getElementById('planModalBody')?.textContent || '';
      return ['教学目标', '教学重难点', '教学过程', '板书设计', '作业设计', '教学反思'].every((k) => t.includes(k))
        && t.includes('【情境导入·5分钟】') && t.includes('教师：播放《三国演义》片段')
        && t.includes('学生：观看并思考') && t.includes('意图：激发兴趣');
    }),
  );

  check(
    '教案大纲渲染',
    await page.evaluate(() => (document.getElementById('planModalBody')?.textContent || '').includes('一、教材与学情分析')),
  );

  check(
    '「继续追问智能体」按钮可见',
    await page.evaluate(() => document.getElementById('planModalAsk')?.style.display !== 'none'),
  );

  check(
    '关闭按钮（class=.close）可关闭模态',
    await page.evaluate(() => {
      const before = document.getElementById('planModal')?.classList.contains('on');
      document.querySelector('#planModal .close')?.click();
      return before === true && document.getElementById('planModal')?.classList.contains('on') === false;
    }),
  );

  // ===== 模态底部「关闭」按钮 =====
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#lesson-empty .list-row');
    const noRun = Array.from(rows).find((r) => r.textContent.includes('草船借箭'));
    noRun.click();
  });
  await page.waitForSelector('#planModal.on', { timeout: 8000 });
  check(
    '模态底部「关闭」按钮可关闭模态',
    await page.evaluate(() => {
      const before = document.getElementById('planModal')?.classList.contains('on');
      document.getElementById('planModalClose')?.click();
      return before === true && document.getElementById('planModal')?.classList.contains('on') === false;
    }),
  );

  // ===== 继续追问 → sessionStorage + 跳 agent.html =====
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#lesson-empty .list-row');
    const noRun = Array.from(rows).find((r) => r.textContent.includes('草船借箭'));
    noRun.click();
  });
  await page.waitForSelector('#planModal.on', { timeout: 8000 });
  await page.evaluate(() => document.getElementById('planModalAsk')?.click());
  await page.waitForFunction(() => location.pathname.endsWith('agent.html'), { timeout: 8000 });
  check(
    '继续追问：sessionStorage TASK_CHANNEL 已写入',
    await page.evaluate(() => {
      const v = sessionStorage.getItem('xy.agent.task') || '';
      return v.includes('草船借箭') && v.includes('继续优化');
    }),
  );
  check(
    '继续追问：已跳转 agent.html（无 conv 参数）',
    page.url().includes('agent.html') && !page.url().includes('conv='),
    page.url(),
  );

  // ===== 有 runId 教案 → 跳会话 =====
  await page.goto(`${BASE}/teacher.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.click('.nav-item[data-page="lesson"]');
  await page.waitForSelector('#lesson-empty .list-row', { timeout: 15000 });
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#lesson-empty .list-row');
    const withRun = Array.from(rows).find((r) => r.textContent.includes('用字母表示数'));
    withRun.click();
  });
  await page.waitForFunction(() => location.href.includes('agent.html?conv='), { timeout: 8000 });
  check(
    '有 runId 教案：跳转 agent.html?conv=run-abc-123',
    page.url().includes('agent.html?conv=run-abc-123'),
    page.url(),
  );

  // ===== 空数据场景 =====
  emptyMode = true;
  await page.goto(`${BASE}/teacher.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.click('.nav-item[data-page="lesson"]');
  await new Promise((r) => setTimeout(r, 1500));
  check(
    '空列表：空态提示保留 + chip 仍为「0 份」',
    await page.evaluate(() => {
      const box = document.getElementById('lesson-empty');
      const chip = document.getElementById('lessonCountChip');
      return !!box && box.querySelectorAll('.list-row').length === 0
        && (box.textContent || '').includes('填写左侧备课信息')
        && chip?.textContent === '0 份';
    }),
  );
} catch (e) {
  failed += 1;
  console.log('FAIL  脚本异常:', e.message);
} finally {
  await browser.close();
}

console.log(`\n结果：${failed === 0 ? '全部通过' : failed + ' 项失败'}`);
process.exit(failed === 0 ? 0 : 1);

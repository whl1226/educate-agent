/**
 * 管理端 AI 治理助手接入 Agent 验证：
 * 桩 /api/v1/agent/chat 返回 SSE 帧（thinking → tool → text_delta → done），覆盖：
 *  1. 侧边栏「AI 全域盘点」按钮 → 弹窗出现「AI 治理助手 · 全域盘点」
 *  2. 轨迹区出现「区域学情概览」「预警列表」工具行
 *  3. 结论区出现最终交付文本（stripMd 纯文本）
 *  4. 按钮 busy 态恢复（不再显示「处理中…」）
 *  5. 每个 data-ai-task 按钮点击均能打开弹窗
 *  6. 关闭按钮 → 弹窗移除
 * 运行：node scripts/verify-admin-ai.mjs
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const ME_STUB = {
  code: 0,
  data: {
    id: 1, username: 'verify-admin', displayName: '验证管理员', role: 'admin',
    avatar: null, phoneMasked: '138****0000', studentNo: null, permissions: ['admin'],
  },
};

const SSE_BODY = [
  'event: thinking',
  'data: {"type":"thinking","text":"正在读取区域学情概览与预警列表…"}',
  '',
  'event: tool_start',
  'data: {"type":"tool_start","name":"get_region_overview","args":{}}',
  '',
  'event: tool_end',
  'data: {"type":"tool_end","name":"get_region_overview","result":{"stats":{"schools":18,"teachers":320,"students":6842}},"durationMs":320}',
  '',
  'event: tool_start',
  'data: {"type":"tool_start","name":"list_alerts","args":{"type":"dropout","limit":10}}',
  '',
  'event: tool_end',
  'data: {"type":"tool_end","name":"list_alerts","result":[{"id":1,"alertType":"dropout","severity":"high","title":"辍学风险"}],"durationMs":180}',
  '',
  'event: text_delta',
  'data: {"type":"text_delta","delta":"1. 双桥村小学辍学风险最高，建议本周内完成家访。"}',
  '',
  'event: done',
  'data: {"type":"done","finalText":"1. 双桥村小学辍学风险最高，建议本周内完成家访并回传记录。","refs":[],"intent":"admin"}',
  '',
  '',
].join('\n');

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

  const agentChatHeaders = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/v1/auth/me')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(ME_STUB) });
    } else if (url.includes('/api/v1/agent/chat')) {
      agentChatHeaders.push(req.headers());
      req.respond({ status: 200, contentType: 'text/event-stream; charset=utf-8', body: SSE_BODY });
    } else if (url.includes('/api/v1/')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: [] }) });
    } else {
      req.continue();
    }
  });

  await page.goto(BASE + '/admin.html', { waitUntil: 'networkidle0' });

  /* ========== 1. 侧边栏 AI 全域盘点按钮存在 ========== */
  const hasOverviewBtn = await page.evaluate(() => !!document.querySelector('[data-ai-task="overview"]'));
  check('侧边栏存在 data-ai-task="overview" 按钮', hasOverviewBtn);

  /* ========== 2. 点击 → 弹窗出现 + SSE 渲染 ========== */
  await page.evaluate(() => document.querySelector('[data-ai-task="overview"]').click());
  await new Promise((r) => setTimeout(r, 600));

  const modalState = await page.evaluate(() => {
    const card = document.querySelector('[data-ai-answer]')?.parentElement;
    if (!card) return { opened: false };
    const title = card.querySelector('div[style*="font-weight:900"]')?.textContent || '';
    const answer = document.querySelector('[data-ai-answer]')?.textContent || '';
    const trace = Array.from(document.querySelectorAll('[data-ai-trace-body] > div')).map((d) => d.textContent);
    const status = document.querySelector('#aiStatus')?.textContent || '';
    return { opened: true, title, answer, trace, status };
  });

  check('AI 治理弹窗已打开', modalState.opened);
  check('弹窗标题为「AI 治理助手 · 全域盘点」', modalState.title.includes('AI 治理助手') && modalState.title.includes('全域盘点'), modalState.title);
  check('轨迹区含「区域学情概览」', modalState.trace.some((t) => t.includes('区域学情概览')), modalState.trace.join('|'));
  check('轨迹区含「预警列表」', modalState.trace.some((t) => t.includes('预警列表')), modalState.trace.join('|'));
  check('结论区为纯文本交付（无 md 符号）', modalState.answer.includes('双桥村小学') && !modalState.answer.includes('**'), modalState.answer.slice(0, 60));
  check('状态为「完成」', modalState.status === '完成', `status=${modalState.status}, answer=${modalState.answer.slice(0, 40)}`);

  /* ========== 3. 按钮 busy 恢复 ========== */
  const btnRestored = await page.evaluate(() => {
    const btn = document.querySelector('[data-ai-task="overview"]');
    return !btn.classList.contains('disabled') && !btn.textContent.includes('处理中');
  });
  check('按钮 busy 态已恢复', btnRestored);

  /* ========== 4. 关闭按钮 → 弹窗移除 ========== */
  await page.evaluate(() => {
    const close = document.querySelector('[data-ai-close]');
    if (close) close.click();
  });
  await new Promise((r) => setTimeout(r, 150));
  const closed = await page.evaluate(() => !document.querySelector('[data-ai-answer]'));
  check('点击「知道了」弹窗移除', closed);

  /* ========== 5. 全部 data-ai-task 按钮可打开弹窗 ========== */
  const keys = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-ai-task]')).map((b) => b.getAttribute('data-ai-task')),
  );
  check('存在 6 个 AI 入口', keys.length === 6, keys.join(','));

  for (const key of keys) {
    const opened = await page.evaluate(async (k) => {
      const btn = document.querySelector(`[data-ai-task="${k}"]`);
      btn.click();
      await new Promise((r) => setTimeout(r, 400));
      const ok = !!document.querySelector('[data-ai-answer]');
      const close = document.querySelector('[data-ai-close]');
      if (close) close.click();
      await new Promise((r) => setTimeout(r, 100));
      return ok;
    }, key);
    check(`入口 ${key} 可打开弹窗`, opened);
  }

  /* ========== 6. 预览模式：请求携带 X-Preview: 1 ========== */
  agentChatHeaders.length = 0;
  await page.goto(BASE + '/admin.html?preview=1', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.querySelector('[data-ai-task="region"]').click());
  await new Promise((r) => setTimeout(r, 500));
  const previewHeader = agentChatHeaders.length
    ? (agentChatHeaders[0]['x-preview'] ?? agentChatHeaders[0]['X-Preview'] ?? '')
    : '';
  check('预览模式 agent 请求携带 X-Preview: 1', previewHeader === '1', String(previewHeader));

  /* ========== 7. 智能体工作台入口：点击跳转 agent.html ========== */
  const hasAgentEntry = await page.evaluate(() => !!document.querySelector('[data-ai-agent]'));
  check('侧边栏存在「智能体工作台」入口', hasAgentEntry);
  if (hasAgentEntry) {
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('[data-ai-agent]');
      btn.click();
      return true;
    });
    check('点击工作台入口触发跳转', clicked);
    await new Promise((r) => setTimeout(r, 1000));
    const url = page.url();
    check('跳转至 agent.html（预览模式）', url.includes('agent.html?preview=1'), url.replace(BASE, ''));
    // agent.html 以 admin 角色渲染 → 欢迎区显示管理示例
    const adminWelcome = await page.evaluate(() => {
      const list = document.getElementById('hintList');
      const items = list ? Array.from(list.querySelectorAll('.hint-item')).map((el) => el.textContent.trim()) : [];
      return items;
    });
    check('工作台欢迎区显示管理示例', adminWelcome.some((t) => t.includes('盘点当前最需处置')), adminWelcome.join(' | ').slice(0, 60));
  }

  /* ========== 8. 教师角色：agent.html 欢迎区保持原有示例（回归） ========== */
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1440, height: 900 });
  await page2.setRequestInterception(true);
  page2.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/v1/auth/me')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...ME_STUB, data: { ...ME_STUB.data, role: 'teacher' } }) });
    } else if (url.includes('/api/v1/')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: [] }) });
    } else {
      req.continue();
    }
  });
  await page2.goto(BASE + '/agent.html', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 500));
  const teacherWelcome = await page2.evaluate(() => {
    const list = document.getElementById('hintList');
    const items = list ? Array.from(list.querySelectorAll('.hint-item')).map((el) => el.textContent.trim()) : [];
    return items;
  });
  check('教师角色工作台保持原有示例', teacherWelcome.some((t) => t.includes('帮我诊断学习薄弱点')), teacherWelcome.join(' | ').slice(0, 60));

  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
}
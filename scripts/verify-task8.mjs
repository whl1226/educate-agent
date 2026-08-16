/**
 * Task 8 验证：留守儿童场景联动 + 职称材料真实上传
 * 使用桩 API（与 verify-task7.mjs 同法），覆盖：
 *  1. 留守儿童页：默认只显示 s0 卡 + 知识库卡（kbCard）；切 5 个 pill → 对应卡片联动、其余隐藏、kbCard 常显
 *  2. 复制话术按钮 → 剪贴板写入 stub + toast「话术已复制」
 *  3. 职称页：file chooser 选择 3 个文件 → titleQueue 出现队列行（上传成功标记）
 *  4. 预分类：title-empty 出现「预分类结果」与四类桶（关键词命中）
 *  5. sessionStorage xy.title.files 含文件名；点击「交给智能体」→ xy.agent.task 含上传文件名
 * 运行：node scripts/verify-task8.mjs
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

const KB_STUB = {
  code: 0,
  data: [
    { id: 1, title: '留守儿童沟通原则', category: '家校沟通', content: '先报喜再谈事，避免开场追问成绩', scene: '通用' },
    { id: 2, title: '祖辈监护人沟通要点', category: '家校沟通', content: '一句话指令，避免专业术语', scene: '祖辈沟通' },
  ],
};

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
  if (!ok) failed += 1;
}

const tmpFiles = [
  join(process.cwd(), '县级优质课二等奖证书.pdf'),
  join(process.cwd(), '信息技术2.0培训结业.pdf'),
  join(process.cwd(), '近三年教案本.docx'),
];
tmpFiles.forEach((p) => writeFileSync(p, 'task8-verify'));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => {
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.resolve() },
      });
    } catch (e) { /* ignore */ }
  });
  await page.setRequestInterception(true);

  let uploadCount = 0;
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('/api/v1/auth/me')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(ME_STUB) });
    } else if (url.includes('/api/v1/knowledge-base')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(KB_STUB) });
    } else if (url.includes('/api/v1/files/upload') && method === 'POST') {
      uploadCount += 1;
      req.respond({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: { id: uploadCount, url: '/uploads/' + uploadCount, ext: 'pdf', size: 1024, sha256: 'x'.repeat(64) } }),
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

  /* ========== 1. 留守儿童场景联动 ========== */
  await page.evaluate(() => window.showPage && window.showPage('leftbehind'));
  await new Promise((r) => setTimeout(r, 300));

  const sceneState = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#page-leftbehind .grid .card'));
    const kb = document.getElementById('kbCard');
    return {
      count: cards.length,
      scenes: cards.map((c) => c.dataset.scene || ''),
      display: cards.map((c) => getComputedStyle(c).display),
      kbDisplay: kb ? getComputedStyle(kb).display : 'absent',
      pillOn: document.querySelector('#page-leftbehind .radio-pill span.on')?.dataset.scene || '',
    };
  });
  check('5 张话术卡均带 data-scene', sceneState.count === 5 && sceneState.scenes.join(',') === 's0,s1,s2,s3,s4', sceneState.scenes.join(','));
  check('知识库卡 kbCard 渲染', sceneState.kbDisplay !== 'absent', sceneState.kbDisplay);
  check('初始仅 s0 卡显示', sceneState.display[0] !== 'none' && sceneState.display.slice(1).every((d) => d === 'none'), sceneState.display.join('/'));
  check('初始 pill 为视频通话开场(s0)', sceneState.pillOn === 's0', sceneState.pillOn);
  check('初始 kbCard 常显', sceneState.kbDisplay !== 'none', sceneState.kbDisplay);

  for (const [idx, expect] of [[1, 's1'], [2, 's2'], [3, 's3'], [4, 's4'], [0, 's0']]) {
    const state = await page.evaluate((i) => {
      const pill = document.querySelectorAll('#page-leftbehind .radio-pill span')[i];
      pill.click();
      const cards = Array.from(document.querySelectorAll('#page-leftbehind .grid .card'));
      const kb = document.getElementById('kbCard');
      return {
        pillOn: pill.classList.contains('on') && document.querySelector('#page-leftbehind .radio-pill span.on') === pill,
        shown: cards.map((c) => (getComputedStyle(c).display !== 'none' ? c.dataset.scene : null)).filter(Boolean),
        kbOn: kb ? getComputedStyle(kb).display !== 'none' : false,
      };
    }, idx);
    check(`切 pill 第${idx + 1}个 → 联动显示 ${expect}`, state.shown.length === 1 && state.shown[0] === expect && state.pillOn, state.shown.join(','));
    check(`切场景后 kbCard 仍常显(第${idx + 1}个)`, state.kbOn);
  }

  /* ========== 2. 复制话术 ========== */
  const copyResult = await page.evaluate(async () => {
    const btn = document.querySelector('#page-leftbehind .grid .card[data-scene="s0"] .btn');
    btn.click();
    await new Promise((r) => setTimeout(r, 50));
    return document.getElementById('toastText').textContent;
  });
  check('复制话术 → toast 提示', copyResult === '话术已复制', copyResult);

  /* ========== 3. 职称材料真实上传 ========== */
  await page.evaluate(() => window.showPage && window.showPage('title'));
  await new Promise((r) => setTimeout(r, 200));

  const chooserPromise = page.waitForFileChooser();
  await page.evaluate(() => document.getElementById('titleDrop').click());
  const chooser = await chooserPromise;
  await chooser.accept(tmpFiles);
  await new Promise((r) => setTimeout(r, 800));

  const queueState = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#titleQueue .list-row'));
    return {
      count: rows.length,
      subs: rows.map((r) => r.querySelector('.t-cell-sub')?.textContent || ''),
      ico: rows.map((r) => r.querySelector('.row-icon')?.innerHTML.includes('check-circle') || false),
    };
  });
  check('上传队列出现 3 行', queueState.count === 3, String(queueState.count));
  check('队列行全部上传成功标记', queueState.subs.every((s) => s.includes('已上传')) && queueState.ico.every(Boolean), queueState.subs.join(' | '));
  check('上传请求发出 3 次', uploadCount === 3, String(uploadCount));

  const classifyState = await page.evaluate(() => {
    const box = document.getElementById('title-empty');
    return {
      hasResult: box.textContent.includes('预分类结果'),
      buckets: Array.from(box.querySelectorAll('.list-row .t-cell-main')).map((e) => e.textContent.trim()),
      sub: box.textContent,
    };
  });
  check('预分类结果出现（title-empty）', classifyState.hasResult, classifyState.sub.slice(0, 60));
  check('预分类含三个命中桶', classifyState.buckets.length === 3, classifyState.buckets.join(' | '));
  check('获奖证书桶命中优质课关键词', classifyState.buckets.some((b) => b.includes('获奖证书')), classifyState.buckets.join('|'));

  /* ========== 2b. execCommand 降级路径（无 clipboard） ========== */
  const fb = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const btn = document.querySelector('#page-leftbehind .grid .card[data-scene="s0"] .btn');
    btn.click();
    await new Promise((r) => setTimeout(r, 50));
    return document.getElementById('toastText').textContent;
  });
  check('copyTalk 降级路径（execCommand）无异常', fb === '话术已复制' || fb === '复制失败，请手动选择', fb);

  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('xy.title.files') || '[]'));
  check('sessionStorage xy.title.files 含 3 个文件名', stored.length === 3 && stored[0].name === '县级优质课二等奖证书.pdf', stored.map((f) => f.name).join(','));

  /* ========== 4. 拖拽 hover 态 ========== */
  const dragOk = await page.evaluate(() => {
    const zone = document.getElementById('titleDrop');
    zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
    const on = zone.classList.contains('drag');
    zone.dispatchEvent(new DragEvent('dragleave', { bubbles: true }));
    return on && !zone.classList.contains('drag');
  });
  check('拖拽 hover .drag 态切换', dragOk);

  /* ========== 5. 发送智能体带文件名 ========== */
  await page.evaluate(() => {
    const btn = document.querySelector('#page-title [data-send-agent="title"]');
    btn.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  const task = await page.evaluate(() => sessionStorage.getItem('xy.agent.task') || '');
  check('智能体任务包含上传文件名', task.includes('县级优质课二等奖证书.pdf') && task.includes('近三年教案本.docx'), task.split('\n')[1] || '');

  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
}
/**
 * Task 12 验证：教学资源库——筛选 / 上传 / 授权 / 微课视频
 * 使用桩 API（与 verify-task11.mjs 同法），覆盖：
 *  1. 资源库头部筛选条齐全（resSearch / licenseFilter / resAddBtn / resModal）
 *  2. license 筛选联动：点「CC BY」→ GET /resources?license=CC BY → 仅渲染对应授权资源
 *  3. 搜索联动：resSearch 输入（300ms debounce）→ GET /resources?q=…
 *  4. 上传入库：打开模态 → 填标题/类型/授权 → 选 .mp4 → POST /files/upload?category=video + POST /resources(fileId) → 列表出现新卡片（含授权 chip）
 *  5. 文档上传走 document 分类
 * 运行：node scripts/verify-task12.mjs
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

const BASE_RESOURCES = [
  { id: 1, teacherId: 1, type: '教案', title: '用字母表示数·教学设计', description: '分层练习', license: '自建', fileId: null, downloadCount: 0, usageCount: 0, createdAt: '2026-08-12T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z', deletedAt: null },
  { id: 2, teacherId: 9, type: '课件', title: '五年级下册全册课件包', description: '县教研室共享', license: '公开领域', fileId: null, downloadCount: 0, usageCount: 0, createdAt: '2026-07-30T00:00:00.000Z', updatedAt: '2026-07-30T00:00:00.000Z', deletedAt: null },
  { id: 3, teacherId: 9, type: '习题', title: '简易方程·分层题库', description: 'A/B/C 120 题', license: 'CC BY', fileId: null, downloadCount: 0, usageCount: 0, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', deletedAt: null },
  { id: 4, teacherId: 9, type: '视频', title: '微课：分数的基本性质', description: '8 分钟版', license: '共享', fileId: null, downloadCount: 0, usageCount: 0, createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z', deletedAt: null },
];

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
  if (!ok) failed += 1;
}

const tmpMp4 = join(process.cwd(), 'verify-task12-微课.mp4');
const tmpPdf = join(process.cwd(), 'verify-task12-教案.pdf');
writeFileSync(tmpMp4, 'task12-verify-mp4');
writeFileSync(tmpPdf, '%PDF-1.4 task12-verify-pdf');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setRequestInterception(true);

  let uploaded = [];
  const resGetLog = [];
  let uploadCat = '';
  let uploadCount = 0;
  let resPostBody = null;

  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    if (url.includes('/api/v1/auth/me')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(ME_STUB) });
    } else if (url.includes('/api/v1/resources') && method === 'GET') {
      resGetLog.push(url);
      const sp = new URL(url).searchParams;
      const lic = sp.get('license');
      const q = sp.get('q');
      let list = [...BASE_RESOURCES, ...uploaded];
      if (lic) list = list.filter((r) => r.license === lic);
      if (q) list = list.filter((r) => (r.title || '').includes(q) || (r.description || '').includes(q));
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: list }) });
    } else if (url.includes('/api/v1/files/upload') && method === 'POST') {
      uploadCount += 1;
      uploadCat = new URL(url).searchParams.get('category') || '';
      req.respond({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: { id: 55 + uploadCount, url: '/uploads/v.mp4', ext: uploadCat === 'video' ? 'mp4' : 'pdf', size: 1024, sha256: 'abc123' } }),
      });
    } else if (url.includes('/api/v1/resources') && method === 'POST') {
      resPostBody = JSON.parse(req.postData() || '{}');
      uploaded.push({
        id: 66 + uploadCount, teacherId: 1, type: resPostBody.type, title: resPostBody.title,
        description: resPostBody.description || '', license: resPostBody.license, fileId: resPostBody.fileId,
        downloadCount: 0, usageCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null,
      });
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: { id: 66 + uploadCount } }) });
    } else if (url.endsWith('/agent.html') || url.includes('/agent.html')) {
      req.respond({ status: 200, contentType: 'text/html', body: '<html><body>agent-stub</body></html>' });
    } else if (url.includes('/api/v1/')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: [] }) });
    } else {
      req.continue();
    }
  });

  await page.goto(BASE + '/teacher.html', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 400));

  /* 切换到教学资源库页（默认在 dashboard，library 页为隐藏状态） */
  await page.evaluate(() => {
    if (window.showPage) window.showPage('library');
  });
  await new Promise((r) => setTimeout(r, 400));

  /* ========== 1. 筛选条 + 模态存在 ========== */
  const ui = await page.evaluate(() => ({
    hasSearch: !!document.getElementById('resSearch'),
    hasAdd: !!document.getElementById('resAddBtn'),
    pillSpans: Array.from(document.querySelectorAll('#page-library .radio-pill[data-field="licenseFilter"] span')).map((s) => s.textContent.trim()),
    hasModal: !!document.getElementById('resModal'),
    modalFields: ['resTitle', 'resType', 'resLicense', 'resFile', 'resSaveBtn'].every((id) => !!document.getElementById(id)),
    accept: (document.getElementById('resFile') || {}).accept || '',
    cardCount: document.querySelectorAll('#resGrid .res-card').length,
    firstCardHasChip: !!document.querySelector('#resGrid .res-card .tag'),
  }));
  check('筛选条三件套齐全（搜索/上传按钮/license pill）', ui.hasSearch && ui.hasAdd && ui.pillSpans.length === 5);
  check('license pill 为全部/自建/共享/公开领域/CC BY', JSON.stringify(ui.pillSpans) === JSON.stringify(['全部', '自建', '共享', '公开领域', 'CC BY']), ui.pillSpans.join('/'));
  check('上传模态及字段齐全', ui.hasModal && ui.modalFields);
  check('resFile accept 覆盖视频与文档', (ui.accept || '').includes('.mp4') && (ui.accept || '').includes('.pdf'), ui.accept);
  check('初始渲染 4 张资源卡', ui.cardCount === 4, String(ui.cardCount));
  check('资源卡含授权 chip', ui.firstCardHasChip);

  /* ========== 2. license 筛选联动 ========== */
  const before = resGetLog.length;
  await page.evaluate(() => {
    const spans = document.querySelectorAll('#page-library .radio-pill[data-field="licenseFilter"] span');
    spans.forEach((s) => { if (s.textContent.trim() === 'CC BY') s.click(); });
  });
  await new Promise((r) => setTimeout(r, 500));
  const licReq = new URL(resGetLog[resGetLog.length - 1]);
  const licCards = await page.evaluate(() => Array.from(document.querySelectorAll('#resGrid .res-title')).map((e) => e.textContent.trim()));
  check('点「CC BY」触发 license 参数请求', licReq.searchParams.get('license') === 'CC BY', licReq.search);
  check('筛选后仅渲染 CC BY 资源', licCards.length === 1 && licCards[0].includes('分层题库'), licCards.join('|'));

  /* ========== 3. 搜索 debounce 联动 ========== */
  await page.evaluate(() => {
    const spans = document.querySelectorAll('#page-library .radio-pill[data-field="licenseFilter"] span');
    spans.forEach((s) => { if (s.textContent.trim() === '全部') s.click(); });
  });
  await page.type('#resSearch', '微课');
  await new Promise((r) => setTimeout(r, 600));
  const qReq = new URL(resGetLog[resGetLog.length - 1]);
  check('搜索输入（debounce 300ms）→ q 参数', qReq.searchParams.get('q') === '微课', qReq.search);

  /* 清空搜索词，避免后续上传/列表断言受 q 过滤影响 */
  await page.$eval('#resSearch', (el) => { el.value = ''; });
  await new Promise((r) => setTimeout(r, 600));

  /* ========== 4. 微课视频上传入库 ========== */
  await page.click('#resAddBtn');
  await new Promise((r) => setTimeout(r, 200));
  const modalOpen = await page.evaluate(() => document.getElementById('resModal').classList.contains('on'));
  check('点「上传资源」打开模态', modalOpen);

  await page.type('#resTitle', '五年级《小数乘法》微课视频');
  await page.select('#resType', '微课');
  await page.select('#resLicense', '共享');
  const chooserPromise = page.waitForFileChooser();
  await page.evaluate(() => document.getElementById('resFile').click());
  const chooser = await chooserPromise;
  await chooser.accept([tmpMp4]);
  await new Promise((r) => setTimeout(r, 200));
  await page.click('#resSaveBtn');
  await new Promise((r) => setTimeout(r, 900));

  const videoState = await page.evaluate(() => ({
    toast: document.getElementById('toastText')?.textContent || '',
    modalOn: document.getElementById('resModal').classList.contains('on'),
    cards: Array.from(document.querySelectorAll('#resGrid .res-card')).map((c) => ({
      title: c.querySelector('.res-title')?.textContent?.trim() || '',
      lic: c.querySelector('.res-meta .tag')?.textContent?.trim() || '',
      type: c.querySelector('.type')?.textContent?.trim() || '',
    })),
  }));
  check('视频走 category=video', uploadCat === 'video', uploadCat);
  check('POST /resources 携带 fileId', resPostBody?.fileId === 56, JSON.stringify(resPostBody));
  check('POST /resources 归属字段正确', resPostBody?.title === '五年级《小数乘法》微课视频' && resPostBody?.type === '微课' && resPostBody?.license === '共享', JSON.stringify(resPostBody));
  check('上传成功 toast', videoState.toast.includes('资源已上传'), videoState.toast);
  check('上传后模态关闭', !videoState.modalOn);
  check('列表出现新资源卡', videoState.cards.length === 5, String(videoState.cards.length));
  const newCard = videoState.cards.find((c) => c.title.includes('小数乘法'));
  check('新卡片显示微课类型 + 共享授权 chip', !!newCard && newCard.type === '微课' && newCard.lic === '共享', JSON.stringify(newCard));

  /* ========== 5. 文档上传走 document 分类 ========== */
  const postBefore = uploadCount;
  await page.click('#resAddBtn');
  await new Promise((r) => setTimeout(r, 150));
  await page.type('#resTitle', '五年级语文单元测试卷');
  await page.select('#resType', '习题');
  await page.select('#resLicense', '公开领域');
  const pdfChooser = page.waitForFileChooser();
  await page.evaluate(() => document.getElementById('resFile').click());
  const chooser2 = await pdfChooser;
  await chooser2.accept([tmpPdf]);
  await new Promise((r) => setTimeout(r, 150));
  await page.click('#resSaveBtn');
  await new Promise((r) => setTimeout(r, 900));
  check('文档走 category=document', uploadCat === 'document' && uploadCount === postBefore + 1, uploadCat);

  console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await browser.close();
}
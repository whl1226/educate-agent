/**
 * Task 7 验证：开学材料包 预览/编辑 真实可用（btModal + PATCH 持久化）
 * 使用桩 API（与 verify-task6.mjs 同法），覆盖：
 *  1. 开学材料包页 btGrid 渲染模板卡（名称/预览/license/类型 chip/预览编辑按钮）
 *  2. 点击「预览/编辑」→ btModal 打开：标题=模板名、textarea 含模板全文
 *  3. 修改内容 → 点击保存修改 → PATCH /back-to-school/package/:id 发出（method/body 校验）→ toast 提示
 *  4. 保存后卡片重渲染（preview 更新）；重开模态 → textarea 为保存后的新内容（持久化链路）
 *  5. 关闭按钮（close / btModalClose）生效
 * 运行：node scripts/verify-task7.mjs
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

const TPL_1 = {
  id: 101, name: '五年级语文·精读课文教案模板', type: 'lesson_plan', license: '自建',
  content: '一、教学目标（知识与能力/过程与方法/情感态度与价值观）\n二、教学重难点\n三、教学过程（导入→初读→精读→拓展→小结）',
};
const TPL_2 = {
  id: 102, name: '期中家长会流程模板', type: 'parent_meeting', license: '自建',
  content: '一、开场致辞\n二、班级整体情况汇报',
};

let patchedBody = null;
let patchedId = null;
let patchedCount = 0;

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
    const method = req.method();
    if (url.includes('/api/v1/auth/me')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(ME_STUB) });
    } else if (url.includes('/api/v1/back-to-school/package') && method === 'PATCH') {
      patchedCount += 1;
      const body = JSON.parse(req.postData() || '{}');
      patchedBody = body;
      const m = url.match(/package\/(\d+)/);
      patchedId = m ? Number(m[1]) : null;
      TPL_1.content = body.content;
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: { ok: true } }) });
    } else if (url.includes('/api/v1/back-to-school/package')) {
      const items = [
        { ...TPL_1, preview: TPL_1.content.slice(0, 120) },
        { ...TPL_2, preview: TPL_2.content.slice(0, 120) },
      ];
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: { items } }) });
    } else if (url.includes('/api/v1/')) {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: null }) });
    } else {
      req.continue();
    }
  });

  const openBackToSchool = async () => {
    await page.goto(`${BASE}/teacher.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.click('.nav-item[data-page="backtoschool"]');
    await page.waitForSelector('#page-backtoschool', { timeout: 8000 });
    await page.waitForFunction(() => {
      const grid = document.getElementById('btGrid');
      return !!grid && grid.querySelectorAll('[data-bt-open]').length > 0;
    }, { timeout: 15000 });
  };

  // ===== 1. 卡片渲染 =====
  await openBackToSchool();
  check(
    'btGrid 渲染 2 张模板卡，各含 预览/编辑 按钮',
    await page.evaluate(() => {
      const grid = document.getElementById('btGrid');
      const cards = grid?.querySelectorAll('.card') || [];
      return cards.length === 2 && grid.querySelectorAll('[data-bt-open]').length === 2;
    }),
  );
  check(
    '卡片含名称/预览/license chip/类型 chip',
    await page.evaluate(() => {
      const grid = document.getElementById('btGrid');
      const t = grid?.textContent || '';
      return t.includes('五年级语文·精读课文教案模板')
        && t.includes('一、教学目标')
        && t.includes('自建')
        && t.includes('教案')
        && t.includes('家长会');
    }),
  );

  // ===== 2. 打开模态 =====
  await page.evaluate(() => {
    document.querySelector('#btGrid [data-bt-open]').click();
  });
  await page.waitForFunction(() => document.getElementById('btModal')?.classList.contains('on'), { timeout: 8000 });
  check(
    '点击预览/编辑 → btModal 打开',
    await page.evaluate(() => document.getElementById('btModal')?.classList.contains('on')),
  );
  check(
    '模态标题 = 模板名',
    await page.evaluate(() => document.getElementById('btModalTitle')?.textContent === '五年级语文·精读课文教案模板'),
  );
  check(
    'textarea 含模板全文（可编辑）',
    await page.evaluate(() => {
      const area = document.getElementById('btEditArea');
      return !!area && area.value.includes('一、教学目标') && area.value.includes('拓展→小结');
    }),
  );

  // ===== 3. 修改 + 保存 =====
  const NEW_CONTENT = '一、教学目标（已修订）\n二、教学重难点（新增：语文要素）\n三、教学过程';
  await page.evaluate((content) => {
    const area = document.getElementById('btEditArea');
    area.value = content;
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }, NEW_CONTENT);
  await page.evaluate(() => {
    document.getElementById('btSaveBtn')?.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  check(
    '保存 → PATCH 发出（id=101, content=新内容）',
    patchedCount === 1 && patchedId === 101 && patchedBody && patchedBody.content === NEW_CONTENT,
    `count=${patchedCount} id=${patchedId}`,
  );
  check(
    '保存成功 → toast「修改已保存」',
    await page.evaluate(() => document.getElementById('toastText')?.textContent?.includes('修改已保存')),
  );
  check(
    '保存后卡片重渲染（preview 更新为新内容开头）',
    await page.evaluate(() => {
      const grid = document.getElementById('btGrid');
      return (grid?.textContent || '').includes('一、教学目标（已修订）');
    }),
  );

  // ===== 4. 重开模态 → 内容持久化 =====
  await page.evaluate(() => {
    document.querySelector('#btGrid [data-bt-open]').click();
  });
  await page.waitForFunction(() => document.getElementById('btModal')?.classList.contains('on'), { timeout: 8000 });
  check(
    '重开模态 → textarea 为保存后的新内容（PATCH 持久化链路）',
    await page.evaluate(() => {
      const area = document.getElementById('btEditArea');
      return !!area && area.value.includes('已修订');
    }),
  );

  // ===== 5. 关闭按钮 =====
  await page.evaluate(() => {
    document.querySelector('#btModal .close')?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  check(
    '关闭按钮（close）→ btModal 关闭',
    await page.evaluate(() => !document.getElementById('btModal')?.classList.contains('on')),
  );
  await page.evaluate(() => {
    document.querySelector('#btGrid [data-bt-open]').click();
  });
  await page.waitForFunction(() => document.getElementById('btModal')?.classList.contains('on'), { timeout: 8000 });
  await page.evaluate(() => {
    document.getElementById('btModalClose')?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  check(
    '模态底部「关闭」按钮 → btModal 关闭',
    await page.evaluate(() => !document.getElementById('btModal')?.classList.contains('on')),
  );
} catch (e) {
  failed += 1;
  console.log('FAIL  脚本异常:', e.message);
} finally {
  await browser.close();
}

console.log(`\n结果：${failed === 0 ? '全部通过' : failed + ' 项失败'}`);
process.exit(failed === 0 ? 0 : 1);
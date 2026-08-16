// 乡芽 教师办公文档生成 复杂场景端到端验证（真实 LLM）
// 目标：验证"优秀"级能力——复杂长文档、组合编排、自愈、越权防护、渲染完整性（分页/重叠/页数）
// 用法: node test-office-complex.mjs
import { randomBytes } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';

const base = 'http://localhost:3000/api/v1';
const origin = 'http://localhost:3000';

let cookies = {};
function storeCookies(res) {
  const sc = res.headers.getSetCookie?.() ?? [];
  for (const c of sc) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
}
const cookieHeader = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
const nonce = () => randomBytes(16).toString('hex');

async function login(username = 'wangxiulan', password = 'Demo@2026xy') {
  const csrfRes = await fetch(`${base}/auth/csrf`);
  storeCookies(csrfRes);
  await csrfRes.json();
  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader(), 'X-CSRF-Token': cookies['XSRF-TOKEN'], 'X-Timestamp': String(Date.now()), 'X-Nonce': nonce() },
    body: JSON.stringify({ username, password }),
  });
  storeCookies(loginRes);
  const login = await loginRes.json();
  if (login.code !== 0) throw new Error(`登录失败: ${login.message}`);
  return login.data.accessToken;
}

async function runTask(token, task) {
  console.log(`\n== 任务: ${task}`);
  const res = await fetch(`${base}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader(), 'X-CSRF-Token': cookies['XSRF-TOKEN'], 'X-Timestamp': String(Date.now()), 'X-Nonce': nonce(), Authorization: `Bearer ${token}` },
    body: JSON.stringify({ task }),
  });
  if (!res.ok || !res.body) throw new Error(`chat HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const events = [];
  const downloads = [];
  const finalText = [];
  const started = Date.now();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      const dataLine = part.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      let ev;
      try { ev = JSON.parse(dataLine.slice(6)); } catch { continue; }
      events.push(ev);
      if (ev.type === 'tool_start') console.log(`  [${Date.now() - started}ms] <tool_start> ${ev.name} args=${JSON.stringify(ev.args).slice(0, 120)}`);
      if (ev.type === 'tool_end') {
        const err = ev.error ? ` ERROR:${ev.error}` : '';
        const dl = ev.result?.downloadUrl ? ` 📥${ev.result.filename} (${ev.result.bytes}B)` : '';
        console.log(`  [${Date.now() - started}ms] <tool_end> ${ev.name} dur=${ev.durationMs}ms${err}${dl}`);
        if (ev.result?.downloadUrl) downloads.push(ev.result);
      }
      if (ev.type === 'text_delta') finalText.push(ev.delta ?? '');
      if (ev.type === 'done') finalText.push(ev.finalText ?? '');
    }
  }
  console.log(`== 事件 ${events.length} 个，下载链接 ${downloads.length} 个`);
  return { events, downloads, finalText: finalText.join('') };
}

async function downloadFile(token, dl) {
  const res = await fetch(`${origin}${dl.downloadUrl}`, { headers: { Cookie: cookieHeader(), Authorization: `Bearer ${token}` } });
  if (res.status !== 200) { console.log(`  ❌ 下载失败 HTTP ${res.status}`); return null; }
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`  ✅ 下载 200, ${buf.length}B, ${dl.filename}`);
  return buf;
}

// ---- zip 深度检查（Node 内置 zlib 手解 deflate，无需额外依赖）----
function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('非 zip 文件（无 EOCD）');
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries = [];
  let pos = cdOffset;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('中央目录损坏');
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOff = buf.readUInt32LE(pos + 42);
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen);
    const lhNameLen = buf.readUInt16LE(localOff + 26);
    const lhExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 8 ? inflateRawSync(raw) : method === 0 ? Buffer.from(raw) : null;
    entries.push({ name, data });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function analyzeDocx(buf, mustContain) {
  const entries = zipEntries(buf);
  const doc = entries.find((e) => e.name === 'word/document.xml')?.data;
  if (!doc) return { ok: false, reason: '缺少 word/document.xml' };
  const xml = doc.toString('utf8');
  const missing = mustContain.filter((k) => !xml.includes(k));
  const tables = (xml.match(/<w:tbl>/g) ?? []).length;
  const headings = (xml.match(/<w:pStyle w:val="Heading1"/g) ?? []).length;
  const ok = missing.length === 0;
  console.log(`  docx 深度: 表格 ${tables} 个, H1 标题 ${headings} 个, 缺关键词: ${missing.length ? missing.join(',') : '无'}`);
  return { ok, tables, headings, missing };
}

async function analyzePdf(buf) {
  if (buf.slice(0, 4).toString('ascii') !== '%PDF') return { ok: false, reason: '魔数错误' };
  const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
  const pages = pdf.getPageCount();
  console.log(`  pdf 深度: ${pages} 页`);
  return { ok: pages >= 1, pages };
}

async function analyzePptx(buf, minSlides) {
  const entries = zipEntries(buf);
  const slides = entries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  if (slides.length === 0) return { ok: false, reason: '无 slide XML' };
  // 每页文本块 y 坐标去重计数（重叠检测：同页多个 block y 相同 → 重叠）
  const perSlide = [];
  for (const s of slides) {
    const xml = s.data.toString('utf8');
    const ys = [...xml.matchAll(/<a:off[^>]*y="(\d+)"[^>]*\/>/g)].map((m) => +m[1]);
    const uniq = new Set(ys).size;
    perSlide.push({ name: s.name, blocks: ys.length, uniqY: uniq });
  }
  const maxOverlap = Math.max(...perSlide.map((p) => p.blocks - p.uniqY));
  console.log(`  pptx 深度: ${slides.length} 页, 单页最大重叠块数=${maxOverlap} (${perSlide.map((p) => `${p.name}:${p.blocks}块/${p.uniqY}个y`).join(' ')})`);
  return { ok: slides.length >= minSlides, slides: slides.length, maxOverlap };
}

const pass = [];
function check(name, ok, extra = '') {
  pass.push(ok);
  console.log(`  ${ok ? '✅' : '❌'} [${name}] ${extra}`);
}

async function main() {
  const token = await login();
  console.log('== 登录成功: wangxiulan role=teacher');

  // A. 复杂教案 → Word（长文档：4 环节+表格+列表）
  {
    const task = '请为五年级语文《草船借箭》写一份完整教案并导出为 Word 文档：1) 教学目标（知识与技能/过程与方法/情感态度价值观）；2) 教学重难点；3) 教学过程，分 4 个环节：课堂导入、初读课文、精读探究、拓展小结，每个环节都要有教师活动和学生活动，并写明时间分配（导入约10分钟、初读约12分钟、精读约15分钟、小结约3分钟）；4) 板书设计（用表格呈现）；5) 作业布置。教案要详细完整，适合 40 分钟课堂。';
    const { downloads, finalText } = await runTask(token, task);
    const dl = downloads[0];
    if (!dl) { check('A-教案Word', false, '未生成下载链接'); }
    else {
      const buf = await downloadFile(token, dl);
      if (!buf) check('A-教案Word', false, '下载失败');
      else {
        const r = await analyzeDocx(buf, ['课堂导入', '初读课文', '精读探究', '拓展小结', '板书', '作业']);
        check('A-教案Word', r.ok && (r.tables ?? 0) >= 1 && (r.headings ?? 0) >= 1, `结构完整=${r.ok} 表格=${r.tables} H1=${r.headings}`);
      }
    }
  }

  // B. 复杂学情分析 → PDF（大数据表格 + 多章节，验证分页）
  {
    const task = '请基于班级学情数据生成一份详细的学情分析报告并导出为 PDF：1) 班级概况；2) 语文成绩统计表，包含最近一次考试的至少 10 名学生（姓名、成绩、班级排名、是否及格），用表格呈现；3) 各分数段人数分布（90分以上/80-89/70-79/60-69/不及格）；4) 存在的主要问题分析（至少 3 条，分条列出）；5) 教学改进建议（至少 4 条，分条列出）。报告要专业、结构清晰。';
    const { downloads } = await runTask(token, task);
    const dl = downloads[0];
    if (!dl) { check('B-报告PDF', false, '未生成下载链接'); }
    else {
      const buf = await downloadFile(token, dl);
      if (!buf) check('B-报告PDF', false, '下载失败');
      else {
        const r = await analyzePdf(buf);
        check('B-报告PDF', r.ok && r.pages >= 2, `页数=${r.pages}（复杂报告应 ≥2 页，验证分页能力）`);
      }
    }
  }

  // C. 复杂课件 → PPTX（要求 ≥6 页，验证分页 + 同页元素重叠）
  {
    const task = '请制作一份五年级语文第一单元《童年往事》单元复习课件 PPT，要求至少 8 页幻灯片：1) 封面页；2) 单元学习目标页；3) 到 7) 每篇课文（《古诗词三首》《祖父的园子》《月是故乡明》《梅花魂》《再见了，亲人》各一页，每页包含课文简介、重点词句、中心思想三部分）；8) 单元重点字词整理页；9) 课后练习页。内容要充实。';
    const { downloads } = await runTask(token, task);
    const dl = downloads[0];
    if (!dl) { check('C-课件PPTX', false, '未生成下载链接'); }
    else {
      const buf = await downloadFile(token, dl);
      if (!buf) check('C-课件PPTX', false, '下载失败');
      else {
        const r = await analyzePptx(buf, 6);
        check('C-课件PPTX', r.ok && r.maxOverlap <= 1, `页数=${r.slides} 重叠=${r.maxOverlap}（≥6页达标，重叠≤1达标）`);
      }
    }
  }

  // D. 组合编排：一次任务内 先查学情 → 再导出 Word 教案 + Excel 成绩单
  {
    const task = '请先查看五(1)班的班级学情，然后：1) 基于学情生成一份单元复习教案并导出为 Word；2) 生成一张班级成绩单并导出为 Excel。两份文件都要生成。';
    const { events, downloads, finalText } = await runTask(token, task);
    const tools = events.filter((e) => e.type === 'tool_start').map((e) => e.name);
    const docCalls = tools.filter((t) => t === 'generate_document').length;
    const hasOverview = tools.includes('get_class_overview');
    check('D-组合编排', hasOverview && docCalls >= 2 && downloads.length >= 2 && finalText.length > 100,
      `工具序列=[${tools.join(',')}] 文档调用=${docCalls} 下载=${downloads.length}`);
    let okAll = true;
    for (const dl of downloads) {
      const buf = await downloadFile(token, dl);
      if (buf) check(`D-下载${dl.filename}`, buf[0] === 0x50 && buf[1] === 0x4b, '');
      else okAll = false;
    }
    check('D-全部下载可用', okAll, '');
  }

  // E. 自愈闭环：诱导非法 theme（白名单外"紫金"），LLM 应被校验拒绝后修复重试
  {
    const task = '请帮我做一份五年级语文《草船借箭》课堂讲义并导出为 PDF，视觉风格使用"紫金主题"（配色偏紫色和金色）。';
    const { events, downloads } = await runTask(token, task);
    const failed = events.filter((e) => e.type === 'tool_end' && e.error && e.error.includes('校验失败'));
    const retryAfterFail = events.findIndex((e) => e.type === 'tool_end' && e.error?.includes('校验失败')) < events.findIndex((e) => e.type === 'tool_end' && !e.error && e.result?.downloadUrl);
    check('E-自愈闭环', downloads.length >= 1 && (failed.length > 0 ? retryAfterFail : true),
      `校验失败=${failed.length}次 自愈后成功=${downloads.length >= 1}`);
    if (downloads[0]) {
      const buf = await downloadFile(token, downloads[0]);
      if (buf) check('E-下载', buf.slice(0, 4).toString('ascii') === '%PDF', `${buf.length}B`);
    }
  }

  // F. 越权防护：学生账号不可用生成文档工具
  {
    const studentToken = await login('lixiaoyu', 'Demo@2026xy');
    const task = '请帮我生成一份五年级语文教案并导出为 Word 文档';
    const { downloads, finalText } = await runTask(studentToken, task);
    const refused = finalText.includes('权限') || finalText.includes('无法') || finalText.includes('无权限');
    check('F-越权防护', downloads.length === 0 && refused, `下载链接=${downloads.length} 拒绝提示=${refused}`);
  }

  const total = pass.length;
  const okCount = pass.filter(Boolean).length;
  console.log(`\n===== 复杂场景结果: ${okCount}/${total} 通过 =====`);
  if (okCount !== total) process.exitCode = 2;
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });

// 乡芽 教师办公文档生成 端到端验证（真实 LLM 四格式导出 + 校验自愈闭环）
// 用法: node test-office.mjs [username] [password]
import { randomBytes } from 'node:crypto';

const [,, usernameArg, passwordArg] = process.argv;
const username = usernameArg ?? 'wangxiulan';
const password = passwordArg ?? 'Demo@2026xy';
const base = 'http://localhost:3000/api/v1';

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

async function login() {
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
  console.log(`== 登录成功: ${username} role=${login.data.user.role}`);
  return login.data.accessToken;
}

/** 发送任务并返回事件流 + 下载链接 */
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
      if (ev.type === 'done') console.log(`  [${Date.now() - started}ms] <done> ${(ev.finalText || '').slice(0, 100)}...`);
    }
  }
  console.log(`== 事件 ${events.length} 个，下载链接 ${downloads.length} 个`);
  return { events, downloads };
}

/** 验证下载文件可获取且魔数正确（downloadUrl 是站点绝对路径 /api/v1/files/...） */
async function verifyDownload(token, dl) {
  const origin = 'http://localhost:3000';
  const res = await fetch(`${origin}${dl.downloadUrl}`, { headers: { Cookie: cookieHeader(), Authorization: `Bearer ${token}` } });
  if (res.status !== 200) { console.log(`  ❌ 下载失败 HTTP ${res.status}`); return false; }
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = dl.downloadUrl.split('.').pop();
  let ok = true;
  if (ext === 'docx' || ext === 'pptx' || ext === 'xlsx') ok = buf[0] === 0x50 && buf[1] === 0x4b;
  if (ext === 'pdf') ok = buf.slice(0, 4).toString('ascii') === '%PDF';
  console.log(`  ${ok ? '✅' : '❌'} ${dl.filename} 下载 200, ${buf.length}B, 魔数${ok ? '正确' : '错误'}`);
  return ok;
}

async function main() {
  const token = await login();
  const tasks = [
    '请帮我生成一份五年级语文《草船借箭》教案，导出为 Word 文档',
    '请帮我制作一份"单元复习"课件 PPT，主题是五年级语文第一单元童年往事',
    '请帮我生成一份班级学情分析报告，导出为 PDF',
    '请帮我生成一张五年级语文成绩单表格，导出为 Excel',
  ];
  let pass = 0;
  for (const t of tasks) {
    const { downloads } = await runTask(token, t);
    for (const dl of downloads) {
      if (await verifyDownload(token, dl)) pass++;
    }
  }
  console.log(`\n===== 结果: ${pass}/${tasks.length} 个任务下载验证通过 =====`);
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });

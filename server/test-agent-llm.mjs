// 乡芽 Agent LLM 编排模式端到端测试（Node 20 内置 fetch）
// 用法: node test-agent-llm.mjs "任务文本" [username] [password]
import { randomBytes } from 'node:crypto';

const [,, taskArg, usernameArg, passwordArg] = process.argv;
const task = taskArg ?? '帮我诊断一下我的学习薄弱点';
const username = usernameArg ?? 'lixiaoyu';
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
function cookieHeader() {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}
const nonce = () => randomBytes(16).toString('hex');

async function main() {
  // 1. CSRF（初始握手）
  const csrfRes = await fetch(`${base}/auth/csrf`);
  storeCookies(csrfRes);
  await csrfRes.json();

  // 2. 登录（带防重放头）
  const ts = Date.now();
  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader(),
      'X-CSRF-Token': cookies['XSRF-TOKEN'],
      'X-Timestamp': String(ts),
      'X-Nonce': nonce(),
    },
    body: JSON.stringify({ username, password }),
  });
  storeCookies(loginRes);
  const login = await loginRes.json();
  if (login.code !== 0) {
    console.error(`登录失败: code=${login.code} msg=${login.message}`);
    process.exit(1);
  }
  const token = login.data.accessToken;
  // 登录会刷新 XSRF-TOKEN cookie——后续请求必须用刷新后的值
  const freshCsrf = cookies['XSRF-TOKEN'];
  console.log(`== 登录成功: ${username} role=${login.data.user.role} tokenLen=${token.length}`);

  // 3. SSE chat（流式读取）
  console.log(`\n== 任务: ${task}`);
  console.log('== SSE 事件流：');
  const chatTs = Date.now();
  const chatRes = await fetch(`${base}/agent/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader(),
      'X-CSRF-Token': freshCsrf,
      'X-Timestamp': String(chatTs),
      'X-Nonce': nonce(),
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ task }),
  });
  if (!chatRes.ok || !chatRes.body) {
    console.error(`chat HTTP ${chatRes.status}: ${await chatRes.text()}`);
    process.exit(1);
  }
  const reader = chatRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let count = 0;
  const started = Date.now();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      const evLine = part.split('\n').find((l) => l.startsWith('event:'));
      const dataLine = part.split('\n').find((l) => l.startsWith('data:'));
      if (!evLine || !dataLine) continue;
      count++;
      const evName = evLine.slice(7).trim();
      const data = dataLine.slice(6).trim();
      let pretty = data;
      try {
        const obj = JSON.parse(data);
        if (obj.type === 'tool_start') pretty = `tool=${obj.name} args=${JSON.stringify(obj.args).slice(0, 150)}`;
        else if (obj.type === 'tool_end') pretty = `tool=${obj.name} dur=${obj.durationMs}ms ${obj.error ? 'ERROR:' + obj.error : 'result=' + JSON.stringify(obj.result).slice(0, 200)}`;
        else if (obj.type === 'thinking') pretty = obj.text;
        else if (obj.type === 'text_delta') pretty = obj.delta.slice(0, 200);
        else if (obj.type === 'done') pretty = `finalText=${(obj.finalText || '').slice(0, 300)} refs=[${(obj.refs || []).join(',')}]`;
        else pretty = JSON.stringify(obj).slice(0, 200);
      } catch {}
      console.log(`  [${Date.now() - started}ms] <${evName}> ${pretty}`);
    }
  }
  console.log(`\n== 事件总数: ${count}`);

  // 4. 最近 run 轨迹
  const runsRes = await fetch(`${base}/agent/runs?page=1&pageSize=1`, {
    headers: { Cookie: cookieHeader(), Authorization: `Bearer ${token}` },
  });
  const runs = (await runsRes.json()).data;
  if (runs?.list?.length) {
    const r = runs.list[0];
    console.log(`\n== 最近 run #${r.id} status=${r.status} intent=${r.intent} tools=${r.toolCalls} dur=${r.durationMs}ms`);
    const detailRes = await fetch(`${base}/agent/runs/${r.id}`, {
      headers: { Cookie: cookieHeader(), Authorization: `Bearer ${token}` },
    });
    const detail = (await detailRes.json()).data;
    console.log(`== 轨迹明细 (${detail.messages?.length ?? 0} 条):`);
    for (const m of detail.messages ?? []) {
      const c = m.content ? String(m.content).slice(0, 100) : '';
      console.log(`   [${m.kind}] tool=${m.tool} status=${m.status} ${c}`);
    }
  }
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});

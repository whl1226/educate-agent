import { AgentEv, streamAgentChat } from './agent-stream';
import { esc } from './xss';
import { toast, fmtDateTime } from './ui';
import { downloadFile, previewFile } from './download';
import { ICONS } from './icons';

export type { AgentEv };

/** 智能体视图挂载所需的 DOM 元素（teacher / agent 两端各自提供） */
export interface AgentViewEls {
  stream: HTMLElement;
  chatView: HTMLElement;
  trajView: HTMLElement;
  chatTab: HTMLElement;
  trajTab: HTMLElement;
  trajBody: HTMLElement;
  sessionTitle: HTMLElement;
  input: HTMLTextAreaElement;
  sendBtn: HTMLButtonElement;
  backBottom: HTMLElement;
  welcomeBox?: HTMLElement | null;
}

export interface AgentViewCallbacks {
  /** 一次对话结束后的钩子（如刷新任务历史） */
  onRunEnded?: () => void;
}

export interface AgentChatController {
  sendTask(task: string): Promise<void>;
  resetConversation(): void;
  switchView(view: 'chat' | 'trajectory'): void;
  renderTrajectory(run: any): void;
  switchToHistory(run: any): void;
  appendUser(text: string): void;
}

/** iconify 本地 SVG 图标库 */
const ICO = {
  think: 'ph:brain',
  tool: 'ph:wrench',
  task: 'ph:package',
  done: 'ph:check-circle',
  error: 'ph:warning-circle',
  usage: 'ph:lightning',
  ref: 'ph:book-open-text',
  download: 'ph:download-simple',
  arrow: 'ph:arrow-fat-line-down',
  clock: 'ph:clock',
};

function icoEl(name: string): string {
  return ICONS[name] ?? '';
}

/* ==================== Markdown 可读化（去符号 + 安全渲染） ==================== */

/** Emoji 剥离（Unicode 全范围：表情/符号/修饰符/ZWJ/变体选择器/区域标识） */
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2460}-\u{24FF}\u{25A0}-\u{25FF}\u{2900}-\u{297F}\u{3000}-\u{303F}\u{3297}\u{3299}]/gu;

function stripEmoji(raw: string): string {
  return String(raw ?? '').replace(EMOJI_RE, '');
}

/** 纯文本化：剔除 md 符号与 emoji，保留可读文本（用于流式文本、摘要等 textContent 场景） */
export function stripMd(raw: string): string {
  return String(raw ?? '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}> ?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^\s*([-*_])\s*(\1\s*){2,}\s*$/gm, '')
    .replace(/```/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[|]{2}/g, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/(?<!\d)\*(?!\d)/g, '')
    .replace(/^\s*#{1,6}\s?/gm, '')
    .replace(EMOJI_RE, '');
}

/** 行内 md 符号 → 白名单 HTML（输入须已 esc，href 仅放行 http(s) 与站内相对路径） */
function inlineMd(t: string): string {
  return t
    .replace(/\$([^$\n]+)\$/g, (_m, tex: string) => renderMathInline(tex))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => {
      const u = url.trim();
      const okHttp = /^https?:\/\/[^\s"'<>]+$/i.test(u);
      const okRel = u.startsWith('/') && !u.startsWith('//') && !/[\s"'<>]/.test(u);
      if (okHttp || okRel) return `<a class="md-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${inlineMd(label)}</a>`;
      return label;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<span class="md-bold">$1</span>')
    .replace(/__([^_]+)__/g, '<span class="md-bold">$1</span>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<span class="md-italic">$2</span>')
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<span class="md-italic">$2</span>')
    .replace(/`([^`]+)`/g, '<code class="md-code-inline">$1</code>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
}

/** KaTeX 行内公式渲染（加载失败/解析失败时回退为纯文本） */
function renderMathInline(tex: string): string {
  const katex = (window as unknown as { katex?: { renderToString: (t: string, o?: Record<string, unknown>) => string } }).katex;
  const clean = tex.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  if (!katex) return `<span class="md-math-inline">${esc(tex)}</span>`;
  try {
    return `<span class="md-math-inline">${katex.renderToString(clean, { throwOnError: false })}</span>`;
  } catch {
    return `<span class="md-math-inline">${esc(tex)}</span>`;
  }
}

/** KaTeX 块级公式渲染（$$...$$，可跨行） */
function renderMathBlock(tex: string): string {
  const katex = (window as unknown as { katex?: { renderToString: (t: string, o?: Record<string, unknown>) => string } }).katex;
  const clean = tex.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  if (!katex) return `<div class="md-math">${esc(tex)}</div>`;
  try {
    return `<div class="md-math">${katex.renderToString(clean, { displayMode: true, throwOnError: false })}</div>`;
  } catch {
    return `<div class="md-math">${esc(tex)}</div>`;
  }
}

/** Markdown → 可读 HTML：先 esc 再处理符号，仅生成白名单标签（emoji 全量剥离） */
export function mdToHtml(raw: string): string {
  const lines = esc(stripEmoji(raw)).split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let inTable = false;
  let tableHeader: string[] = [];
  let tableRows: string[][] = [];
  let tableRow: string[] = [];
  let inMath = false;
  let mathBuf: string[] = [];

  const flushTable = () => {
    if (!inTable) return;
    const head = tableHeader.length ? `<tr>${tableHeader.map((h) => `<th>${h}</th>`).join('')}</tr>` : '';
    const body = tableRows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
    out.push(`<div class="md-table-wrap"><table>${head}${body}</table></div>`);
    tableHeader = [];
    tableRows = [];
    tableRow = [];
    inTable = false;
  };

  const flushMath = () => {
    if (!inMath) return;
    out.push(renderMathBlock(mathBuf.join('\n')));
    mathBuf = [];
    inMath = false;
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flushMath();
      flushTable();
      if (inCode) {
        out.push('<pre class="md-code-block">' + codeBuf.join('\n') + '</pre>');
        codeBuf = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    if (inMath) {
      const m = line.match(/^\s*\$\$\s*(.*?)\s*\$\$\s*$/);
      if (m) {
        mathBuf.push(m[1]);
        flushMath();
      } else {
        mathBuf.push(line);
        const inlineClose = line.match(/^(.*?)\s*\$\$\s*$/);
        if (inlineClose) {
          mathBuf[mathBuf.length - 1] = inlineClose[1];
          flushMath();
        }
      }
      continue;
    }
    const mathOpen = line.match(/^\s*\$\$\s*(.*)$/);
    if (mathOpen) {
      flushTable();
      if (mathOpen[1].trim().endsWith('$$')) {
        out.push(renderMathBlock(mathOpen[1].replace(/\s*\$\$$/, '')));
      } else {
        inMath = true;
        mathBuf = [mathOpen[1]];
      }
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.split('|').map((c) => inlineMd(c.trim())).filter((c, i, arr) => i > 0 && i < arr.length);
      if (cells.length && cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/<[^>]*>/g, '').trim()))) {
        continue;
      }
      if (!inTable) {
        inTable = true;
        tableHeader = cells;
      } else if (!tableHeader.length) {
        tableHeader = cells;
      } else {
        tableRow.push(...cells);
        if (tableRow.length >= tableHeader.length) {
          tableRows.push(tableRow);
          tableRow = [];
        }
      }
      continue;
    }
    if (inTable) { flushTable(); }
    if (inMath) continue;
    if (/^\s*$/.test(line)) { out.push('<div class="md-gap"></div>'); continue; }
    const h = line.match(/^\s{0,3}(#{1,4})\s+(.*)$/);
    if (h) { out.push(`<div class="md-h md-h${h[1].length}">${inlineMd(h[2])}</div>`); continue; }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) { out.push(`<div class="md-li">${inlineMd(ul[1])}</div>`); continue; }
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (ol) { out.push(`<div class="md-li md-li-ol">${inlineMd(ol[2])}</div>`); continue; }
    const q = line.match(/^\s*>\s?(.*)$/);
    if (q) { out.push(`<div class="md-quote">${inlineMd(q[1])}</div>`); continue; }
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line.trim())) { out.push('<hr class="md-hr">'); continue; }
    out.push(`<div class="md-p">${inlineMd(line)}</div>`);
  }
  flushTable();
  if (inMath) {
    out.push(`<div class="md-math">${esc(mathBuf.join('\n'))}</div>`);
  }
  if (inCode && codeBuf.length) out.push('<pre class="md-code-block">' + codeBuf.join('\n') + '</pre>');
  return out.join('');
}

/** 参数美化：对象转 JSON、长文本截断；generate_document 的 content_md 摘要展示 */
function formatArgs(args: unknown): string {
  if (args == null) return '{}';
  if (typeof args === 'string') {
    return args.length > 400 ? args.slice(0, 400) + '…' : args;
  }
  if (typeof args === 'object') {
    const o = args as Record<string, unknown>;
    if (typeof o.content_md === 'string') {
      const md = o.content_md;
      const brief = md.length > 220 ? md.slice(0, 220) + '…' : md;
      return JSON.stringify({ ...o, content_md: `【Markdown 文档内容，${md.length} 字符】\n${brief}` }, null, 2);
    }
  }
  return JSON.stringify(args, null, 2);
}

/** 结果美化：识别文件句柄，突出可读字段（避免整屏 JSON） */
function formatResult(result: unknown): string {
  if (result == null) return '{}';
  if (typeof result !== 'object') return String(result);
  const r = result as Record<string, unknown>;
  if (r.downloadUrl) {
    const lines: string[] = [];
    if (r.filename) lines.push(`文件名：${r.filename}`);
    if (r.format) lines.push(`格式：${r.format}`);
    if (r.bytes) lines.push(`大小：${(Number(r.bytes) / 1024).toFixed(1)} KB`);
    if (r.fileId) lines.push(`fileId：${r.fileId}`);
    return lines.length ? lines.join('\n') : '文档已生成';
  }
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

/** 文件操作条：预览 / 下载（带鉴权拉取，避免 401 跳登录页） */
export function fileActionsHtml(url: string, filename?: string): string {
  const safe = esc(url);
  const name = esc(filename || '文档');
  return `<div class="file-actions">
    <button class="file-btn" data-act="preview" data-url="${safe}" data-name="${name}">${icoEl('ph:eye')} 预览</button>
    <button class="file-btn file-btn-primary" data-act="download" data-url="${safe}" data-name="${name}">${icoEl(ICO.download)} 下载</button>
  </div>`;
}

export function bindFileActions(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>('.file-btn[data-act]').forEach((btn) => {
    const url = btn.dataset.url || '';
    const name = btn.dataset.name || '';
    btn.addEventListener('click', () => {
      if (btn.dataset.act === 'download') void downloadFile(url, name);
      else void previewFile(url, name);
    });
  });
}

/** 交付文本打字机流式渲染 */
function typewriterAppend(el: HTMLElement, text: string): void {
  const chunks = text.match(/[\s\S]{1,8}/g) || [text];
  let i = 0;
  const step = () => {
    if (i >= chunks.length) return;
    el.textContent += chunks[i++];
    if (i < chunks.length) window.setTimeout(step, 14);
  };
  step();
}

/** 运行中状态行（跳动蓝点 + shimmer） */
function runStatusRow(text: string, timer?: HTMLElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'run-status';
  row.innerHTML = `<span class="pulse-dot"></span><span class="status-text">${esc(text)}</span>`;
  if (timer) row.appendChild(timer);
  return row;
}

/** 思考折叠行（点击展开完整推理） */
function renderThinking(text: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'step';
  const clean = stripMd(text);
  const firstLine = clean.split('\n').find((l) => l.trim()) || '…';
  const head = document.createElement('div');
  head.className = 'think-row';
  head.innerHTML = `<span class="think-ico">${icoEl(ICO.think)}</span><span class="think-title">思考</span><span class="think-summary">${esc(firstLine)}</span><span class="chev">▾</span>`;
  const body = document.createElement('div');
  body.className = 'think-body';
  body.style.display = 'none';
  body.innerHTML = mdToHtml(text);
  head.addEventListener('click', () => {
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? 'block' : 'none';
    head.querySelector('.chev')!.setAttribute('style', `transform: rotate(${hidden ? '180deg' : '0deg'}); display:inline-block`);
  });
  card.appendChild(head);
  card.appendChild(body);
  return card;
}

/* 工具调用节点（IN/OUT 卡片） */
function toolCard(name: string, args: unknown, rec?: { result?: unknown; error?: string; durationMs: number }): HTMLElement {
  const card = document.createElement('div');
  card.className = 'tool-call';
  const running = !rec;
  const ok = rec ? !rec.error : false;
  const statusCls = running ? 'tool-running' : ok ? 'tool-done' : 'tool-error';
  const statusText = running ? '运行中' : ok ? '完成' : '失败';
  const durHtml = rec
    ? `<span class="tool-call-dur">${icoEl(ICO.clock)} ${rec.durationMs}ms</span>`
    : `<span class="tool-call-dur">${icoEl(ICO.clock)} …</span>`;
  const head = document.createElement('div');
  head.className = 'tool-call-head';
  head.innerHTML = `<span class="tool-call-ico">${icoEl(ICO.tool)}</span><span class="tool-call-name">${esc(name)}</span><span class="tool-call-status ${statusCls}">${statusText}</span>${durHtml}<span class="chev">▾</span>`;
  card.appendChild(head);

  const detail = document.createElement('div');
  detail.className = 'tool-call-detail';
  let ioHtml = `<div class="io-grid">
      <div class="io-card"><div class="io-card-head"><span class="io-tag">IN</span> · 参数</div><pre>${esc(formatArgs(args))}</pre></div>`;
  if (rec) {
    const body = rec.result ?? { error: rec.error };
    ioHtml += `<div class="io-card ${ok ? 'done' : 'err'}"><div class="io-card-head"><span class="io-tag">${ok ? 'OUT' : 'ERR'}</span> · 结果</div><pre>${esc(formatResult(body))}</pre></div>`;
  } else {
    ioHtml += `<div class="io-card"><div class="io-card-head"><span class="io-tag">OUT</span> · 等待中</div><pre>…</pre></div>`;
  }
  ioHtml += '</div>';
  detail.innerHTML = ioHtml;
  card.appendChild(detail);

  if (rec) renderFileActions(card, rec.result);

  head.addEventListener('click', () => card.classList.toggle('open'));
  return card;
}

/** 在工具卡片底部渲染「预览 / 下载」按钮（带鉴权拉取） */
function renderFileActions(card: HTMLElement, result: unknown): void {
  const r = result as { downloadUrl?: string; filename?: string } | null | undefined;
  if (!r || typeof r !== 'object' || !r.downloadUrl) return;
  const row = document.createElement('div');
  row.innerHTML = fileActionsHtml(r.downloadUrl, r.filename);
  bindFileActions(row);
  card.appendChild(row);
}

/**
 * 挂载智能体对话视图：绑定输入发送、SSE 流式渲染、视图切换、轨迹回放。
 * 教师端工作台与独立 agent 页共用同一套渲染核心，保证两端行为一致。
 */
export function mountAgentChat(els: AgentViewEls, cbs: AgentViewCallbacks = {}): AgentChatController {
  const streamBox = (): HTMLElement => {
    const inner = els.stream.querySelector('.stream-inner') as HTMLElement | null;
    return inner ?? els.stream;
  };

  /** 工具卡片按工具名索引：并行子代理事件交错时结果精确回填 */
  const toolCards = new Map<string, HTMLElement>();
  const taskCards = new Map<string, HTMLElement>();
  /** 流式回答卡原始 md 缓冲：每张卡片累积原始文本，整体 mdToHtml 重渲染 */
  const mdBufs = new WeakMap<HTMLElement, string>();

  function switchView(view: 'chat' | 'trajectory') {
    const chat = els.chatView;
    const traj = els.trajView;
    if (view === 'chat') {
      chat.hidden = false;
      traj.hidden = true;
      els.chatTab.classList.add('active');
      els.trajTab.classList.remove('active');
      els.chatTab.setAttribute('aria-selected', 'true');
      els.trajTab.setAttribute('aria-selected', 'false');
      setTimeout(() => { els.stream.scrollTop = els.stream.scrollHeight; }, 30);
    } else {
      chat.hidden = true;
      traj.hidden = false;
      els.chatTab.classList.remove('active');
      els.trajTab.classList.add('active');
      els.chatTab.setAttribute('aria-selected', 'false');
      els.trajTab.setAttribute('aria-selected', 'true');
    }
  }

  function renderText(card: HTMLElement, delta: string) {
    let el = card.querySelector('.text-stream') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.className = 'text-stream';
      card.appendChild(el);
    }
    const prev = mdBufs.get(card) ?? '';
    const next = prev + delta;
    mdBufs.set(card, next);
    el.innerHTML = mdToHtml(next);
  }

  function renderDone(card: HTMLElement, ev: AgentEv & { type: 'done' }) {
    const hasStreamed = !!card.querySelector('.text-stream');
    const del = document.createElement('div');
    del.className = 'delivery-card';
    del.innerHTML = `<div class="delivery-title">${icoEl(ICO.done)} 交付完成${ev.intent ? ` · 意图：${esc(ev.intent)}` : ''}</div>`;
    const p = document.createElement('div');
    p.className = 'delivery-text';
    del.appendChild(p);
    if (hasStreamed) {
      p.innerHTML = mdToHtml(ev.finalText);
    } else {
      typewriterAppend(p, stripMd(ev.finalText));
    }
    if (ev.refs?.length) {
      const refs = document.createElement('div');
      refs.className = 'refs';
      refs.innerHTML = ev.refs.map((r) => `<span class="ref-tag">${icoEl(ICO.ref)} ${esc(r)}</span>`).join('');
      del.appendChild(refs);
    }
    streamBox().appendChild(del);
  }

  function renderError(text: string) {
    const card = document.createElement('div');
    card.className = 'step';
    const banner = document.createElement('div');
    banner.className = 'run-error-banner';
    banner.innerHTML = `${icoEl(ICO.error)}<div>${esc(text)}</div>`;
    card.appendChild(banner);
    streamBox().appendChild(card);
  }

  function renderUsage(ev: { inputTokens: number; outputTokens: number }) {
    const card = document.createElement('div');
    card.className = 'step';
    const box = document.createElement('div');
    box.className = 'usage-box';
    box.innerHTML = `${icoEl(ICO.usage)} 本次消耗 tokens：输入 <b>${esc(String(ev.inputTokens))}</b> / 输出 <b>${esc(String(ev.outputTokens))}</b>`;
    card.appendChild(box);
    streamBox().appendChild(card);
  }

  function renderTaskStart(ev: { taskId: string; description: string }) {
    const card = document.createElement('div');
    card.className = 'step';
    const row = document.createElement('div');
    row.className = 'tool-call-head';
    row.style.cursor = 'default';
    row.innerHTML = `<span class="tool-call-ico" style="background:color-mix(in srgb, var(--cat-task) 12%, transparent)">${icoEl(ICO.task)}</span><span class="tool-call-name">${esc(ev.description)}</span><span class="tool-call-status tool-running">处理中</span>`;
    card.appendChild(row);
    streamBox().appendChild(card);
    taskCards.set(ev.taskId, card);
  }

  function renderTaskEnd(ev: { taskId: string; state: string; outputSummary?: string }) {
    const card = taskCards.get(ev.taskId);
    if (!card) return;
    taskCards.delete(ev.taskId);
    const meta = card.querySelector('.tool-call-status') as HTMLElement | null;
    if (meta) {
      const ok = ev.state === 'completed';
      meta.textContent = ok ? '完成' : '失败 · ' + ev.state;
      meta.className = 'tool-call-status ' + (ok ? 'tool-done' : 'tool-error');
    }
    if (ev.outputSummary && ev.outputSummary.startsWith('/') && !ev.outputSummary.startsWith('//')) {
      const row = document.createElement('div');
      row.innerHTML = fileActionsHtml(ev.outputSummary);
      bindFileActions(row);
      card.appendChild(row);
    }
  }

  /** 流结束兜底：残留 running 卡片置为失败态并释放 Map */
  function settleRunningTasks() {
    for (const [, card] of taskCards) {
      const meta = card.querySelector('.tool-call-status') as HTMLElement | null;
      if (meta && meta.classList.contains('tool-running')) {
        meta.textContent = '中断';
        meta.className = 'tool-call-status tool-error';
      }
    }
    taskCards.clear();
  }

  function appendUser(text: string) {
    const div = document.createElement('div');
    div.className = 'msg-user';
    div.textContent = stripMd(text);
    streamBox().appendChild(div);
  }

  /* 原始 SSE 请求：复用公共 streamAgentChat（agent-stream.ts），事件逐步回调 */
  async function sseChat(task: string, onEvent: (ev: AgentEv) => void): Promise<void> {
    await streamAgentChat(task, onEvent);
  }

  function updateBackBottom() {
    const btn = els.backBottom;
    const nearBottom = els.stream.scrollHeight - els.stream.scrollTop - els.stream.clientHeight < 120;
    btn.classList.toggle('show', !nearBottom);
  }

  async function sendTask(task: string) {
    const stream = els.stream;
    appendUser(task);
    els.sessionTitle.textContent = task.slice(0, 24) + (task.length > 24 ? '…' : '');

    // 运行状态行 + 计时
    const timer = document.createElement('span');
    timer.className = 'status-timer';
    const t0 = Date.now();
    timer.textContent = '0s';
    const timerId = window.setInterval(() => {
      timer.textContent = Math.round((Date.now() - t0) / 1000) + 's';
    }, 1000);
    const statusRow = runStatusRow('思考中…', timer);
    streamBox().appendChild(statusRow);

    let textCard: HTMLElement | null = null;

    /** 回答流目标卡片：只在独立「回答」卡片内累积文本 */
    const answerCard = (): HTMLElement => {
      if (textCard && textCard.dataset.answer === '1') return textCard;
      const c = document.createElement('div');
      c.className = 'step';
      c.dataset.answer = '1';
      streamBox().appendChild(c);
      textCard = c;
      return c;
    };

    const handleEvent = (ev: AgentEv) => {
      switch (ev.type) {
        case 'thinking': {
          const c = renderThinking(ev.text);
          streamBox().appendChild(c);
          textCard = c;
          break;
        }
        case 'tool_start': {
          const c = toolCard(ev.name, ev.args);
          streamBox().appendChild(c);
          toolCards.set(ev.name, c);
          textCard = c;
          break;
        }
        case 'tool_end': {
          const card = toolCards.get(ev.name);
          toolCards.delete(ev.name);
          if (card) {
            const detail = card.querySelector('.tool-call-detail') as HTMLElement | null;
            const status = card.querySelector('.tool-call-status') as HTMLElement | null;
            const dur = card.querySelector('.tool-call-dur') as HTMLElement | null;
            const ok = !ev.error;
            if (status) {
              status.textContent = ok ? '完成' : '失败';
              status.className = 'tool-call-status ' + (ok ? 'tool-done' : 'tool-error');
            }
            if (dur) dur.innerHTML = `${icoEl(ICO.clock)} ${ev.durationMs}ms`;
            if (detail) {
              const body = ev.result ?? { error: ev.error };
              detail.querySelector('.io-card:last-child')!.innerHTML =
                `<div class="io-card-head"><span class="io-tag">${ok ? 'OUT' : 'ERR'}</span> · 结果</div><pre>${esc(formatResult(body))}</pre>`;
            }
            renderFileActions(card, ev.result);
          }
          break;
        }
        case 'text_delta':
          renderText(answerCard(), ev.delta);
          break;
        case 'done':
          renderDone(textCard ?? answerCard(), ev);
          break;
        case 'error':
          renderError(ev.text);
          toast(ev.text, '!');
          break;
        case 'usage':
          renderUsage(ev);
          break;
        case 'task_start':
          renderTaskStart(ev);
          break;
        case 'task_end':
          renderTaskEnd(ev);
          break;
      }
      stream.scrollTop = stream.scrollHeight;
      updateBackBottom();
    };

    try {
      await sseChat(task, handleEvent);
      cbs.onRunEnded?.();
    } catch (e) {
      toast((e as Error).message || '发送失败', '!');
    } finally {
      window.clearInterval(timerId);
      statusRow.remove();
      settleRunningTasks();
      updateBackBottom();
    }
  }

  /** 解析历史消息的 argsJson/resultJson */
  function parseJsonSafe(s: string | null | undefined, fallback: unknown = {}): unknown {
    if (!s) return fallback;
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  }

  /** 切换主区为某次历史运行的完整对话流 */
  function switchToHistory(run: any) {
    const box = streamBox();
    const welcome = els.welcomeBox;
    Array.from(box.children).forEach((n) => {
      if (n !== welcome) n.remove();
    });
    if (welcome) welcome.style.display = 'none';
    els.sessionTitle.textContent = (run.taskInput || `任务 #${run.id}`).slice(0, 30);

    if (run.taskInput) appendUser(run.taskInput);

    const msgs: any[] = run.messages || [];
    const pendingTools: { name: string; card: HTMLElement }[] = [];

    for (const m of msgs) {
      switch (m.kind) {
        case 'thinking': {
          box.appendChild(renderThinking(m.content || ''));
          break;
        }
        case 'tool_call': {
          const card = toolCard(m.tool || '工具调用', parseJsonSafe(m.argsJson, m.args), undefined);
          box.appendChild(card);
          pendingTools.push({ name: m.tool || '工具调用', card });
          break;
        }
        case 'tool_result': {
          const ok = m.status !== 'error';
          const idx = pendingTools.findIndex((p) => p.name === (m.tool || ''));
          const card = idx >= 0 ? pendingTools[idx].card : null;
          if (idx >= 0) pendingTools.splice(idx, 1);
          const result = parseJsonSafe(m.resultJson, m.result);
          if (card) {
            const status = card.querySelector('.tool-call-status') as HTMLElement | null;
            const dur = card.querySelector('.tool-call-dur') as HTMLElement | null;
            const detail = card.querySelector('.tool-call-detail') as HTMLElement | null;
            if (status) {
              status.textContent = ok ? '完成' : '失败';
              status.className = 'tool-call-status ' + (ok ? 'tool-done' : 'tool-error');
            }
            if (dur) dur.innerHTML = `${icoEl(ICO.clock)} ${m.durationMs ?? 0}ms`;
            if (detail) {
              detail.querySelector('.io-card:last-child')!.innerHTML =
                `<div class="io-card-head"><span class="io-tag">${ok ? 'OUT' : 'ERR'}</span> · 结果</div><pre>${esc(formatResult(result))}</pre>`;
            }
            renderFileActions(card, result);
          } else {
            const c = toolCard(m.tool || '工具调用', {}, { result, error: ok ? undefined : m.status, durationMs: m.durationMs ?? 0 });
            box.appendChild(c);
          }
          break;
        }
        case 'text_stream': {
          const card = document.createElement('div');
          card.className = 'step';
          const el = document.createElement('div');
          el.className = 'text-stream';
          el.innerHTML = mdToHtml(m.content || '');
          card.appendChild(el);
          box.appendChild(card);
          break;
        }
        case 'final': {
          const del = document.createElement('div');
          del.className = 'delivery-card';
          del.innerHTML = `<div class="delivery-title">${icoEl(ICO.done)} 交付完成</div>`;
          const p = document.createElement('div');
          p.className = 'delivery-text';
          p.innerHTML = mdToHtml(m.content || '');
          del.appendChild(p);
          if (m.refs && m.refs.length) {
            const refs = document.createElement('div');
            refs.className = 'refs';
            refs.innerHTML = m.refs.map((r: string) => `<span class="ref-tag">${icoEl(ICO.ref)} ${esc(r)}</span>`).join('');
            del.appendChild(refs);
          }
          box.appendChild(del);
          break;
        }
        case 'usage': {
          const u = parseJsonSafe(m.content, null) as { inputTokens?: number; outputTokens?: number } | null;
          if (u && typeof u.inputTokens === 'number') renderUsage(u);
          break;
        }
        case 'task': {
          const card = document.createElement('div');
          card.className = 'step';
          const row = document.createElement('div');
          row.className = 'tool-call-head';
          row.style.cursor = 'default';
          const done = m.status === 'done';
          row.innerHTML = `<span class="tool-call-ico" style="background:color-mix(in srgb, var(--cat-task) 12%, transparent)">${icoEl(ICO.task)}</span><span class="tool-call-name">${esc(m.tool || '后台任务')}</span><span class="tool-call-status ${done ? 'tool-done' : 'tool-running'}">${done ? '完成' : '处理中'}</span>`;
          card.appendChild(row);
          if (m.content && m.content.startsWith('/') && !m.content.startsWith('//')) {
            const row2 = document.createElement('div');
            row2.innerHTML = fileActionsHtml(m.content);
            bindFileActions(row2);
            card.appendChild(row2);
          }
          box.appendChild(card);
          break;
        }
        default:
          break;
      }
    }

    // 同步轨迹视图
    renderTrajectory(run);
    switchView('chat');
    const stream = els.stream;
    stream.scrollTop = stream.scrollHeight;
    updateBackBottom();
  }

  /* ==================== 轨迹视图 ==================== */

  function renderTrajectory(run: any) {
    const body = els.trajBody;
    const msgs = run.messages || [];
    const statusCls = run.status === 'success' ? 'status-success' : run.status === 'running' ? 'status-running' : 'status-needs_human';
    const statusLabel: Record<string, string> = { success: '成功', running: '进行中', needs_human: '待人工', failed: '失败' };
    const nodes = msgs
      .map((m: any, i: number) => {
        const seq = String(i + 1).padStart(2, '0');
        if (m.kind === 'thinking')
          return `<div class="traj-node think"><div class="traj-node-card"><div class="traj-node-head">${icoEl(ICO.think)} 思考过程<span class="traj-seq">${seq}</span></div><div class="md-content">${mdToHtml(m.content || '')}</div></div></div>`;
        if (m.kind === 'tool_call')
          return `<div class="traj-node tool"><div class="traj-node-card"><div class="traj-node-head">${icoEl(ICO.tool)} ${esc(m.tool || '')}<span class="traj-seq">${seq}</span></div><pre>${esc(formatArgs(m.args))}</pre><div class="ti-meta">状态：${esc(m.status || 'running')}</div></div></div>`;
        if (m.kind === 'tool_result') {
          const ok = m.status !== 'error';
          const res = m.result as { downloadUrl?: string; filename?: string } | null | undefined;
          const fileBar = ok && res && typeof res === 'object' && res.downloadUrl ? fileActionsHtml(res.downloadUrl, res.filename) : '';
          return `<div class="traj-node ${ok ? 'tool' : 'err'}"><div class="traj-node-card"><div class="traj-node-head">${icoEl(ok ? ICO.arrow : ICO.error)} ${ok ? '工具结果' : '工具错误'}<span class="traj-seq">${seq}</span></div><pre>${esc(formatResult(m.result))}</pre>${fileBar}<div class="ti-meta">${esc(m.status || 'done')} · ${m.durationMs ?? 0}ms</div></div></div>`;
        }
        if (m.kind === 'text_stream')
          return `<div class="traj-node final"><div class="traj-node-card"><div class="traj-node-head">${icoEl(ICO.done)} 文本输出<span class="traj-seq">${seq}</span></div><div class="md-content">${mdToHtml(m.content || '')}</div></div></div>`;
        if (m.kind === 'final')
          return `<div class="traj-node final"><div class="traj-node-card"><div class="traj-node-head">${icoEl(ICO.done)} 最终交付<span class="traj-seq">${seq}</span></div><div class="md-content">${mdToHtml(m.content || '')}</div>${m.refs && m.refs.length ? `<div class="ti-meta">引用：${m.refs.map((r: string) => esc(r)).join('、')}</div>` : ''}</div></div>`;
        if (m.kind === 'task')
          return `<div class="traj-node ${m.status === 'done' ? 'final' : 'think'}"><div class="traj-node-card"><div class="traj-node-head">${icoEl(m.status === 'done' ? ICO.done : ICO.task)} 后台任务 · ${esc(m.tool || '')}<span class="traj-seq">${seq}</span></div><div class="md-content">${mdToHtml(m.content || '')}</div>${m.content && m.content.startsWith('/') && !m.content.startsWith('//') ? fileActionsHtml(m.content) : ''}<div class="ti-meta">状态：${esc(m.status || 'running')}</div></div></div>`;
        return '';
      })
      .filter(Boolean)
      .join('');
    body.innerHTML = msgs.length
      ? `<div class="traj-header">
          <div><div class="th-title">#${run.id} ${esc(run.taskInput || '')}</div><div class="th-meta">${run.durationMs ?? 0}ms · ${run.toolCalls ?? 0} 个工具 · ${fmtDateTime(run.createdAt)}</div></div>
          <span class="th-status status-tag ${statusCls}">${esc(statusLabel[run.status] || run.status || '')}</span>
        </div>
        <div class="traj-timeline">${nodes}</div>`
      : `<div class="traj-empty"><span class="iconify" data-icon="ph:stack-simple" style="width:30px;height:30px;display:block;margin:0 auto 12px"></span>该运行暂无轨迹消息</div>`;
    bindFileActions(body);
  }

  /* ==================== 新会话 ==================== */

  function resetConversation() {
    const box = streamBox();
    const welcome = els.welcomeBox;
    Array.from(box.children).forEach((n) => {
      if (n !== welcome) n.remove();
    });
    if (welcome) welcome.style.display = 'block';
    els.sessionTitle.textContent = '新会话';
    els.trajBody.innerHTML = '<div class="traj-empty"><span class="iconify" data-icon="ph:path" style="width:32px;height:32px;display:block;margin:0 auto 12px"></span>选择左侧任务，或完成一次对话后<br>在这里查看全链路轨迹</div>';
    switchView('chat');
    toolCards.clear();
  }

  function updateBackBottomInit() {
    const stream = els.stream;
    stream.addEventListener('scroll', updateBackBottom);
    els.backBottom.addEventListener('click', () => {
      stream.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' });
    });
  }

  updateBackBottomInit();

  return {
    sendTask,
    resetConversation,
    switchView,
    renderTrajectory,
    switchToHistory,
    appendUser,
  };
}

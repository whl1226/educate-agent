import { get } from '../core/request';
import { esc } from '../core/xss';
import { toast, fmtDateTime, fixPreviewLinks, showPreviewBanner } from '../core/ui';
import { requireRole, isPreviewMode } from '../core/guard';
import type { SafeUser } from '../core/auth';
import { ICONS } from '../core/icons';
import { mountAgentChat, stripMd, type AgentChatController } from '../core/agent-view';

/** 教师端「发送给智能体」任务传递通道：sessionStorage 键 */
const TASK_CHANNEL = 'xy.agent.task';

const ROLE_LABEL: Record<string, string> = {
  teacher: '教师',
  student: '学生',
  parent: '家长',
  admin: '管理者',
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/* 静态占位图标注入 */
const STATIC_ICONS: Record<string, string> = {
  brandIcon: 'ph:plant',
  linkTeacher: 'ph:chalkboard-simple',
  linkStudent: 'ph:student',
  linkParent: 'ph:users-three',
  linkAdmin: 'ph:gear',
  iconPlus: 'ph:plus',
  iconSearch: 'ph:magnifying-glass',
  iconSpinner: 'ph:circle-notch',
  iconHero: 'ph:plant',
  iconHint: 'ph:lightbulb',
  iconHintHeart: 'ph:heartbeat',
  iconHintBook: 'ph:book-open',
  iconHintChart: 'ph:presentation-chart',
  iconHintWarn: 'ph:warning-circle',
  iconHintKey: 'ph:keyboard',
  iconSend: 'ph:arrow-up-bold',
  iconChatTab: 'ph:chat-circle',
  iconTrajTab: 'ph:path',
  iconUser: 'ph:user',
  iconDown: 'ph:arrow-down',
  iconTraj: 'ph:path',
};

function injectStaticIcons() {
  for (const [id, name] of Object.entries(STATIC_ICONS)) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = ICONS[name] ?? '';
  }
}

/* ==================== 主题切换（auto / light / dark 循环） ==================== */
const THEME_KEY = 'xiangya.agent.theme';
type ThemeChoice = 'auto' | 'light' | 'dark';

function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice === 'light' || choice === 'dark') return choice;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(choice: ThemeChoice) {
  const resolved = resolveTheme(choice);
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
  const btn = $('themeBtn') as HTMLButtonElement | null;
  if (btn) {
    const icon = choice === 'auto' ? ICONS['ph:circle-half'] : resolved === 'dark' ? ICONS['ph:moon'] : ICONS['ph:sun'];
    btn.innerHTML = icon || '';
    btn.title = choice === 'auto' ? `主题：跟随系统 (${resolved})，点击切换` : `主题：${choice === 'dark' ? '暗色' : '亮色'}，点击切换`;
  }
}

function cycleTheme() {
  const saved = (() => {
    try { return localStorage.getItem(THEME_KEY) as ThemeChoice | null; } catch { return null; }
  })();
  const cur: ThemeChoice = saved === 'light' || saved === 'dark' ? saved : 'auto';
  const next: ThemeChoice = cur === 'auto' ? 'light' : cur === 'light' ? 'dark' : 'auto';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* 静默 */ }
  applyTheme(next);
}

function initTheme() {
  let saved: ThemeChoice | null = null;
  try { saved = localStorage.getItem(THEME_KEY) as ThemeChoice | null; } catch { /* 静默 */ }
  const choice: ThemeChoice = saved === 'light' || saved === 'dark' ? saved : 'auto';
  applyTheme(choice);
  $('themeBtn').addEventListener('click', cycleTheme);
  if (choice === 'auto' || !saved) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const cur = localStorage.getItem(THEME_KEY) as ThemeChoice | null;
        if (cur !== 'light' && cur !== 'dark') applyTheme('auto');
      });
    } catch { /* 旧浏览器无 addEventListener */ }
  }
}

/* ==================== 用户信息 ==================== */

function setUserCard(user: SafeUser) {
  const name = user.displayName || user.username || '用户';
  $('userName').textContent = name;
  $('sessionUser').textContent = name + ' · ' + (ROLE_LABEL[user.role] || user.role);
  const role = ROLE_LABEL[user.role] || user.role;
  $('userRole').textContent = role;
  const avatar = $('userAvatar');
  avatar.textContent = name.charAt(0).toUpperCase();
}

/* ==================== 欢迎区示例（按角色动态渲染） ==================== */

interface HintItem {
  icon: string; // ICONS 键（如 'ph:heartbeat'）
  text: string;
  task: string;
}

/** 管理端示例：调用 admin 工具域（区域概览/预警/教师画像） */
const ADMIN_HINTS: HintItem[] = [
  { icon: 'ph:warning-circle', text: '盘点当前最需处置的 3 件事', task: '盘点当前区域学情概览与全部预警（控辍保学/心理/师资/均衡），指出最需要处置的 3 件事，每件给出数据依据与行动建议。' },
  { icon: 'ph:presentation-chart', text: '看看区域学情预警', task: '查看区域学情概览与最新预警，指出最需要关注的预警并给出处置建议。' },
  { icon: 'ph:heartbeat', text: '师资缺口分析', task: '分析师资结构预警与教师画像，指出缺口最大的学科与学校，给出补员或调配建议。' },
  { icon: 'ph:book-open', text: '城乡资源差距', task: '分析城乡资源均衡相关数据与预警，指出差距最大的项目，给出优先改进建议。' },
];

/** 教师/学生/家长默认示例 */
const DEFAULT_HINTS: HintItem[] = [
  { icon: 'ph:heartbeat', text: '帮我诊断学习薄弱点', task: '帮我诊断学习薄弱点' },
  { icon: 'ph:book-open', text: '草船借箭讲了什么故事？', task: '草船借箭讲了什么故事？' },
  { icon: 'ph:presentation-chart', text: '帮我备一节五年级语文课：草船借箭', task: '帮我备一节五年级语文课：草船借箭' },
  { icon: 'ph:warning-circle', text: '看看区域预警情况', task: '看看区域预警情况' },
];

const ADMIN_HERO_SUB = '我可以盘点区域学情、解读预警、分析师资缺口、评估资源均衡…<br>每步思考与工具调用都会展示给你，可全程追溯。';

function renderWelcome(role: string) {
  const list = document.getElementById('hintList');
  if (!list) return;
  const isAdmin = role === 'admin';
  const items = isAdmin ? ADMIN_HINTS : DEFAULT_HINTS;
  list.innerHTML = items
    .map(
      (h) =>
        `<div class="hint-item" data-hint="${esc(h.task)}"><span>${ICONS[h.icon] ?? ''}</span>${esc(h.text)}</div>`,
    )
    .join('');
  const sub = document.getElementById('heroSub');
  if (sub) sub.innerHTML = isAdmin ? ADMIN_HERO_SUB : '我可以诊断学情、生成教案、解答知识、规划学习、查看预警…<br>每步思考与工具调用都会展示给你，可全程追溯。';
}

/* ==================== 输入区 ==================== */

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

/* ==================== 任务历史 ==================== */

let cachedRuns: any[] = [];
let controller: AgentChatController | null = null;

async function loadRuns() {
  try {
    const res = await get<any>('/agent/runs?page=1&pageSize=10');
    cachedRuns = res?.list ?? [];
    renderRunList();
  } catch {
    /* 静默 */
  }
}

function renderRunList() {
  const box = $('runList');
  $('runCount').textContent = String(cachedRuns.length);
  const kw = ($('runSearch') as HTMLInputElement).value.trim().toLowerCase();
  const list = kw ? cachedRuns.filter((r: any) => String(r.taskInput || '').toLowerCase().includes(kw)) : cachedRuns;
  box.innerHTML = list.length
    ? list
        .map((r: any) => {
          const statusLabel: Record<string, string> = { success: '成功', running: '进行中', needs_human: '待人工', failed: '失败' };
          const statusCls = r.status === 'success' ? 'status-success' : r.status === 'running' ? 'status-running' : 'status-needs_human';
          return `<div class="run-item" data-id="${r.id}">
            <div class="run-item-head">
              <span class="run-item-id">#${r.id}</span>
              <span class="status-tag ${statusCls}">${esc(statusLabel[r.status] || r.status || '')}</span>
            </div>
            <div class="run-text">${esc(stripMd(r.taskInput || '').slice(0, 40))}</div>
            <div class="run-meta">
              <span>${ICONS['ph:wrench'] ?? ''}${r.toolCalls ?? 0}</span>
              <span>${ICONS['ph:clock'] ?? ''}${fmtDateTime(r.createdAt)}</span>
            </div>
          </div>`;
        })
        .join('')
    : kw
      ? '<div class="empty-tip"><span class="iconify" data-icon="ph:magnifying-glass" style="width:20px;height:20px;display:block;margin:0 auto 6px"></span>没有匹配的任务</div>'
      : '<div class="empty-tip"><span class="iconify" data-icon="ph:chat-text" style="width:22px;height:22px;display:block;margin:0 auto 6px"></span>暂无任务，快去发起一次对话吧</div>';
  box.querySelectorAll('.run-item').forEach((el) =>
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.id;
      box.querySelectorAll('.run-item').forEach((n) => n.classList.remove('active'));
      el.classList.add('active');
      try {
        const detail = await get<any>(`/agent/runs/${id}`);
        controller?.switchToHistory(detail);
      } catch {
        toast('对话加载失败', '!');
      }
    }),
  );
}

/* ==================== 初始化 ==================== */

async function init() {
  let user: SafeUser;
  try {
    user = await requireRole(['student', 'teacher', 'parent', 'admin']);
  } catch {
    return;
  }
  initTheme();
  setUserCard(user);
  renderWelcome(user.role);
  fixPreviewLinks(user.role);
  if (isPreviewMode()) showPreviewBanner(user.role);
  injectStaticIcons();

  const input = $<HTMLTextAreaElement>('taskInput');
  const sendBtn = $<HTMLButtonElement>('sendBtn');

  controller = mountAgentChat(
    {
      stream: $('stream'),
      chatView: $('chatView'),
      trajView: $('trajectoryView'),
      chatTab: $('chatTab'),
      trajTab: $('trajectoryTab'),
      trajBody: $('trajBody'),
      sessionTitle: $('sessionTitle'),
      input,
      sendBtn,
      backBottom: $('backBottom'),
      welcomeBox: document.getElementById('welcomeBox'),
    },
    { onRunEnded: () => void loadRuns() },
  );

  let sending = false;

  // 视图 Tabs
  $('chatTab').addEventListener('click', () => controller?.switchView('chat'));
  $('trajectoryTab').addEventListener('click', () => controller?.switchView('trajectory'));

  // 新建会话
  $('newChatBtn').addEventListener('click', () => {
    if (sending) return;
    controller?.resetConversation();
    input.focus();
  });

  const submit = () => {
    const t = input.value.trim();
    if (!t) return toast('请输入任务', '!');
    if (sending) return;
    sending = true;
    sendBtn.disabled = true;
    input.value = '';
    autoGrow(input);
    const welcome = document.getElementById('welcomeBox');
    if (welcome) welcome.style.display = 'none';
    controller?.switchView('chat');
    void controller!.sendTask(t).finally(() => {
      sending = false;
      sendBtn.disabled = false;
      input.focus();
    });
  };

  sendBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });
  input.addEventListener('input', () => autoGrow(input));

  // 欢迎区示例提示
  document.querySelectorAll('.hint-item[data-hint]').forEach((el) =>
    el.addEventListener('click', () => {
      const t = (el as HTMLElement).dataset.hint || '';
      input.value = t;
      autoGrow(input);
      submit();
    }),
  );

  // 任务搜索过滤
  $('runSearch').addEventListener('input', renderRunList);

  // ===== 教师端「发送给智能体」任务：sessionStorage 传递 → 自动发送 =====
  let pendingTask: string | null = null;
  try {
    pendingTask = sessionStorage.getItem(TASK_CHANNEL);
    if (pendingTask) sessionStorage.removeItem(TASK_CHANNEL);
  } catch {
    /* 静默 */
  }
  if (pendingTask && pendingTask.trim()) {
    const task = pendingTask.trim();
    // 等待视图初始化稳定后再自动发送（120ms）
    window.setTimeout(() => {
      if (sending) return;
      const welcome = document.getElementById('welcomeBox');
      if (welcome) welcome.style.display = 'none';
      controller?.switchView('chat');
      // 输入框不填充任务文本：任务已由 sessionStorage 传递，直接发送
      sending = true;
      sendBtn.disabled = true;
      void controller!.sendTask(task).finally(() => {
        sending = false;
        sendBtn.disabled = false;
        input.focus();
      });
    }, 120);
  }

  void loadRuns();
}

void init();

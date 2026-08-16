import { esc } from './xss';

let toastTimer: number | null = null;

export function toast(msg: string, icon = '✓'): void {
  const el = document.getElementById('toast');
  if (!el) return;
  const inner = document.getElementById('toastText');
  if (inner) {
    inner.textContent = icon + ' ' + msg;
  } else {
    el.textContent = icon + ' ' + msg;
  }
  el.classList.add('on');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('on'), 2400);
}

/**
 * 抢占式事件绑定：legacy 脚本已把 onclick 行为绑定为原生监听器，
 * 这里通过 document 捕获阶段提前拦截，实现"真实 API 优先"。
 */
export function preempt(selector: string, handler: (el: HTMLElement, ev: Event) => void): void {
  document.addEventListener(
    'click',
    (ev) => {
      const t = ev.target as HTMLElement | null;
      if (!t || !t.closest) return;
      const el = t.closest(selector) as HTMLElement | null;
      if (!el) return;
      ev.preventDefault();
      ev.stopPropagation();
      handler(el, ev);
    },
    true,
  );
}

export function setText(sel: string, text: string): void {
  const el = document.querySelector(sel);
  if (el) el.textContent = text;
}

export function setHtml(sel: string, html: string): void {
  const el = document.querySelector(sel);
  if (el) el.innerHTML = html;
}

export function fill(sel: string, html: string): void {
  setHtml(sel, html);
}

export function hide(sel: string): void {
  const el = document.querySelector(sel);
  if (el) (el as HTMLElement).style.display = 'none';
}

export function show(sel: string, display = 'block'): void {
  const el = document.querySelector(sel);
  if (el) (el as HTMLElement).style.display = display;
}

export function btnBusy(btn: HTMLElement, busy: boolean, restoreText?: string): void {
  if (busy) {
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = '<span class="iconify" data-icon="ph:circle-notch"></span> 处理中…';
    btn.classList.add('disabled');
    (btn as HTMLButtonElement).disabled = true;
  } else {
    if (restoreText) btn.innerHTML = restoreText;
    else if (btn.dataset.orig) btn.innerHTML = btn.dataset.orig;
    btn.classList.remove('disabled');
    (btn as HTMLButtonElement).disabled = false;
  }
}

export function fixRoleLinks(): void {
  const map: Record<string, string> = {
    教师: 'teacher.html',
    教师端: 'teacher.html',
    学生: 'student.html',
    学生端: 'student.html',
    家长: 'parent.html',
    家长端: 'parent.html',
    管理: 'admin.html',
    管理端: 'admin.html',
  };
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href.includes('[object Object]')) {
      const label = a.textContent || '';
      const target = map[label] || map[label.replace(/端$/, '')];
      if (target) a.setAttribute('href', target);
    }
  });
}

/**
 * 跨端切换链接统一接入体验预览：链接追加 ?preview=1，
 * 目标页 guard 放行任意已登录角色（体验账号不因角色不匹配被弹回首页）。
 * 页面自身的角色入口（同角色访问）不加参数，保持正常守卫。
 */
export function fixPreviewLinks(currentRole: string): void {
  const rolePage: Record<string, string> = {
    teacher: 'teacher.html',
    student: 'student.html',
    parent: 'parent.html',
    admin: 'admin.html',
  };
  const roleName: Record<string, string> = { teacher: '教师', student: '学生', parent: '家长', admin: '管理' };
  const labelMatches = (label: string): boolean => {
    const clean = label.replace(/端$/, '').trim();
    return roleName[currentRole] === label || roleName[currentRole] === clean;
  };
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const target = Object.values(rolePage).find((p) => href === p || href.startsWith(p + '?') || href.startsWith(p + '#'));
    if (!target) return;
    const targetRole = Object.keys(rolePage).find((r) => rolePage[r] === target);
    const isSelf = targetRole === currentRole || labelMatches((a.textContent || '').trim());
    const u = new URL(href, location.href);
    if (isSelf) {
      if (a.classList) a.classList.add('on');
      u.searchParams.delete('preview');
    } else {
      u.searchParams.set('preview', '1');
    }
    a.setAttribute('href', u.pathname + u.search + u.hash);
  });
}

/** 体验预览提示条：跨角色浏览时提示可一键返回本人端 */
export function showPreviewBanner(role: string): void {
  const pageOf: Record<string, string> = { teacher: 'teacher.html', student: 'student.html', parent: 'parent.html', admin: 'admin.html' };
  const nameOf: Record<string, string> = { teacher: '教师', student: '学生', parent: '家长', admin: '管理' };
  const myPage = pageOf[role];
  const myName = nameOf[role] || role;
  if (document.getElementById('previewBanner')) return;
  const bar = document.createElement('div');
  bar.id = 'previewBanner';
  bar.style.cssText =
    'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:999;' +
    'display:flex;align-items:center;gap:10px;' +
    'background:#191b22;color:#fff;font-size:12.5px;font-weight:600;' +
    'padding:9px 14px 9px 16px;border-radius:99px;box-shadow:0 8px 24px rgba(0,0,0,.18);';
  bar.innerHTML =
    `<span style="width:7px;height:7px;border-radius:50%;background:#34D399;flex:none"></span>` +
    `体验预览 · 当前以「${nameOf[role] || role}」视角浏览` +
    (myPage ? `<a href="${myPage}" style="color:#fff;text-decoration:none;background:rgba(255,255,255,.16);padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700">返回${myName}端</a>` : '') +
    `<span style="cursor:pointer;color:#9aa1ad;font-size:13px;padding:0 2px" title="关闭">✕</span>`;
  bar.querySelector('span:last-child')?.addEventListener('click', () => bar.remove());
  document.body.appendChild(bar);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function tag(label: string, cls = ''): string {
  return `<span class="tag ${cls}">${esc(label)}</span>`;
}

export function statusText(status: string): string {
  const map: Record<string, string> = {
    new: '待处理',
    processing: '处理中',
    resolved: '已处置',
    done: '已完成',
    todo: '待办',
    ongoing: '进行中',
    planned: '已规划',
    archived: '已归档',
    draft: '草稿',
    published: '已发布',
    active: '进行中',
    wait: '待开始',
  };
  return map[status] || status;
}

export function escHtml(s: unknown): string {
  return esc(s);
}

export { esc };
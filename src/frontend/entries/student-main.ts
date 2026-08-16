import { requireRole, isPreviewMode, initialsOf } from '../core/guard';
import { get, post, upload, ApiError } from '../core/request';
import { setText, fill, hide, show, preempt, btnBusy, fixRoleLinks, fixPreviewLinks, showPreviewBanner, toast, esc, fmtDate } from '../core/ui';
import { SafeUser } from '../core/auth';

let socSession = 0;
let qaSession = 0;
let realInterestTags: string[] = [];
let practiceStepId = 0;

async function boot() {
  const user = await requireRole(['student'], { preview: isPreviewMode() });
  setUserCard(user);
  if (isPreviewMode()) showPreviewBanner(user.role);
  bindChats();
  bindCheckin();
  bindPhoto();
  bindReadDetail();
  bindInterestWizard();
  bindPractice();
  bindDiagActions();
  bindErrorsReview();
  bindVoicePractice();
  bindReadingPractice();
  bindCodeRun();
  bindFamilyVoice();
  bindExtras();

  const home = await loadHome(user);
  await Promise.all([
    loadPlan(),
    loadBooks(),
    loadErrors(),
    loadScores(),
    loadDiag(),
    loadCode(),
    loadMental(),
  ]);
  void home;
}

function setUserCard(user: SafeUser) {
  const name = user.displayName || '同学';
  setText('.stage-title', `乡芽 · 学生端 — ${name}的学习小屋`);
  setText('.hero-hi', `早上好，${name.charAt(0)}`);
  const heroName = document.querySelector('.hero-name') as HTMLElement | null;
  if (heroName) heroName.innerHTML = `${esc(name)}<b> 同学</b>`;
  setText('#view-me .me-name', name);
  const cls = document.querySelector('#view-me .me-sub') as HTMLElement | null;
  if (cls) cls.textContent = '五年级（1）班 · 云溪镇中心小学';
  const av = document.querySelector('#view-me .avatar') as HTMLElement | null;
  if (av) av.textContent = name.charAt(0);
  fixRoleLinks();
  fixPreviewLinks(user.role);
}

async function loadHome(user: SafeUser) {
  try {
    const h = await get<any>('/dashboard/home');
    const name = user.displayName || '同学';
    setText('.hero-hi', `${h.greeting || '早上好'}，${name.charAt(0)}`);
    if (h.checkin) {
      const big = document.querySelector('.hero-float .big');
      if (big) big.innerHTML = `${esc(h.checkin.streak || 0)}<span>天</span>`;
      setText('.hero-float .lab', '连续打卡');
      setText('#meStreak', String(h.checkin.streak || 0));
      const seed = document.getElementById('heroBadgeSeed');
      if (seed && h.badges?.length) seed.innerHTML = `<span class="iconify" data-icon="ph:plant"></span>种子徽章 ×${h.badges.length}`;
    }
    const meStats = document.querySelectorAll('#view-me .me-stat b');
    if (meStats.length >= 3 && h.stats) {
      (meStats[0] as HTMLElement).textContent = String(h.stats.points ?? 0);
      (meStats[1] as HTMLElement).textContent = String(h.stats.answersThisWeek ?? 0);
    }
    renderTaskList(h);
    renderBadges(h.badges);
    if (h.plan) {
      const dark = document.querySelector('#view-plan .pt > div:first-child');
      if (dark) {
        const title = dark.querySelector('div:nth-child(2)') as HTMLElement | null;
        if (title) title.textContent = h.plan.title || '本周学习计划';
        const bar = dark.querySelector('.progress i') as HTMLElement | null;
        if (bar) bar.style.width = Math.round((h.plan.progress || 0) * 100) + '%';
        const pct = dark.querySelector('span') as HTMLElement | null;
        if (pct) pct.textContent = Math.round((h.plan.progress || 0) * 100) + '%';
      }
    }
    return h;
  } catch (e) {
    console.warn('[home]', e);
    return null;
  }
}

function renderTaskList(h: any) {
  const box = document.getElementById('taskList');
  if (!box) return;
  const active = h.plan?.activeStep;
  let html = '';
  if (active) {
    html += `<div class="row-card" onclick="go('view-plan')">
      <div class="ric ric-orange"><span class="iconify" data-icon="ph:target"></span></div>
      <div style="flex:1"><div class="r-title">${esc(active.title)}</div><div class="r-sub">学习计划 · 今日练习</div></div>
      <span class="chip chip-orange">进行中</span>
      <span class="r-arrow iconify" data-icon="ph:caret-right"></span>
    </div>`;
  }
  if (h.homework?.length) {
    for (const t of h.homework.slice(0, 2)) {
      html += `<div class="row-card" onclick="go('view-plan')">
        <div class="ric ric-sky"><span class="iconify" data-icon="ph:clipboard-text"></span></div>
        <div style="flex:1"><div class="r-title">${esc(t.title)}</div><div class="r-sub">${esc(t.subject || '')} · 截止 ${esc((t.deadline || '').slice(5, 10) || '')}</div></div>
        <span class="chip chip-sky">待完成</span>
        <span class="r-arrow iconify" data-icon="ph:caret-right"></span>
      </div>`;
    }
  }
  if (html) box.innerHTML = html;
}

function renderBadges(badges: any[]) {
  if (!badges?.length) return;
  const me = document.getElementById('meBadges');
  const sheet = document.getElementById('sheetBadges');
  const icons: Record<string, string> = { streak7: 'ph:fire', book: 'ph:book-open', code: 'ph:code' };
  const got = badges.map(
    (b) => `<div class="badge"><div class="b-ico got"><span class="iconify" data-icon="${icons[b.code] || 'ph:medal'}"></span></div><div class="b-name got">${esc(b.name)}</div></div>`,
  );
  const lock = ['种下 10 棵', '连击 30 天', '编程通关', '满分挑战']
    .map((n) => `<div class="badge"><div class="b-ico lock"><span class="iconify" data-icon="ph:${n === '种下 10 棵' ? 'plant' : n === '连击 30 天' ? 'lightning' : n === '编程通关' ? 'rocket' : 'trophy'}"></span></div><div class="b-name">${n}</div></div>`)
    .join('');
  const all = got.join('') + lock;
  if (me) me.innerHTML = all;
  if (sheet) sheet.innerHTML = all;
  setText('#meBadgeCount', `种子徽章 ×${badges.length}`);
}

/* ================= 学习计划 ================= */

async function loadPlan() {
  try {
    const plans = await get<any[]>('/study-plan');
    if (!plans || !plans.length) return;
    const cur = plans.find((p) => p.weekNo === currentWeek()) || plans[plans.length - 1] || plans[0];
    const active = (cur.steps || []).find((s: any) => s.status === 'active');
    practiceStepId = active?.id ?? 0;
    const pt = document.querySelector('#view-plan .pt');
    if (!pt) return;
    const steps = (cur.steps || [])
      .map(
        (s: any) =>
          `<div class="path-step"><div class="path-dot ${s.status === 'done' ? 'done' : s.status === 'active' ? 'now' : 'wait'}">${s.status === 'done' ? '<span class="iconify" data-icon="ph:check"></span>' : esc(s.status === 'active' ? '' : s.id)}</div><div style="flex:1"><div class="r-title">${esc(s.title)}</div><div class="r-sub">${esc(stepMeta(s))}</div></div><span class="chip ${s.status === 'done' ? 'chip-green' : s.status === 'active' ? 'chip-orange' : 'chip-gray'}">${s.status === 'done' ? '掌握' : s.status === 'active' ? '进行中' : '待开始'}</span></div>`,
      )
      .join('');
    const dark = pt.querySelector('div:first-child');
    pt.innerHTML = dark ? dark.outerHTML + steps + `<button class="btn btn-orange" id="practiceBtn" style="margin-top:6px" onclick="toast('已为你重新生成练习题')"><span class="iconify" data-icon="ph:magic-wand"></span> 继续今日练习</button>` : steps;
  } catch (e) {
    console.warn('[plan]', e);
  }
}

function stepMeta(s: any): string {
  if (s.status === 'done') return `掌握度 ${Math.round((s.mastery || 0) * 100)}%`;
  if (s.status === 'active') return '今日练习中 · 完成后进入下一步';
  return '待开始';
}

function currentWeek(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

/* ================= 分级阅读 ================= */

async function loadBooks() {
  try {
    const books = await get<any[]>('/books');
    if (!books || !books.length) return;
    const pt = document.querySelector('#view-read .pt');
    if (!pt) return;
    const list = books
      .map(
        (b) =>
          `<div class="read-card" data-book="${esc(b.id)}" style="cursor:pointer"><div class="read-cover" style="background:linear-gradient(135deg,#0EA5E9,#6366F1)">${esc((b.title || '书').charAt(0))}</div><div class="read-info"><div class="read-title">《${esc(b.title)}》</div><div class="read-meta">级别 ${esc(b.level || '')} · ${esc(b.grade || '')} · ${esc(b.chapters ?? 0)} 章</div></div><span class="chip ${b.progress ? 'chip-orange' : 'chip-sky'}">${b.progress ? '继续读' : '未开始'}</span></div>`,
      )
      .join('');
    const qa = pt.querySelector('.section-title, .card-pad') ? `<div style="margin-top:14px"><div class="section-title" style="margin-top:6px"><span class="iconify" data-icon="ph:question"></span>读完答一答</div><div class="card card-pad"><div style="font-size:12.5px;color:var(--muted);line-height:1.7">在书籍详情页完成读后问答，可获取阅读积分。</div></div></div>` : '';
    pt.insertAdjacentHTML('afterbegin', list + qa);
    pt.querySelectorAll('.read-card[data-book]').forEach((el) => {
      el.addEventListener('click', () => void openBook(Number((el as HTMLElement).dataset.book)));
    });
  } catch (e) {
    console.warn('[books]', e);
  }
}

async function openBook(bookId: number) {
  try {
    const b = await get<any>('/books/' + bookId);
    go('view-read-detail');
    const h2 = document.querySelector('#view-read-detail .navhead h2');
    if (h2) h2.textContent = '《' + b.title + '》';
    const wrap = document.querySelector('#view-read-detail > div:last-child');
    if (!wrap) return;
    const chapters = (b.content || [])
      .map((c: any) => `<p style="margin-top:10px"><b>第${esc(c.chapter)}章 · ${esc(c.title)}</b></p><p style="margin-top:4px">${esc(c.text || '')}</p>`)
      .join('');
    let quizHtml = '';
    let quiz: any[] = [];
    try {
      quiz = typeof b.quiz === 'string' ? JSON.parse(b.quiz) : (b.quiz || []);
    } catch {
      quiz = [];
    }
    if (quiz.length) {
      quizHtml = quiz
        .map(
          (q, qi) =>
            `<div class="card card-pad" style="margin-top:14px"><div style="font-size:13px;font-weight:800;line-height:1.7">${esc(q.q)}</div><div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">${(q.options || [])
              .map(
                (o: string, oi: number) =>
                  `<button class="q-opt" data-book="${esc(bookId)}" data-q="${esc(qi)}" data-a="${esc(oi)}"><span class="iconify" data-icon="ph:${oi === (q.answer ?? 0) ? 'check' : 'x'}"></span>${esc(o)}</button>`,
              )
              .join('')}</div></div>`,
        )
        .join('');
    }
    wrap.innerHTML =
      `<div class="book-page">` +
      chapters +
      `</div>` +
      `<div style="display:flex;gap:10px;margin-top:14px"><button class="btn btn-orange btn-sm" data-finish-book="${esc(bookId)}"><span class="iconify" data-icon="ph:bookmark-simple"></span> 读完本章</button><button class="btn btn-ghost btn-sm" id="readAloudBtn"><span class="iconify" data-icon="ph:speaker-high"></span> 听朗读</button></div>` +
      quizHtml;
    const finish = wrap.querySelector('[data-finish-book]');
    if (finish) {
      finish.addEventListener('click', () => {
        void (async () => {
          try {
            await post('/reading-progress', { bookId, minutes: 10 });
            toast('阅读进度已保存');
          } catch (e: any) {
            toast(e?.message || '保存失败');
          }
        })();
      });
    }
    const quizAnswers: (number | null)[] = quiz.map(() => null);
    wrap.querySelectorAll('.q-opt[data-book]').forEach((el) => {
      el.addEventListener('click', () => {
        const qi = Number((el as HTMLElement).dataset.q);
        const picked = Number((el as HTMLElement).dataset.a);
        if (quizAnswers[qi] != null) return;
        quizAnswers[qi] = picked;
        (el as HTMLElement).style.borderColor = '#F97316';
        (el as HTMLElement).style.background = '#FFF7ED';
        if (quizAnswers.every((v) => v != null)) {
          void (async () => {
            try {
              const r = await post<any>('/reading-quiz', { bookId, answers: quizAnswers as number[] });
              toast(r.passed ? `答对 ${r.correct}/${r.total} 题，通过！阅读积分已入账` : `答对 ${r.correct}/${r.total} 题，再读一遍试试`);
            } catch (e: any) {
              toast(e?.message || '提交失败');
            }
          })();
        } else {
          toast('已选择，继续答其余问题');
        }
      });
    });
  } catch (e: any) {
    toast(e?.message || '加载书籍失败');
  }
}

/* ================= 打卡 ================= */

function bindCheckin() {
  preempt('#view-learn .btn-primary', (btn) => {
    void (async () => {
      try {
        await post('/checkins', { note: '今日学习打卡' });
        btn.innerHTML = '<span class="iconify" data-icon="ph:check-circle"></span> 今日已打卡 · +10 积分';
        btn.style.background = '#10B981';
        toast('打卡成功！');
        refreshCheckinDots();
      } catch (e: any) {
        toast(e?.message || '打卡失败');
      }
    })();
  });
}

async function refreshCheckinDots() {
  try {
    const m = await get<any>('/checkins/month?month=' + monthOf(new Date()));
    const today = todayStr();
    const dots = document.querySelectorAll('#view-learn .path-dot');
    dots.forEach((d, i) => {
      const date = weekDate(i);
      if (date === today) {
        d.className = 'path-dot ' + (m.days?.includes(today) ? 'done' : 'now');
        if (m.days?.includes(today)) d.innerHTML = '<span class="iconify" data-icon="ph:check"></span>';
      }
    });
  } catch {
    /* noop */
  }
}

function monthOf(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekDate(index: number): string {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1 + index);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

/* ================= 辅导 / 问答（真实会话） ================= */

function bindChats() {
  preempt('#view-soc .send', (btn) => {
    const input = document.getElementById('socInput') as HTMLInputElement;
    const q = (input?.value || '').trim();
    if (q) void sendChat('soc', q);
    if (input) input.value = '';
  });
  preempt('#view-qa .send', (btn) => {
    const input = document.getElementById('qaInput') as HTMLInputElement;
    const q = (input?.value || '').trim();
    if (q) void sendChat('qa', q);
    if (input) input.value = '';
  });
  (window as any).socAsk = (q: string) => {
    const input = document.getElementById('socInput') as HTMLInputElement;
    if (input) input.value = q;
    void sendChat('soc', q);
  };
}

async function sendChat(kind: 'soc' | 'qa', q: string) {
  const chatId = kind === 'soc' ? 'socChat' : 'qaChat';
  const sessionPath = kind === 'soc' ? '/tutor/sessions' : '/qa/sessions';
  const msgPath = kind === 'soc' ? '/tutor/sessions/' : '/qa/sessions/';
  const chat = document.getElementById(chatId);
  if (!chat) return;
  if (!(kind === 'soc' ? socSession : qaSession)) {
    try {
      const s = await post<any>(sessionPath, {});
      if (kind === 'soc') socSession = s.id;
      else qaSession = s.id;
    } catch (e: any) {
      toast(e?.message || '会话创建失败');
      return;
    }
  }
  appendMsg(chat, 'me', q);
  const typing = typingEl();
  chat.appendChild(typing);
  chat.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try {
    const res = await post<any>(msgPath + (kind === 'soc' ? socSession : qaSession) + '/messages', { content: q });
    chat.removeChild(typing);
    const reply = res?.reply || {};
    const refs = reply.refs || [];
    const refHtml = refs.length
      ? '<div class="hint"><span class="iconify" data-icon="ph:book-open"></span>' +
        refs
          .map((r: any) => esc(r.title || r.source || ''))
          .join(' · ')
          .slice(0, 120) +
        '</div>'
      : '';
    appendHtml(chat, 'ai', esc(reply.content || '') + refHtml);
    chat.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e: any) {
    chat.removeChild(typing);
    toast(e?.message || '发送失败');
  }
}

function appendMsg(chat: HTMLElement, who: 'me' | 'ai', text: string): void {
  appendHtml(chat, who, esc(text));
}

function appendHtml(chat: HTMLElement, who: 'me' | 'ai', inner: string): void {
  const d = document.createElement('div');
  d.className = 'msg ' + who;
  d.innerHTML =
    '<div class="ava"><span class="iconify" data-icon="ph:' + (who === 'me' ? 'student' : 'robot') + '"></span></div><div class="bub">' +
    inner +
    '</div>';
  chat.appendChild(d);
}

function typingEl(): HTMLElement {
  const d = document.createElement('div');
  d.className = 'msg ai';
  d.innerHTML = '<div class="ava"><span class="iconify" data-icon="ph:robot"></span></div><div class="bub"><span class="typing-dots"><i></i><i></i><i></i></span></div>';
  return d;
}

/* ================= 拍照作业（真实上传 OCR） ================= */

function bindPhoto() {
  preempt('#view-photo [onclick], #view-photo div[style*="cursor:pointer"]', (zone) => {
    void (async () => {
      const file = await pickFile();
      if (!file) return;
      try {
        const fd = new FormData();
        fd.append('file', file);
        const up = await upload<any>('/files/upload?category=document', fd);
        const ocr = await post<any>('/files/ocr?fileId=' + up.id, {});
        zone.style.display = 'none';
        const r = document.getElementById('photoResult');
        if (r) {
          r.style.display = 'block';
          const textBox = r.querySelector('.bub, p') as HTMLElement | null;
          if (textBox) textBox.textContent = ocr.text || '未识别出文字';
        }
        toast('识别完成');
      } catch (e: any) {
        toast(e?.message || '识别失败');
      }
    })();
  });
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf,.doc,.docx,.txt';
    input.style.display = 'none';
    input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null));
    document.body.appendChild(input);
    input.click();
    input.addEventListener('blur', () => window.setTimeout(() => input.remove(), 1000));
  });
}

/* ================= 错题本 ================= */

async function loadErrors() {
  try {
    const errs = await get<any[]>('/error-book');
    const pt = document.querySelector('#view-errors .pt');
    if (!pt) return;
    const total = errs?.length || 0;
    const pending = (errs || []).filter((e) => !e.mastered).length;
    const mastered = (errs || []).filter((e) => e.mastered).length;
    const setNum = (id: string, v: number) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(v);
    };
    setNum('errTotal', total);
    setNum('errPending', pending);
    setNum('errMastered', mastered);
    const btn = document.getElementById('errReviewBtn');
    if (btn) {
      const label = btn.querySelector('span');
      btn.innerHTML = `<span class="iconify" data-icon="ph:magic-wand"></span> 智能复习这 ${pending || 0} 题`;
      if (label) btn.appendChild(label);
    }
    if (errs && errs.length) {
      document.querySelectorAll('#view-errors .err-static').forEach((el) => ((el as HTMLElement).style.display = 'none'));
      pt.insertAdjacentHTML(
        'afterbegin',
        errs
          .slice(0, 5)
          .map(
            (e) =>
              `<div class="card card-tap" style="margin-bottom:10px;padding:14px 15px" onclick="go('view-errors')"><div style="font-size:13px;line-height:1.8">${esc(e.stem)}</div><div style="font-size:12px;color:var(--muted);margin-top:8px">你的答案：${esc(e.wrongAnswer || '—')} · 正确答案：${esc(e.answer || '—')}</div><div style="font-size:12px;color:var(--rose);margin-top:4px">错因：${esc(e.errorType || '')}</div></div>`,
          )
          .join(''),
      );
    }
  } catch (e) {
    console.warn('[errors]', e);
  }
}

/* ================= 听说/朗读分数 ================= */

async function loadScores() {
  try {
    const [v, r] = await Promise.all([
      get<any>('/voice-practice/score'),
      get<any>('/reading-practice/score'),
    ]);
    if (v) {
      const today = document.getElementById('engTodayScore');
      if (today) today.textContent = String(Math.round(v.avgScore ?? 0));
      const days = document.getElementById('engDays');
      if (days && v.count) days.textContent = String(Math.min(999, v.count));
    }
    const rows = document.querySelectorAll('#view-eng .audio-row, #view-cn .audio-row, .audio-row');
    const row0 = rows[0];
    if (row0) {
      const score = row0.querySelector('.score-big') as HTMLElement | null;
      if (score) score.textContent = String(Math.round(v?.avgScore ?? 0));
      const meta = row0.querySelector('.r-sub, div[style*="flex:1"] div:last-child') as HTMLElement | null;
      if (meta && v) meta.textContent = `练习 ${v.count ?? 0} 次 · 流畅度 ${Math.round(v.avgFluency ?? 0)} · 准确度 ${Math.round(v.avgAccuracy ?? 0)}`;
    }
    const row1 = rows[1];
    if (row1) {
      const score = row1.querySelector('.score-big') as HTMLElement | null;
      if (score) score.textContent = String(Math.round(r?.avgScore ?? 0));
      const meta = row1.querySelector('.r-sub, div[style*="flex:1"] div:last-child') as HTMLElement | null;
      if (meta && r) meta.textContent = `已练习 ${r.count ?? 0} 次 · 最近 ${fmtDate(r.latest?.practicedAt)}`;
    }
    if (r) {
      const last = document.getElementById('readLastScore');
      if (last) last.textContent = `上次评测：${Math.round(r.avgScore ?? 0)} 分`;
      const box = document.getElementById('readLastBox');
      if (box && r.latest) {
        const sub = box.querySelector('div:last-child') as HTMLElement | null;
        if (sub) sub.textContent = `共练习 ${r.count} 次 · 流畅度 ${r.avgScore} 分 · 薄弱音：${esc((r.latest.weakSyllables || []).join('、') || '暂无')}`;
      }
    }
  } catch (e) {
    console.warn('[scores]', e);
  }
}

/* ================= 诊断 ================= */

async function loadDiag() {
  try {
    const d = await get<any>('/diagnosis/latest');
    if (!d) return;
    const score = document.querySelector('#view-diag .diag-score') as HTMLElement | null;
    if (score) score.textContent = String(Math.round(d.overallMastery ?? 0));
    const summary = document.querySelector('#view-diag .diag-hero div:last-child, #view-diag .diag-hero') as HTMLElement | null;
    if (summary) summary.textContent = d.summary || '';
    const conf = document.querySelector('#view-diag .confi-bar i') as HTMLElement | null;
    if (conf) conf.style.width = Math.round((d.confidence ?? 0) * 100) + '%';
    const confVal = document.querySelector('#view-diag .confi-bar .lbl:last-child') as HTMLElement | null;
    if (confVal) confVal.textContent = Math.round((d.confidence ?? 0) * 100) + '%';
    const heroConf = document.querySelector('#view-diag .diag-hero div[style*="rgba"] div:first-child') as HTMLElement | null;
    if (heroConf) heroConf.textContent = Math.round((d.confidence ?? 0) * 100) + '%';
    if (d.dims?.length) {
      const box = document.getElementById('diagDims');
      if (box) {
        box.innerHTML = d.dims
          .slice(0, 6)
          .map((x: any) => {
            const m = x.mastery ?? 0;
            const color = m < 60 ? 'linear-gradient(90deg,#F43F5E,#FB7185)' : m < 80 ? 'linear-gradient(90deg,#F97316,#FB923C)' : 'linear-gradient(90deg,#10B981,#34D399)';
            const valColor = m < 60 ? 'var(--rose)' : m < 80 ? 'var(--orange)' : 'var(--green)';
            return `<div class="dim-row"><div class="dim-name">${esc(x.name)}</div><div class="dim-track"><i style="width:${m}%;background:${color}"></i></div><div class="dim-val" style="color:${valColor}">${m}%</div></div>`;
          })
          .join('');
      }
    }
  } catch (e) {
    console.warn('[diag]', e);
  }
}

/* ================= 编程 ================= */

async function loadCode() {
  try {
    const d = await get<any>('/code/tasks');
    const pt = document.querySelector('#view-code .pt');
    if (!pt || !d?.tasks?.length) return;
    pt.insertAdjacentHTML(
      'afterbegin',
      `<div style="font-size:11px;color:var(--muted);margin-bottom:8px">当前关卡 ${esc(d.current?.level ?? 1)} · 已获 ${esc(d.current?.stars ?? 0)} 星</div>` +
        d.tasks
          .map(
            (t: any) =>
              `<div class="card" style="margin-bottom:10px;display:flex;align-items:center;gap:12px"><div class="ric ric-green"><span class="iconify" data-icon="ph:code"></span></div><div style="flex:1"><div class="r-title">${esc(t.name)}</div><div class="r-sub">${esc(t.desc)}</div></div><span class="chip ${t.id === d.current?.taskId ? 'chip-orange' : 'chip-gray'}">${t.id === d.current?.taskId ? '进行中' : '待挑战'}</span></div>`,
          )
          .join(''),
    );
    const lvl = document.getElementById('codeLevel');
    if (lvl) lvl.textContent = `第 ${d.current?.level ?? 1} 关 · 闯关进行中`;
  } catch (e) {
    console.warn('[code]', e);
  }
}

/* ================= 兴趣画像（真实生成） ================= */

function bindInterestWizard() {
  preempt('#fzNext', (btn) => {
    void (async () => {
      let step = 0;
      try {
        step = (0, eval)('fzState.step');
      } catch {
        step = 0;
      }
      if (step === 2) {
        let picks: string[] = [];
        try {
          picks = (0, eval)('fzState.picks') || [];
        } catch {
          picks = [];
        }
        const names: Record<string, string> = { code: '编程', art: '画画', music: '音乐', science: '科学实验', hand: '手工', sport: '运动' };
        const interests = picks.map((k: string) => names[k] || k);
        try {
          const res = await post<any>('/interest/profile', { interests });
          realInterestTags = res?.tags || res?.interests || interests;
        } catch (e: any) {
          realInterestTags = interests;
          toast(e?.message || '画像保存失败，已使用本地结果');
        }
      }
      const legacyFzNext = (0, eval)('fzNext');
      if (typeof legacyFzNext === 'function') legacyFzNext();
    })();
  });
  (window as any).finishFind = () => {
    go('view-interest');
    renderInterestProfile();
  };
}

function renderInterestProfile() {
  const entry = document.getElementById('findEntry');
  const prof = document.getElementById('interestProfile');
  if (entry) entry.style.display = 'none';
  if (prof) {
    prof.style.display = 'flex';
    const tags = prof.querySelector('.pr-tags');
    if (tags) tags.innerHTML = realInterestTags.map((t) => '<span class="fz-tag">' + esc(t) + '</span>').join('');
  }
  toast('兴趣画像已生成');
}

/* ================= P2 家长陪伴：语音留言（孩子→家长） ================= */

async function loadFamilyVoice() {
  const list = document.getElementById('famVoiceList');
  if (!list) return;
  try {
    const v = await get<any>('/voice-messages');
    const all = [
      ...(v?.received || []).map((m: any) => ({ ...m, dir: 'in' })),
      ...(v?.sent || []).map((m: any) => ({ ...m, dir: 'out' })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    list.innerHTML = all.length
      ? all.map((m) => famBubble(m)).join('')
      : '<div style="text-align:center;color:var(--muted);font-size:12.5px;padding:22px 0">还没有留言，给爸爸妈妈发第一句吧～</div>';
  } catch (e) {
    console.warn('[famVoice]', e);
  }
}

function famBubble(m: any) {
  const out = m.dir === 'out';
  return `<div style="display:flex;justify-content:${out ? 'flex-end' : 'flex-start'};margin-bottom:10px"><div style="max-width:78%;background:${out ? 'var(--orange)' : '#F3F4F6'};color:${out ? '#fff' : '#333'};border-radius:14px 14px ${out ? '2px' : '14px'} 14px;padding:9px 12px;font-size:12.5px;line-height:1.7"><div>${esc(m.text || '🎤 语音留言')}</div><div style="font-size:10px;opacity:.6;margin-top:3px">${fmtDate(m.createdAt)}${out && m.read ? ' · 已读' : ''}</div></div></div>`;
}

function bindFamilyVoice() {
  preempt('#famVoiceSend', (btn) => {
    const inp = document.getElementById('famVoiceInput') as HTMLInputElement | null;
    const text = (inp?.value || '').trim();
    if (!text) {
      toast('先写一句话再发送哦');
      return;
    }
    void (async () => {
      btnBusy(btn, true);
      try {
        const r = await post<any>('/voice-messages', { text, target: 'student' });
        if (inp) inp.value = '';
        toast(r.ack || '留言已送达爸妈的家长端');
        void loadFamilyVoice();
      } catch (e: any) {
        toast(e?.message || '发送失败');
      } finally {
        btnBusy(btn, false);
      }
    })();
  });
}

function go(id: string): void {
  const fn = (window as any).go;
  if (typeof fn === 'function') fn(id);
  if (id === 'view-family') void loadFamilyVoice();
}

/* ================= 朗读 TTS（Web Speech API，真实发音） ================= */

function speakText(text: string, done?: () => void): void {
  const t = text.replace(/\s+/g, ' ').slice(0, 400);
  if (!t || !('speechSynthesis' in window)) {
    toast('当前浏览器不支持语音朗读');
    return;
  }
  const utter = new SpeechSynthesisUtterance(t);
  utter.lang = 'zh-CN';
  utter.rate = 0.95;
  utter.pitch = 1.05;
  const pick = window.speechSynthesis.getVoices().find((v) => /zh|Chinese/i.test(v.lang) || /zh/i.test(v.name));
  if (pick) utter.voice = pick;
  if (done) utter.onend = done;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

/* ================= 设置项 / 兴趣卡片 真实闭环 ================= */

function bindExtras() {
  preempt('#readAloudBtn', () => {
    const page = document.querySelector('#view-read-detail .book-page');
    const text = page ? page.textContent || '' : '';
    if (!text) {
      toast('暂无朗读内容');
      return;
    }
    speakText(text, () => toast('朗读完成'));
    toast('正在为你朗读…');
  });

  preempt('#listenDemoBtn', () => {
    const card = document.querySelector('#view-cn .card');
    const text = card ? (card.textContent || '').slice(0, 80) : '《山行》杜牧。远上寒山石径斜，白云生处有人家。停车坐爱枫林晚，霜叶红于二月花。';
    speakText(text, () => toast('示范朗读完成'));
    toast('正在播放标准示范…');
  });

  preempt('#photoPracticeBtn', (btn) => {
    const r = document.getElementById('photoResult');
    const text = r?.querySelector('.bub, p')?.textContent?.trim() || '';
    if (!text) {
      toast('先完成拍照识别');
      return;
    }
    go('view-soc');
    setTimeout(() => {
      (window as any).socAsk?.(`题目：${text}。请先引导我解答，再出 2 道同类练习题帮我巩固。`);
    }, 300);
    toast('已交给辅导老师出同类练习');
  });

  const interests: Record<string, string> = {
    cardCode: '少儿编程', cardArt: '画画', cardMusic: '音乐',
    cardScience: '科学实验', cardHand: '手工',
  };
  for (const [id, label] of Object.entries(interests)) {
    document.getElementById(id)?.addEventListener('click', () => {
      go('view-soc');
      setTimeout(() => {
        (window as any).socAsk?.(`我对${label}很感兴趣，可以带我入门，帮我找点好玩的练习吗？`);
      }, 300);
    });
  }

  preempt('#mentorCard', () => {
    go('view-soc');
    setTimeout(() => {
      (window as any).socAsk?.('我想学点新东西，帮我推荐适合我的兴趣方向吧');
    }, 300);
  });

  preempt('#familyRow', () => go('view-family'));

  preempt('#eyeCareRow', (el) => {
    const on = document.body.classList.toggle('eye-care');
    const sw = document.getElementById('eyeCareSwitch');
    if (sw) sw.classList.toggle('on', on);
    try {
      localStorage.setItem('xy_eyecare', on ? '1' : '0');
    } catch { /* noop */ }
    toast(on ? '护眼模式已开启' : '护眼模式已关闭');
  });

  preempt('#helpRow', () => {
    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,15,20,.55);z-index:200;display:flex;align-items:flex-end;justify-content:center';
    mask.innerHTML =
      `<div style="width:375px;max-height:70vh;overflow-y:auto;background:#fff;border-radius:22px 22px 0 0;padding:22px 20px 34px;animation:sheetIn .3s cubic-bezier(.2,.9,.3,1)">
        <div style="width:38px;height:4px;border-radius:4px;background:#e5e5e7;margin:0 auto 18px"></div>
        <div style="font-size:16px;font-weight:900;display:flex;align-items:center;gap:8px"><span class="iconify" data-icon="ph:lifebuoy" style="color:var(--rose)"></span>心理求助渠道</div>
        <div style="font-size:11.5px;color:var(--faint);margin-top:5px">遇到困扰时，以下渠道随时可以求助 · 全程保密</div>
        <div class="card card-pad" style="margin-top:16px">
          <div style="display:flex;align-items:center;gap:12px"><div class="ric ric-rose"><span class="iconify" data-icon="ph:phone-call"></span></div><div style="flex:1"><div class="r-title">12355 青少年服务台</div><div class="r-sub">电话免费 · 24 小时心理咨询</div></div><a class="btn btn-orange btn-sm" href="tel:12355">拨打</a></div>
        </div>
        <div class="card card-pad" style="margin-top:12px">
          <div style="display:flex;align-items:center;gap:12px"><div class="ric ric-orange"><span class="iconify" data-icon="ph:user-circle"></span></div><div style="flex:1"><div class="r-title">学校心理老师 · 王老师</div><div class="r-sub">每周三下午 · 教学楼 3 层心理辅导室</div></div><button class="btn btn-ghost btn-sm" id="helpTalkBtn">去找老师</button></div>
        </div>
        <button class="btn btn-primary" style="margin-top:16px" id="helpCloseBtn">我知道了</button>
      </div>`;
    document.body.appendChild(mask);
    mask.addEventListener('click', (ev) => {
      if (ev.target === mask) mask.remove();
    });
    mask.querySelector('#helpCloseBtn')!.addEventListener('click', () => mask.remove());
    const talk = mask.querySelector('#helpTalkBtn') as HTMLButtonElement;
    talk.addEventListener('click', () => {
      mask.remove();
      go('view-soc');
      setTimeout(() => (window as any).socAsk?.('我最近有点小烦恼，想和老师聊聊，可以吗？'), 300);
    });
  });

  // 恢复护眼模式
  try {
    if (localStorage.getItem('xy_eyecare') === '1') {
      document.body.classList.add('eye-care');
      document.getElementById('eyeCareSwitch')?.classList.add('on');
    }
  } catch { /* noop */ }
}

/* ================= S6 练习闭环（取题→作答→计划回流） ================= */

function bindPractice() {
  preempt('#practiceBtn', (btn) => {
    void (async () => {
      try {
        const qs = await get<any[]>('/practice/questions?count=3&subject=数学');
        if (!qs?.length) {
          toast('题库暂无题目，请稍后再试');
          return;
        }
        startPracticeFlow(qs);
      } catch (e: any) {
        toast(e?.message || '练习加载失败');
      }
    })();
  });
}

function startPracticeFlow(qs: any[]) {
  const mask = document.createElement('div');
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(15,15,20,.6);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)';
  const card = document.createElement('div');
  card.style.cssText = 'width:340px;max-height:74vh;overflow-y:auto;background:#fff;border-radius:18px;padding:18px 16px';
  mask.appendChild(card);
  document.body.appendChild(mask);
  const state = { qs, idx: 0, correctCount: 0, lock: false };

  const submit = async (ans: string) => {
    if (state.lock) return;
    const q = state.qs[state.idx];
    if (!ans) {
      toast('先输入答案再提交哦');
      return;
    }
    state.lock = true;
    try {
      const r = await post<any>('/answers', { questionId: q.id, answer: ans, source: 'plan' });
      if (r.isCorrect) state.correctCount++;
      card.innerHTML =
        `<div style="text-align:center;padding:18px 6px">` +
        `<div style="font-size:34px;line-height:1"><span class="iconify" data-icon="ph:${r.isCorrect ? 'confetti' : 'lightbulb'}"></span></div>` +
        `<div style="font-size:15px;font-weight:900;margin-top:10px">${r.isCorrect ? '答对了！+5 积分' : '没关系，看看解析'}</div>` +
        `<div style="font-size:12.5px;color:var(--muted);line-height:1.8;margin-top:8px;background:#f7f7f7;border-radius:12px;padding:12px">${esc(q.analysis || '')}</div>` +
        `<button class="btn btn-orange" style="margin-top:14px" id="pNext">${state.idx + 1 >= state.qs.length ? '完成练习' : '下一题'}</button>` +
        `</div>`;
      card.querySelector('#pNext')!.addEventListener('click', () => {
        state.idx++;
        if (state.idx >= state.qs.length) {
          void finish();
        } else {
          state.lock = false;
          render();
        }
      });
    } catch (e: any) {
      state.lock = false;
      toast(e?.message || '提交失败');
    }
  };

  const finish = async () => {
    const total = state.qs.length;
    const pass = state.correctCount >= Math.ceil(total / 2);
    if (practiceStepId) {
      try {
        await post('/study-plan/steps/' + practiceStepId + '/answer', { correct: pass });
      } catch { /* noop */ }
    }
    card.innerHTML =
      `<div style="text-align:center;padding:18px 6px">` +
      `<div style="font-size:15px;font-weight:900">练习完成</div>` +
      `<div style="font-size:12.5px;color:var(--muted);line-height:1.8;margin-top:8px">答对 ${state.correctCount}/${total} 题${pass ? '，计划进度已更新！' : '，明天再巩固一下'}</div>` +
      `<button class="btn btn-orange" style="margin-top:14px" id="pClose">完成</button></div>`;
    card.querySelector('#pClose')!.addEventListener('click', () => {
      mask.remove();
      loadPlan();
      loadErrors();
      void loadDiag();
    });
  };

  const render = () => {
    const q = state.qs[state.idx];
    const opts = (q.options || []).map((o: string, i: number) => `<button class="q-opt" data-i="${i}"><span class="iconify" data-icon="ph:circle"></span>${esc(o)}</button>`).join('');
    card.innerHTML =
      `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><div style="font-size:14px;font-weight:900">今日练习 · ${state.idx + 1}/${state.qs.length}</div><span class="chip chip-orange">${esc(q.subject || '')} · 已对 ${state.correctCount}</span></div>` +
      `<div style="font-size:13.5px;font-weight:700;line-height:1.8;margin-bottom:12px">${esc(q.stem)}</div>` +
      (opts || `<input id="pFree" style="width:100%;border:1.5px solid var(--line);border-radius:12px;padding:11px 14px;font-size:13px;font-family:var(--font);box-sizing:border-box" placeholder="输入你的答案…">`);
    if (opts) {
      card.querySelectorAll('.q-opt').forEach((b) => {
        b.addEventListener('click', () => {
          void submit(String.fromCharCode(65 + Number((b as HTMLElement).dataset.i)));
        });
      });
    } else {
      const inp = card.querySelector('#pFree') as HTMLInputElement | null;
      const goBtn = document.createElement('button');
      goBtn.className = 'btn btn-orange';
      goBtn.style.cssText = 'margin-top:12px';
      goBtn.textContent = '提交答案';
      goBtn.addEventListener('click', () => void submit(inp?.value.trim() || ''));
      card.appendChild(goBtn);
    }
  };

  render();
}

/* ================= S3 诊断触发 ================= */

function bindDiagActions() {
  preempt('#diagReportBtn', (btn) => {
    void (async () => {
      btnBusy(btn, true);
      try {
        const d = await post<any>('/diagnosis/run', {});
        toast(`诊断完成：整体掌握度 ${d.overallMastery}%`);
        void loadDiag();
      } catch (e: any) {
        toast(e?.message || '诊断失败');
      } finally {
        btnBusy(btn, false);
      }
    })();
  });
  preempt('#diagPlanBtn', (btn) => {
    void (async () => {
      btnBusy(btn, true);
      try {
        await post('/study-plan/generate', { title: '本周强化计划' });
        toast('强化计划已生成');
        go('view-plan');
        void loadPlan();
      } catch (e: any) {
        toast(e?.message || '生成失败');
      } finally {
        btnBusy(btn, false);
      }
    })();
  });
}

/* ================= S5 错题智能复习 ================= */

function bindErrorsReview() {
  preempt('#errReviewBtn', (btn) => {
    void (async () => {
      btnBusy(btn, true);
      try {
        const plan = await get<any[]>('/error-book/review-plan');
        if (!plan?.length) {
          toast('没有待复习的错题');
          return;
        }
        const pt = document.querySelector('#view-errors .pt');
        const rows = plan
          .map(
            (r) =>
              `<div class="err-card" style="cursor:pointer" data-error="${esc(r.errorId)}"><div class="err-head"><span class="iconify" data-icon="ph:calendar-check" style="color:var(--green)"></span> ${esc(r.day)} · 第 ${esc(r.order)} 项</div><div style="font-size:13px;line-height:1.7">${esc(r.task)}</div></div>`,
          )
          .join('');
        const box = document.createElement('div');
        box.id = 'errPlanBox';
        box.innerHTML = `<div class="section-title" style="margin-top:4px"><span class="iconify" data-icon="ph:calendar-check"></span>智能复习计划（点击标记掌握）</div>${rows}`;
        pt?.querySelector('#errPlanBox')?.remove();
        pt?.appendChild(box);
        box.querySelectorAll('[data-error]').forEach((el) => {
          el.addEventListener('click', () => {
            void (async () => {
              try {
                await post('/error-book/' + (el as HTMLElement).dataset.error + '/review', { mastered: true });
                el.remove();
                toast('已掌握，错题本已更新');
                void loadErrors();
              } catch (e: any) {
                toast(e?.message || '操作失败');
              }
            })();
          });
        });
        toast(`已生成 ${plan.length} 项复习计划`);
      } catch (e: any) {
        toast(e?.message || '生成失败');
      } finally {
        btnBusy(btn, false);
      }
    })();
  });
}

/* ================= S8/S9 录音评测提交 ================= */

function bindVoicePractice() {
  preempt('#voiceNextBtn', (btn) => {
    void (async () => {
      btnBusy(btn, true);
      try {
        const r = await post<any>('/voice-practice', { sentence: 'My weekend is fun.' });
        const score = document.querySelector('#view-eng .audio-row .score-big') as HTMLElement | null;
        if (score) score.textContent = String(r.score);
        toast(`跟读完成 · 评分 ${r.score} 分`);
        void loadScores();
      } catch (e: any) {
        toast(e?.message || '评测失败');
      } finally {
        btnBusy(btn, false);
      }
    })();
  });
}

function bindReadingPractice() {
  preempt('#readEvalBtn', (btn) => {
    void (async () => {
      btnBusy(btn, true);
      try {
        const r = await post<any>('/reading-practice', { poem: '《山行》杜牧' });
        const box = document.querySelector('#view-cn div[style*="FFF9F0"]') as HTMLElement | null;
        if (box) {
          const t = box.querySelector('div[style*="12px"]') as HTMLElement | null;
          if (t) t.textContent = `上次评测：${r.score} 分`;
        }
        toast(`朗读评测完成 · ${r.score} 分`);
        void loadScores();
      } catch (e: any) {
        toast(e?.message || '评测失败');
      } finally {
        btnBusy(btn, false);
      }
    })();
  });
}

/* ================= S11 心理轻提醒 ================= */

async function loadMental() {
  try {
    const m = await get<any>('/mental/light-reminder');
    const card = document.getElementById('mentalCard');
    if (!card || !m) return;
    const title = document.getElementById('mentalTitle');
    const body = document.getElementById('mentalBody');
    if (title) title.textContent = m.title || '暖暖的小提醒';
    if (body) body.textContent = m.advice || '';
  } catch (e) {
    console.warn('[mental]', e);
  }
}

/* ================= S12 编程运行 ================= */

function bindCodeRun() {
  preempt('#codeRunBtn', (btn) => {
    void (async () => {
      btnBusy(btn, true);
      try {
        const r = await post<any>('/code/run', { script: '前进 前进 前进', taskId: 1 });
        if (r.passed) {
          toast('运行成功！小明到家了 +10 积分');
        } else {
          toast(r.output || '没到家，试试调整指令');
        }
        void loadCode();
      } catch (e: any) {
        toast(e?.message || '运行失败');
      } finally {
        btnBusy(btn, false);
      }
    })();
  });
}

/* ================= 阅读详情 ================= */

function bindReadDetail() {
  document.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement | null;
    const card = t?.closest('.read-card') as HTMLElement | null;
    if (card && card.dataset.book) {
      ev.stopPropagation();
      void openBook(Number(card.dataset.book));
    }
  });
}

declare global {
  interface Window {
    _chartInsts?: any[];
  }
}

boot().catch((e) => {
  console.error('[student-main]', e);
  if (!(e instanceof ApiError)) location.href = 'login.html';
});
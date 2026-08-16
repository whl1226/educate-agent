import { requireRole, isPreviewMode } from '../core/guard';
import { get, post, ApiError } from '../core/request';
import { setText, fill, preempt, fixRoleLinks, fixPreviewLinks, showPreviewBanner, toast, esc, fmtDate } from '../core/ui';
import { nl2br } from '../core/xss';

async function boot() {
  const user = await requireRole(['parent'], { preview: isPreviewMode() });
  fixRoleLinks();
  fixPreviewLinks(user.role);
  if (isPreviewMode()) showPreviewBanner(user.role);
  bindVoice();
  bindTips();
  bindCoursePlay();

  await Promise.all([loadWeekly(), loadVoice(), loadCourses(), loadBigMode()]);
  void user;
}

/* ================= P3 大字版服务直达 ================= */

async function loadBigMode() {
  const box = document.getElementById('bigServices');
  if (!box) return;
  try {
    const svcs = await get<any[]>('/big-mode/services');
    if (!svcs?.length) return;
    box.innerHTML = svcs
      .map(
        (s) =>
          `<button class="big-svc" data-key="${esc(s.key)}"><span class="iconify" data-icon="ph:${esc(s.icon || 'app-window')}"></span>${esc(s.name)}</button>`,
      )
      .join('');
    box.querySelectorAll('.big-svc').forEach((b) => {
      b.addEventListener('click', () => {
        const key = (b as HTMLElement).dataset.key;
        const path = svcs.find((s) => s.key === key)?.path || '';
        const hash = (path || '').split('#')[1] || '';
        const viewMap: Record<string, string> = { voice: 'view-voice', weekly: 'view-weekly', tips: 'view-tips', serve: 'view-serve' };
        const g = (window as any).go;
        if (typeof g === 'function') g(viewMap[hash] || 'view-serve');
      });
    });
  } catch (e) {
    console.warn('[bigMode]', e);
  }
}

/* ================= 学情周报 ================= */

async function loadWeekly() {
  try {
    const w = await get<any>('/weekly-report');
    const r = w?.reports?.[0];
    if (!r) return;
    setText('#view-weekly .week-date', `${r.studentName || '孩子'} 同学 · 第 ${r.weekNo ?? ''} 周学习周报`);
    const score = document.querySelector('#view-weekly .week-score') as HTMLElement | null;
    if (score) score.innerHTML = `${esc(Math.round(r.totalScore ?? 0))}<small> 分</small>`;
    const trend = document.querySelector('#view-weekly .week-trend') as HTMLElement | null;
    if (trend) {
      const delta = (r.totalScore ?? 0) - (r.prevScore ?? 0);
      trend.innerHTML =
        delta > 0
          ? `<span class="iconify" data-icon="ph:trend-up"></span> 较上周进步 ${esc(Math.abs(delta))} 分`
          : delta < 0
            ? `<span class="iconify" data-icon="ph:trend-down"></span> 较上周下降 ${esc(Math.abs(delta))} 分`
            : `本周与上周持平`;
    }
    if (r.authNote) {
      const auth = document.createElement('div');
      auth.className = 'cite';
      auth.style.cssText = 'font-size:11px;margin-top:10px';
      auth.textContent = r.authNote;
      document.querySelector('#view-weekly .week-banner')?.appendChild(auth);
    }
    if (r.masteries && r.masteries.length) {
      const rows = document.querySelectorAll('#view-weekly .gauge-row');
      r.masteries.forEach((m: any, i: number) => {
        const row = rows[i];
        if (!row) return;
        const name = row.querySelector('.gauge-name');
        if (name) name.textContent = m.subject || '';
        const bar = row.querySelector('.gauge-track i') as HTMLElement | null;
        if (bar) bar.style.width = Math.max(4, Math.min(100, Math.round(m.mastery ?? 0))) + '%';
      });
    }
    if (r.teacherNote) {
      const note = document.querySelector('#view-weekly .card');
      if (note) {
        const div = document.createElement('div');
        div.style.cssText = 'font-size:13px;line-height:1.8;margin-top:10px;background:#F7F7FF;border-radius:10px;padding:10px 12px';
        div.textContent = '班主任：' + r.teacherNote;
        note.appendChild(div);
      }
    }
  } catch (e) {
    console.warn('[weekly]', e);
  }
}

/* ================= 语音留言 ================= */

async function loadVoice() {
  try {
    const v = await get<any>('/voice-messages');
    const chat = document.getElementById('voiceChat');
    if (!chat) return;
    const sent = v?.sent || [];
    const received = v?.received || [];
    const all = [
      ...received.map((m: any) => ({ ...m, dir: 'in' })),
      ...sent.map((m: any) => ({ ...m, dir: 'out' })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (!all.length) return;
    const staticCount0 = chat.querySelectorAll('.msg').length;
    let staticCount = staticCount0;
    all.forEach((m) => {
      const d = document.createElement('div');
      d.className = 'msg ' + (m.dir === 'out' ? 'voice-me' : 'voice-msg');
      const bar =
        m.dir === 'out'
          ? 'background:rgba(255,255,255,.22)'
          : '';
      const inner =
        '<div class="ava"><span class="iconify" data-icon="ph:' + (m.dir === 'out' ? 'user' : 'chalkboard-teacher') + '"></span></div>' +
        '<div class="bub">' +
        esc(m.text || '') +
        '<div class="voice-bar" style="' + bar + '"><span class="iconify" data-icon="ph:play-fill"></span><div class="v-track"><i style="width:70%;' + (m.dir === 'out' ? 'background:#fff' : '') + '"></i></div><span class="v-time" style="' + (m.dir === 'out' ? 'color:#fff' : '') + '">00:' + String(m.durationSec ?? 5).padStart(2, '0') + '</span></div>' +
        '<div style="font-size:10px;color:rgba(0,0,0,.45);margin-top:5px">' + fmtDate(m.createdAt) + (m.dir === 'in' ? '' : m.read ? ' · 已读' : ' · 未读') + '</div>' +
        '</div>';
      d.innerHTML = inner;
      chat.insertBefore(d, chat.children[staticCount]);
      staticCount++;
    });
  } catch (e) {
    console.warn('[voice]', e);
  }
}

function bindVoice() {
  preempt('#recordBtn', (btn) => {
    btn.classList.add('recording');
    btn.innerHTML = '<span class="iconify" data-icon="ph:stop-fill"></span> 正在发送…';
    void (async () => {
      try {
        const msg = await post<any>('/voice-messages', { text: '闺女，好好吃饭，别让奶奶操心。', durationSec: 12 });
        const chat = document.getElementById('voiceChat');
        if (chat && msg?.id) {
          const d = document.createElement('div');
          d.className = 'msg voice-me';
          d.innerHTML =
            '<div class="ava"><span class="iconify" data-icon="ph:user"></span></div><div class="bub">闺女，好好吃饭，别让奶奶操心。<div class="voice-bar" style="background:rgba(255,255,255,.22)"><span class="iconify" data-icon="ph:play-fill"></span><div class="v-track"><i style="width:100%;background:#fff"></i></div><span class="v-time" style="color:#fff">00:12</span></div><div style="font-size:10px;color:rgba(255,255,255,.7);margin-top:6px">已发送 · 小雨会收到提醒</div></div>';
          chat.appendChild(d);
          d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        toast('留言已发送，小雨会收到提醒');
      } catch (e: any) {
        toast(e?.message || '发送失败');
      } finally {
        btn.classList.remove('recording');
        btn.innerHTML = '<span class="iconify" data-icon="ph:microphone"></span> 按住说话 · 松开发送';
      }
    })();
  });
}

/* ================= 育儿话术 ================= */

function bindTips() {
  const btn = document.querySelector('#view-tips .tip-card .btn, #view-tips button') as HTMLElement | null;
  if (btn) {
    preempt('#view-tips .tip-card:last-child button', (el) => {
      void (async () => {
        const inp = document.querySelector('#view-tips input') as HTMLInputElement | null;
        const ctx = (inp?.value || '').trim();
        if (!ctx) {
          toast('先输入你的困扰，比如"孩子成绩下降了，怎么跟老师说"');
          return;
        }
        btnBusy(el, true);
        try {
          const res = await post<any>('/parenting-tips', { scene: 'custom', context: ctx });
          const text = res?.content || res?.tip || res?.text || '';
          const card = el.closest('.tip-card');
          if (card && text) {
            const newCard = document.createElement('div');
            newCard.className = 'tip-card';
            newCard.innerHTML = `<div class="q">「${esc(ctx)}」怎么说？</div><div class="a">${nl2br(esc(text))}</div>`;
            card.after(newCard);
            if (inp) inp.value = '';
          }
          toast('话术已生成');
        } catch (e: any) {
          toast(e?.message || '生成失败');
        } finally {
          btnBusy(el, false);
        }
      })();
    });
  }
}

/* ================= 亲子课程 ================= */

async function loadCourses() {
  try {
    const courses = await get<any[]>('/family-courses');
    if (!courses || !courses.length) return;
    const rows = courses
      .map(
        (c) =>
          `<div class="row-card"><div class="ric ${c.status === 'done' ? 'ric-green' : c.status === 'today' ? 'ric-amber' : 'ric-cream'}"><span class="iconify" data-icon="ph:${c.status === 'done' ? 'check-circle' : c.status === 'today' ? 'play-circle' : 'calendar'}"></span></div><div style="flex:1"><div class="r-title">${esc(c.title)} <span class="chip ${c.status === 'done' ? 'chip-green' : 'chip-amber'}">${c.status === 'done' ? '已学' : c.weekday || ''}</span></div><div class="r-sub">${esc(c.durationMin ?? 3)} 分钟 · ${esc((c.content || []).join(' / '))}</div></div>${c.status === 'done' ? '' : `<button class="btn btn-amber btn-sm course-done" data-id="${c.id}" style="flex:none"><span class="iconify" data-icon="ph:check-circle"></span>学完打卡</button>`}</div>`,
      )
      .join('');
    const family = document.querySelector('#view-family > div:last-child');
    if (family) {
      family.querySelector('#courseStatic')?.remove();
      family.insertAdjacentHTML('beforeend', rows);
      family.querySelectorAll('.course-done').forEach((b) => {
        b.addEventListener('click', () => {
          void (async () => {
            const id = (b as HTMLElement).dataset.id;
            try {
              await post('/family-courses/' + id + '/complete');
              toast('打卡成功，课程已学完');
              loadCourses();
            } catch (e: any) {
              toast(e?.message || '打卡失败');
            }
          })();
        });
      });
    }
    const serve = document.querySelector('#view-serve > div:last-child');
    if (serve && courses.length) {
      const done = courses.filter((c) => c.status === 'done').length;
      serve.insertAdjacentHTML(
        'beforeend',
        `<div style="margin-top:10px;background:#F2FDF8;border:1px solid #A7F3D0;border-radius:12px;padding:10px 12px;font-size:12.5px;color:#047857">已学 ${esc(done)} 门亲子课 · 本周还有 ${esc(courses.length - done)} 门待学</div>`,
      );
    }
  } catch (e) {
    console.warn('[courses]', e);
  }
}

function bindCoursePlay() {
  preempt('#coursePlayBtn', (btn) => {
    void (async () => {
      btnBusy(btn, true);
      try {
        const courses = await get<any[]>('/family-courses');
        const first = courses?.find((c) => c.status !== 'done') || courses?.[0];
        if (!first) {
          toast('本周课程已全部学完，真棒！');
          return;
        }
        await post('/family-courses/' + first.id + '/complete');
        toast('已学完《' + first.title + '》，打卡成功');
        loadCourses();
      } catch (e: any) {
        toast(e?.message || '操作失败');
      } finally {
        btnBusy(btn, false);
      }
    })();
  });
}

boot().catch((e) => {
  console.error('[parent-main]', e);
  if (!(e instanceof ApiError)) location.href = 'login.html';
});
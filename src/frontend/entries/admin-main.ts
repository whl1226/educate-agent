import { requireRole, isPreviewMode, initialsOf } from '../core/guard';
import { get, post, api, ApiError } from '../core/request';
import { setText, fill, preempt, fixRoleLinks, fixPreviewLinks, showPreviewBanner, toast, esc, fmtDate, statusText, btnBusy } from '../core/ui';
import { regChart, resizeCharts } from '../core/perf';
import { SafeUser } from '../core/auth';
import { bindAiButtons } from './admin-ai';

interface Inst {
  el?: HTMLElement;
  inst: any;
}

function chartAt(i: number): any {
  try {
    const list = (0, eval)('chartInstances') as Inst[] | undefined;
    return list && list[i] ? list[i].inst : null;
  } catch {
    return null;
  }
}

async function boot() {
  const user = await requireRole(['admin'], { preview: isPreviewMode() });
  setUserCard(user);
  if (isPreviewMode()) showPreviewBanner(user.role);
  bindResolve();
  bindSuperviseCreate();
  bindSuperviseAdvance();
  bindAiButtons();
  bindNavRefresh();

  await Promise.all([
    loadOverview(),
    loadBalance(),
    loadAlerts(),
    loadLedger(),
    loadSupervise(),
    loadPortraits(),
    loadResearch(),
  ]);
}

function setUserCard(user: SafeUser) {
  setText('.user-card .user-name', user.displayName || '管理员');
  setText('.user-card .user-role', '青石县教育局 · 基教股');
  const av = document.querySelector('.user-card .avatar');
  if (av) av.textContent = initialsOf(user.displayName || '周');
  fixRoleLinks();
  fixPreviewLinks(user.role);
}

/* ================= 区域学情看板 ================= */

async function loadOverview() {
  try {
    const r = await get<any>('/admin/region/overview');
    if (!r) return;
    const s = r.stats || {};
    const kpis = document.querySelectorAll('#page-overview .kpi .mono');
    const vals = [s.schools, s.teachers, s.students, s.utilizationRate != null ? s.utilizationRate + '%' : '—'];
    kpis.forEach((k, i) => {
      if (vals[i] != null) k.textContent = String(vals[i]);
    });
    const schoolBar = chartAt(0);
    if (schoolBar && r.schools?.length) {
      schoolBar.setOption({
        yAxis: { type: 'category', inverse: true, data: r.schools.map((x: any) => x.name || x.schoolName), axisLabel: { color: '#64748B', fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
        series: [{ type: 'bar', data: r.schools.map((x: any) => Math.round(x.avgMastery ?? x.teacherRatio ?? 50)), barWidth: 13, itemStyle: { borderRadius: [0, 6, 6, 0], color: '#38BDF8' } }],
      });
    }
    const trend = chartAt(2);
    if (trend && r.trends) {
      const labels = (r.trends.answers || []).map((_: any, i: number) => 'W' + (i + 1));
      trend.setOption({
        xAxis: { type: 'category', boundaryGap: false, data: labels, axisLabel: { color: '#64748B', fontSize: 10 } },
        series: [
          { name: '作答数', type: 'line', smooth: true, data: r.trends.answers, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2.5, color: '#38BDF8' }, itemStyle: { color: '#38BDF8' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(56,189,248,.32)' }, { offset: 1, color: 'rgba(56,189,248,0)' }] } } },
          { name: '活跃学生', type: 'line', smooth: true, data: r.trends.active, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2.5, color: '#2DD4BF' }, itemStyle: { color: '#2DD4BF' } },
        ],
      });
    }
    if (r.aiUsage) {
      const ai = document.querySelector('#aiCard .ai-stat, #aiCard');
      if (ai) {
        const chip = ai.querySelector('.chip, .kpi');
        if (chip) chip.textContent = `模型 ${esc(r.aiUsage.model || 'demo')} · 已用 ${esc(r.aiUsage.totalTokens ?? 0)} tokens`;
      }
    }
  } catch (e) {
    console.warn('[overview]', e);
  }
}

/* ================= 资源均衡 ================= */

async function loadBalance() {
  try {
    const b = await get<any>('/admin/resource-balance');
    if (!b?.rows?.length) return;
    const eq = chartAt(3);
    if (eq) {
      const avg = (f: (x: any) => number) => {
        const vs = b.rows.map(f).filter((v: number) => Number.isFinite(v));
        return vs.length ? Math.round(vs.reduce((a: number, c: number) => a + c, 0) / vs.length) : 0;
      };
      eq.setOption({
        yAxis: { type: 'category', data: ['生均图书', '多媒体教室', '专任教师比', '生均经费', '网络带宽'], axisLabel: { color: '#64748B', fontSize: 11 } },
        series: [
          { name: '城区', type: 'bar', data: [92, 88, 100, 86, 95], barWidth: 8, itemStyle: { color: '#38BDF8', borderRadius: [0, 5, 5, 0] } },
          { name: '乡村', type: 'bar', data: [avg((x) => x.booksPerStudent), avg((x) => x.mediaCount * 10), avg((x) => x.teacherRatio), avg((x) => x.budgetLevel * 50), avg((x) => x.bandwidth)], barWidth: 8, itemStyle: { color: '#FBBF24', borderRadius: [0, 5, 5, 0] } },
        ],
      });
    }
    const gapBox = Array.from(document.querySelectorAll('#page-balance .card')).find((c) => (c.textContent || '').includes('缺口清单'));
    if (gapBox) {
      const rows = b.rows
        .map(
          (x: any) =>
            `<div class="alert-row" style="margin-bottom:8px"><div class="alert-ico lv-mid"><span class="iconify" data-icon="ph:${x.budgetLevel >= 2 ? 'check-circle' : 'warning'}"></span></div><div style="flex:1"><div class="t-cell-main">${esc(x.schoolName)} 资源台账</div><div class="t-cell-sub">师生比 ${esc(x.teacherRatio ?? '—')} · 生均图书 ${esc(x.booksPerStudent ?? '—')} 册 · 多媒体 ${esc(x.mediaCount ?? '—')} 间 · 经费 Lv.${esc(x.budgetLevel ?? 1)} · 带宽 ${esc(x.bandwidth ?? '—')}M</div></div><span class="chip ${x.budgetLevel >= 2 ? 'chip-sky' : 'chip-amber'}">${x.budgetLevel >= 2 ? '达标' : '待改善'}</span></div>`,
        )
        .join('');
      const holder = gapBox.querySelector('[style*="padding"]') || gapBox;
      holder.insertAdjacentHTML('afterbegin', rows);
    }
  } catch (e) {
    console.warn('[balance]', e);
  }
}

/* ================= 预警 ================= */

async function loadAlerts() {
  try {
    const alerts = await get<any[]>('/admin/alerts');
    if (!alerts?.length) return;
    const dropoutBox = document.querySelector('#page-dropout .alert-row')?.parentElement;
    const mentalBox = document.querySelector('#page-mental .alert-row')?.parentElement;
    const rowsOf = (a: any) =>
      `<div class="alert-row"><div class="ar-dot" style="background:${a.severity === 'high' ? 'var(--rose)' : a.severity === 'medium' ? 'var(--amber)' : 'var(--sky)'}"></div><div style="flex:1"><div class="ar-t">${esc(a.title)}</div><div class="ar-s">${esc(a.description || '')} · 风险分 ${esc(a.riskScore ?? '—')}</div></div><span class="chip ${a.status === 'resolved' ? 'chip-green' : a.status === 'processing' ? 'chip-amber' : 'chip-rose'}">${esc(statusText(a.status))}</span></div>`;
    const dropout = alerts.filter((a) => a.alertType === 'dropout');
    const mental = alerts.filter((a) => a.alertType === 'mental');
    if (dropoutBox && dropout.length) dropoutBox.innerHTML = dropout.map(rowsOf).join('');
    if (mentalBox && mental.length) mentalBox.innerHTML = mental.map(rowsOf).join('');
    const allBox = document.querySelector('#page-overview .alert-row')?.parentElement;
    if (allBox && alerts.length) allBox.innerHTML = alerts.slice(0, 3).map(rowsOf).join('');
  } catch (e) {
    console.warn('[alerts]', e);
  }
}

function bindSuperviseAdvance() {
  preempt('.adv-btn[data-id]', (btn) => {
    const id = (btn as HTMLElement).dataset.id;
    const cur = (btn as HTMLElement).dataset.status || 'todo';
    const next = cur === 'todo' ? 'ongoing' : cur === 'ongoing' ? 'done' : 'archived';
    void (async () => {
      btnBusy(btn as HTMLElement, true);
      try {
        await api('/admin/supervise-tasks/' + id, { method: 'PATCH', body: { status: next } });
        toast('任务状态已更新：' + statusText(next));
        void loadSupervise();
      } catch (e: any) {
        toast(e?.message || '更新失败');
      } finally {
        btnBusy(btn as HTMLElement, false);
      }
    })();
  });
}

function bindResolve() {
  preempt('#page-dropout [data-resolve], #page-mental [data-resolve]', (btn) => {
    const id = (btn as HTMLElement).dataset.resolve || '1';
    void (async () => {
      try {
        await post('/admin/alerts/' + id + '/resolve', { action: '班主任已谈心，情况正常' });
        toast('预警已处置');
        loadAlerts();
      } catch (e: any) {
        toast(e?.message || '处置失败');
      }
    })();
  });
}

/* ================= 师资台账 ================= */

async function loadLedger() {
  try {
    const l = await get<any>('/admin/teachers/ledger');
    if (!l) return;
    const age = chartAt(5);
    if (age && l.teachers?.length) {
      const bands = ['25 以下', '25-30', '31-35', '36-40', '41-45', '46-50', '50+'];
      const counts = bands.map((bd) => l.teachers.filter((t: any) => t.ageGroup === bd).length);
      age.setOption({
        xAxis: { type: 'category', data: bands, axisLabel: { color: '#64748B', fontSize: 10 } },
        series: [
          { name: '在岗教师', type: 'bar', data: counts, barWidth: 10, itemStyle: { color: '#38BDF8', borderRadius: [4, 4, 0, 0] } },
          { name: '骨干教师', type: 'bar', data: bands.map((bd) => l.teachers.filter((t: any) => t.ageGroup === bd && t.isBackbone).length), barWidth: 10, itemStyle: { color: '#F472B6', borderRadius: [4, 4, 0, 0] } },
        ],
      });
    }
    const page = document.getElementById('page-teacher');
    const rows = (l.teachers || [])
      .map(
        (t: any) =>
          `<div class="alert-row"><div class="ar-dot" style="background:${t.retireYear ? 'var(--amber)' : 'var(--green)'}"></div><div style="flex:1"><div class="ar-t">${esc(t.name)} · ${esc(t.subject)}</div><div class="ar-s">${esc(t.ageGroup || '')} · ${esc(t.education || '')} · ${t.isBackbone ? '骨干教师' : t.retireYear ? '近' + esc(new Date(t.retireYear, 0, 1).getFullYear() - new Date().getFullYear()) + ' 年内退休' : '普通教师'}</div></div><span class="chip ${t.isBackbone ? 'chip-green' : t.retireYear ? 'chip-amber' : 'chip-gray'}">${t.isBackbone ? '骨干' : t.retireYear ? '待补充' : '在岗'}</span></div>`,
      )
      .join('');
    if (page) {
      const target = page.querySelector('.card:last-child');
      if (target) {
        target.insertAdjacentHTML('afterend', `<div class="card"><div class="card-head"><div class="card-title">在岗教师清单 <span class="chip chip-blue">${esc((l.teachers || []).length)} 人</span></div></div><div style="padding:6px 20px 12px">${rows}</div></div>`);
      }
    }
  } catch (e) {
    console.warn('[ledger]', e);
  }
}

/* ================= 督导 ================= */

async function loadSupervise() {
  try {
    const tasks = await get<any[]>('/admin/supervise-tasks');
    const box = document.querySelector('#page-supervise .alert-row')?.parentElement;
    if (!box) return;
    if (!tasks?.length) {
      box.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">暂无督导任务</div>';
      return;
    }
box.innerHTML = tasks
      .map(
        (t) =>
          `<div class="alert-row"><div class="ar-dot" style="background:${t.status === 'todo' ? 'var(--amber)' : 'var(--muted)'}"></div><div style="flex:1"><div class="ar-t">${esc(t.taskNo)} · ${esc(t.title)}</div><div class="ar-s">责任：${esc(t.owner || '—')}${t.deadline ? ' · 截止 ' + fmtDate(t.deadline) : ''}</div></div><span class="chip ${t.status === 'todo' ? 'chip-amber' : 'chip-gray'}">${esc(statusText(t.status))}</span>${t.status === 'archived' ? '' : `<button class="btn btn-primary btn-sm adv-btn" data-id="${t.id}" data-status="${t.status}" style="margin-left:8px"><span class="iconify" data-icon="ph:arrow-circle-right"></span>推进</button>`}</div>`,
      )
      .join('');
  } catch (e) {
    console.warn('[supervise]', e);
  }
}

/* ================= A7 AI 治理助手（统一生成入口） ================= */
// AI 生成统一走 agent 流式（admin-ai.ts）：各页 [data-ai-task] 按钮由 bindAiButtons 接管

function bindSuperviseCreate() {  const createBtn = document.querySelector('#page-supervise .btn-primary, #page-supervise button[class*="btn"]');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      void (async () => {
        btnBusy(createBtn as HTMLElement, true);
        try {
          await post('/admin/supervise-tasks', { title: '秋季开学前校园安全巡检', owner: '总务处', source: 'manual' });
          toast('督导任务已创建');
          loadSupervise();
        } catch (e: any) {
          toast(e?.message || '创建失败');
        } finally {
          btnBusy(createBtn as HTMLElement, false);
        }
      })();
    });
  }
}

/* ================= 教师画像 ================= */

async function loadPortraits() {
  try {
    const ps = await get<any[]>('/admin/teacher-portraits');
    if (!ps?.length) return;
    const radar = chartAt(6);
    const first = ps[0];
    if (radar && first?.metrics) {
      const keys = Object.keys(first.metrics);
      radar.setOption({
        radar: {
          indicator: keys.map((k) => ({ name: k, max: 100 })),
          axisName: { color: '#666', fontSize: 11 },
          splitArea: { areaStyle: { color: ['#FBFBFA', '#F3F2EE'] } },
        },
        series: [{
          type: 'radar',
          data: [{ value: keys.map((k) => first.metrics[k]), name: first.name, areaStyle: { color: 'rgba(79,124,240,.22)' }, lineStyle: { color: '#4F7CF0' }, itemStyle: { color: '#4F7CF0' } }],
        }],
      });
    }
    const page = document.getElementById('page-profile');
    if (page && first) {
      const tags = (first.tags || []).map((t: string) => `<span class="chip chip-green">${esc(t)}</span>`).join(' ');
      const target = page.querySelector('.teacher-card')?.parentElement;
      if (target) {
        target.insertAdjacentHTML(
          'beforeend',
          `<div class="teacher-card" style="border-style:dashed"><div style="flex:1"><div class="ar-t">${esc(first.name)} 画像（实时）</div><div class="ar-s" style="margin-top:6px">${tags}</div><div style="font-size:12px;color:var(--muted);margin-top:8px;line-height:1.7">${esc(first.suggestions || '')}</div></div></div>`,
        );
      }
    }
  } catch (e) {
    console.warn('[portraits]', e);
  }
}

/* ================= 教研活动 ================= */

async function loadResearch() {
  try {
    const acts = await get<any[]>('/admin/research-activities');
    const grid = document.getElementById('resGrid');
    if (!grid) return;
    if (!acts?.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);font-size:13px;padding:26px">暂无教研活动</div>';
      return;
    }
    grid.innerHTML = acts
      .map(
        (a) =>
          `<div class="card card-pad"><div class="card-head"><div class="card-title">${esc(a.title)}</div></div><div style="font-size:12.5px;color:var(--muted);line-height:1.9">类型：${esc(a.type || '')} · ${esc(a.rangeDesc || '')}<br/>时间：${esc(a.whenDesc || '')} · 参与 ${esc(a.participants ?? 0)} 人</div><div style="margin-top:10px;display:flex;gap:8px"><span class="chip ${a.status === 'done' ? 'chip-green' : a.status === 'ongoing' ? 'chip-blue' : 'chip-amber'}">${esc(statusText(a.status))}</span><span class="chip chip-gray">成果 ${esc(a.resultCount ?? 0)}</span></div></div>`,
      )
      .join('');
  } catch (e) {
    console.warn('[research]', e);
  }
}

/* ================= 导航刷新 ================= */

function bindNavRefresh() {
  const map: Record<string, () => void> = {
    overview: () => void loadOverview(),
    balance: () => void loadBalance(),
    dropout: () => void loadAlerts(),
    mental: () => void loadAlerts(),
    teacher: () => void loadLedger(),
    supervise: () => void loadSupervise(),
    profile: () => void loadPortraits(),
    research: () => void loadResearch(),
  };
  document.querySelectorAll('.nav-item').forEach((nav) => {
    nav.addEventListener('click', () => {
      const page = (nav as HTMLElement).dataset.page;
      const fn = page && map[page];
      if (fn) fn();
      window.setTimeout(() => resizeCharts(), 160);
    });
  });
}

boot().catch((e) => {
  if (e instanceof ApiError && e.code === 403) return;
  console.error('[admin-main]', e);
  if (!(e instanceof ApiError)) location.href = 'login.html';
});
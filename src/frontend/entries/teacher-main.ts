import { requireRole, isPreviewMode, initialsOf } from '../core/guard';
import { get, patch, post, upload, ApiError } from '../core/request';
import { setText, preempt, fixRoleLinks, fixPreviewLinks, showPreviewBanner, toast, esc, fmtDate, statusText } from '../core/ui';
import { downloadFile } from '../core/download';
import { regChart, resizeCharts, debounce } from '../core/perf';
import { SafeUser } from '../core/auth';

/** 教师端「发送给智能体」任务传递通道（与 agent-main.ts 一致） */
const TASK_CHANNEL = 'xy.agent.task';

interface ChartInsts {
  ring?: any;
  trend?: any;
  radar?: any;
  mini?: any;
}

/* ================= 智能体工作台：发送预设任务 ================= */

/** 每个预设的「发送」绑定：从当前页面表单收集 data-field 值 → 任务文本 → sessionStorage → 跳转 agent 页 */
const SEND_AGENT: Record<string, (form: Record<string, string>) => string> = {
  lesson: (f) =>
    `请为${f.grade || '五年级'}${f.subject || '语文'}${f.bookVersion || '统编（部编）版'}《${f.topic || '草船借箭'}》生成教案，${f.periodCount || '1 课时'}，每课时 ${f.duration || '40'}，学情适配：${f.adaptation || '默认'}${f.supplementary ? `，补充说明：${f.supplementary}` : ''}。请生成可直接上课的完整教案，并在完成后用文档交付。`,
  paper: (f) =>
    `请生成一份${f.subject || '五年级 · 数学'}试卷，范围：${f.unit || '简易方程'}，分层模式：${f.layerMode || 'A/B/C 分层'}，共 ${f.choice || 6} 道选择题、${f.blank || 6} 道填空题、${f.solve || 4} 道解答题，自动附答案解析。请用试卷文档交付（可下载 Word/PDF）。`,
  micro: (f) =>
    `请为《${f.topic || '分数的基本性质'}》生成微课脚本，时长 ${f.duration || '8'}，授课风格：${f.style || '亲切乡镇风（多用生活情境）'}，录制规格：${f.format || '横屏 16:9'}，需要提词卡。脚本需含分镜、逐字稿与停顿点，用文档交付。`,
  res0: (f) =>
    `请以资深教研员身份点评以下教案，输出：1) 五维评分（目标设计/过程设计/活动设计/评价设计/作业设计，各 0-100 分与一句评语）；2) 必须改进项（≤3 条，具体可操作）；3) 建议优化项（≤3 条）；4) 引用的课标依据。教案内容：\n${f.sourceContent || ''}`,
  res1: (f) => {
    const picked = document.querySelector<HTMLElement>('#resTab1 .list-row.sel');
    const topic = picked?.getAttribute('data-q') || '解方程 x + 2x + 5 = 26，求 x';
    const material = (f.res1Material || '').trim();
    return `请以 AI 教研员身份生成苏格拉底式讲题话术（不给答案，引导思考），题目：${topic}。${material ? `\n参考教案材料：\n${material}` : ''}`;
  },
  resAdvice: (f) =>
    `请以 AI 教研员身份基于班级学情生成本周教学建议（≤5 条，每条含依据与可操作动作）：${f.adviceFocus || '班级学情：掌握度 71%，薄弱点移项变号，8 名 A 层学生，留守儿童 12 人'}。用文档交付建议清单。`,
  skills: () =>
    `请根据我的教师基本功自评与教学情境作答生成补强训练计划。\n自评：教学设计 82、课堂管理 74、粉笔字 68、普通话 86、信息化 63、学情分析 78、作业设计 70、家校沟通 75。\n情境作答：① 课堂纪律问题优先用非语言干预（眼神/靠近）；② 面对薄弱班级先摸底再放缓进度；③ 对祖辈监护人给出可操作小任务。\n要求：1) 按薄弱项排序（信息化、粉笔字优先）；2) 输出 7 天训练计划（每天 1 项任务，含时长、方法、自评标准）；3) 每项配 1 条教研规则依据；4) 用文档交付。`,
  library: () =>
    `请帮我整理教学资源库（全部类型）：按教案 / 课件 / 习题 / 视频分类整理，标注授权方式，生成一份资源清单。用文档交付资源清单。`,
  ocr: () =>
    `请将以下手写教案 OCR 文本转换为结构化电子教案（含课题、导入、新授、活动、结论、作业设计），对齐教材章节后交付：\n§ 课题：多边形面积\n① 复习长方形公式 5min\n② 割补法演示平行四边形\n③ 学生剪拼操作\n④ 公式推导 S=ah`,
  parentmeet: (f) => {
    const kps = [f.kp1, f.kp2, f.kp3, f.kp4].filter(Boolean).join('、');
    return `请为「${f.theme || '五年级（1）班 · 期中家长会'}」生成家长会发言稿，时长 ${f.duration || '15'}，参会群体：${f.audience || '含大量务工/祖辈家长'}，重点内容：${kps || '班级学情总览'}。结合班级学情数据生成，用文档交付并附图表页说明。`;
  },
  backtoschool: () =>
    `请为五年级（1）班生成开学材料包：开学第一课课件、班级公约、学期教学计划、安全告知书、致家长的一封信、学生信息表。结合班级学情与课标生成，用文档交付。`,
  title: () => {
    let files: Array<{ name: string }> = [];
    try {
      files = JSON.parse(sessionStorage.getItem('xy.title.files') || '[]');
    } catch {
      /* 静默 */
    }
    return `请将以下职称评审材料按「获奖证书 / 论文课题 / 继续教育 / 任职教案」四类自动分类归档并生成目录（含材料名、份数、归档位置）：\n${files.map((f) => f.name).join('\n') || '县级优质课二等奖\n《乡镇小班化教学实践》论文\n国培结业证书\n普通话二甲证书\n近三年教案本\n班主任任职证明'}`;
  },
};

/** 收集指定页面表单值（data-field 属性；radio-pill 取 .on 的 data-v） */
function collectForm(rootSel: string): Record<string, string> {
  const root = document.querySelector(rootSel) as HTMLElement | null;
  if (!root) return {};
  const form: Record<string, string> = {};
  root.querySelectorAll<HTMLElement>('[data-field]').forEach((el) => {
    const field = el.dataset.field || '';
    if (!field || form[field]) return;
    if (el.classList.contains('radio-pill')) {
      const on = el.querySelector('.on') as HTMLElement | null;
      if (on && on.dataset.v) form[field] = on.dataset.v;
    } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      if (el.checked) form[field] = el.value;
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      form[field] = el.value.trim();
    }
  });
  return form;
}

/** 绑定各页「发送给智能体」：收集表单 → 跳转 agent.html（任务经 sessionStorage 传递） */
function bindSendAgent() {
  document.querySelectorAll<HTMLElement>('[data-send-agent]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sendAgent || '';
      const builder = SEND_AGENT[key];
      if (!builder) return;
      // 定位该按钮所在的页面 section，收集该页表单
      const page = btn.closest('.page') as HTMLElement | null;
      const form = page ? collectForm('#' + page.id) : {};
      const task = builder(form);
      try {
        sessionStorage.setItem(TASK_CHANNEL, task);
        if (key === 'resAdvice') sessionStorage.setItem('xy.res2.sent', '1');
      } catch {
        /* 静默 */
      }
      location.href = 'agent.html';
    });
  });
}

/** 全局控件绑定：radio-pill / switch（teacher.html 内联 onclick 多不满足 CSP 层 fn(args) 正则而失效；opt-card 由 legacy CSP 层绑定，不在此处理，避免双触发） */
function bindGlobalControls() {
  document.querySelectorAll<HTMLElement>('.radio-pill > span').forEach((el) => {
    if (el.dataset.bound === '1') return;
    el.dataset.bound = '1';
    el.addEventListener('click', () => {
      const pill = el.parentElement;
      if (!pill) return;
      pill.querySelectorAll<HTMLElement>(':scope > span').forEach((s) => s.classList.remove('on'));
      el.classList.add('on');
    });
  });
  document.querySelectorAll<HTMLElement>('.switch').forEach((el) => {
    if (el.dataset.bound === '1') return;
    el.dataset.bound = '1';
    el.addEventListener('click', () => el.classList.toggle('on'));
  });
}

/** 模态关闭按钮双保险绑定：legacy CSP 层会剥离内联 onclick（其绑定早于本模块执行），故 addEventListener 兜底；关闭幂等，双触发无害 */
function bindModalClose(sel: string, closeFn: () => void) {
  document.querySelectorAll(sel).forEach((el) => {
    const target = el as HTMLElement;
    if (target.dataset.bound === '1') return;
    target.dataset.bound = '1';
    target.addEventListener('click', closeFn);
  });
}

/** 教学建议发送标记：返回本页时展示「已发送」结果卡（一次性） */
function applyRes2SentMarker() {
  try {
    if (!sessionStorage.getItem('xy.res2.sent')) return;
    const empty = document.getElementById('res2-empty');
    const result = document.getElementById('res2-result');
    if (empty) empty.style.display = 'none';
    if (result) result.style.display = 'block';
    sessionStorage.removeItem('xy.res2.sent');
  } catch {
    /* 静默 */
  }
}

/* ================= 一键组卷：Word / PDF 下载 ================= */

function bindPaperDownload() {
  preempt('#paperDlDocx', (btn) => {
    void downloadPaperByFormat(btn, 'docx');
  });
  preempt('#paperDlPdf', (btn) => {
    void downloadPaperByFormat(btn, 'pdf');
  });
}

async function downloadPaperByFormat(btn: HTMLElement, format: string) {
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="iconify" data-icon="ph:circle-notch"></span> 生成中…';
  btn.setAttribute('disabled', '');
  try {
    const papers = await get<any[]>('/papers');
    const paper = papers?.[0];
    if (!paper) {
      toast('请先在「一键组卷」页生成试卷', '!');
      return;
    }
    const r = await get<any>('/papers/' + paper.id + '/download?format=' + format);
    if (r?.downloadUrl) await downloadFile(r.downloadUrl, r.filename);
    else toast('试卷尚未生成文档，请先发送给智能体组卷', '!');
  } catch (e: any) {
    toast(e?.message || '下载失败', '!');
  } finally {
    btn.innerHTML = orig;
    btn.removeAttribute('disabled');
  }
}

/* ================= 微课提词卡模板 ================= */

/** 微课提词卡模板：点击 → 填课题输入框并直接发送给智能体 */
function bindTeleprompterTemplates() {
  document.querySelectorAll<HTMLElement>('#teleprompterTemplates .tp-tpl').forEach((el) => {
    el.addEventListener('click', () => {
      const topic = el.dataset.topic || '分数的基本性质';
      const tpl = el.dataset.tpl || '';
      const topicInput = document.querySelector<HTMLInputElement>('#page-micro [data-field="topic"]');
      if (topicInput) topicInput.value = topic;
      const task = `请为《${topic}》生成微课脚本（使用「${tpl}」作为开场设计），时长 8 分钟，亲切乡镇风，横屏 16:9，需要提词卡。脚本需含分镜、逐字稿与停顿点，用文档交付。`;
      try { sessionStorage.setItem(TASK_CHANNEL, task); } catch { /* 静默 */ }
      location.href = 'agent.html';
    });
  });
}

/* ================= 数据加载 ================= */

async function loadDashboard(charts: ChartInsts) {
  try {
    const classes = await get<any[]>('/classes');
    if (!classes || !classes.length) return;
    const cls = classes[0];
    const [ov, trends, km] = await Promise.all([
      get<any>('/classes/' + cls.id + '/overview'),
      get<any>('/classes/' + cls.id + '/trends?days=7'),
      get<any[]>('/classes/' + cls.id + '/knowledge-mastery'),
    ]);
    setText('#page-dashboard .kpi .mono', '');
    const nums = document.querySelectorAll('#page-dashboard .kpi .kpi-num');
    const kpiUnits = ['人', '%', '份', '份'];
    const kpiVals = [ov?.total, ov?.accuracy7d, ov?.pendingGrading, 0];
    if (ov) {
      try {
        const plans = await get<any[]>('/lesson-plans');
        kpiVals[3] = plans?.length ?? 0;
      } catch {}
    }
    nums.forEach((n, i) => {
      // i === 2 为「班级平均掌握度」卡：保持静态 78.6%，与下方 5 色环形图一致，避免被真实数据覆盖成 2 色 40%
      if (i === 2) return;
      if (kpiVals[i] != null) {
        const small = n.querySelector('small');
        n.innerHTML = esc(String(kpiVals[i])) + (small ? small.outerHTML : kpiUnits[i] ? `<small>${kpiUnits[i]}</small>` : '');
      }
    });
    // 班级掌握度构成环形图：固定渲染 5 色分布（扎实/良好/待提升/薄弱/需补强），
    // 不再用真实数据覆盖为「已掌握/待提升」两色（用户明确要求只保留 5 色形态）
    if (charts.trend && trends) {
      charts.trend.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 16, top: 20, bottom: 24 },
        xAxis: { type: 'category', data: trends.labels || [], axisLabel: { color: '#8A8A8A' } },
        yAxis: { type: 'value', axisLabel: { color: '#8A8A8A' }, splitLine: { lineStyle: { color: '#F0EDE6' } } },
        series: [{ type: 'line', smooth: true, data: trends.counts || [], lineStyle: { color: '#4F7CF0', width: 3 }, itemStyle: { color: '#4F7CF0' }, areaStyle: { color: 'rgba(79,124,240,.12)' } }],
      });
    }
    if (charts.mini && trends) {
      charts.mini.setOption({
        grid: { left: 34, right: 10, top: 14, bottom: 24 },
        xAxis: { type: 'category', data: trends.labels || [], axisLabel: { color: '#8A8A8A', fontSize: 10 } },
        yAxis: { type: 'value', axisLabel: { color: '#8A8A8A' }, splitLine: { lineStyle: { color: '#F0EDE6' } } },
        series: [{ type: 'bar', data: (trends.counts || []).map((c: number) => Math.max(c, 1)), barWidth: 12, itemStyle: { color: '#F5B876', borderRadius: [4, 4, 0, 0] } }],
      });
    }
    if (km && km.length) {
      const rows = km
        .map((k) => `<div class="list-row"><div style="flex:1"><div class="t-cell-main">知识点 #${esc(k.knowledgePointId)}</div><div class="t-cell-sub">覆盖 ${esc(k.students)} 人</div></div><span class="chip ${k.mastery > 0.5 ? 'chip-green' : 'chip-rose'}">掌握度 ${Math.round((k.mastery ?? 0) * 100)}%</span></div>`)
        .join('');
      const holder = document.querySelector('#page-dashboard .grid .card:last-child');
      if (holder && holder.querySelector('.list-row')) {
        holder.querySelector('.card-head')?.insertAdjacentHTML('afterend', `<div style="padding:4px 20px 14px">${rows}</div>`);
      }
    }
  } catch (e) {
    console.warn('[dashboard]', e);
  }
}

async function loadLessonList() {
  try {
    const plans = await get<any[]>('/lesson-plans');
    const box = document.getElementById('lesson-empty');
    if (!box) return;
    if (!plans || !plans.length) return;
    const rows = plans
      .slice(0, 5)
      .map(
        (p, i) =>
          `<div class="list-row"><div style="flex:1"><div class="t-cell-main">${esc(p.subject)} · ${esc(p.grade)}《${esc(p.topic || '')}》</div><div class="t-cell-sub">${fmtDate(p.createdAt)} · 已存教案库 · 点击查看</div></div><span class="chip chip-green">已生成</span><span class="iconify" data-icon="ph:caret-right" style="color:var(--faint)"></span></div>`,
      )
      .join('');
    box.innerHTML = '<div style="font-size:14px;font-weight:700;color:var(--ink);margin-bottom:12px">历史教案</div>' + rows;
    box.querySelectorAll('.list-row').forEach((row, i) => {
      row.addEventListener('click', () => void openLessonPlan(plans[i]));
    });
    const countChip = document.getElementById('lessonCountChip');
    if (countChip) countChip.textContent = plans.length + ' 份';
  } catch (e) {
    console.warn('[lesson-plans]', e);
  }
}

/** 打开教案：有 runId → 跳会话；无 → 详情模态 */
async function openLessonPlan(p: any) {
  if (p?.runId) {
    location.href = 'agent.html?conv=' + p.runId;
    return;
  }
  const modal = document.getElementById('planModal');
  if (!modal) return;
  let plan = p;
  try {
    plan = await get<any>('/lesson-plans/' + p.id);
  } catch { /* 列表已有信息可用 */ }
  const title = document.getElementById('planModalTitle');
  const body = document.getElementById('planModalBody');
  const ask = document.getElementById('planModalAsk');
  if (title) title.textContent = `${plan.subject || ''} · ${plan.grade || ''}《${plan.topic || ''}》`;
  if (body) {
    let html = '';
    try {
      const c = typeof plan.content === 'string' ? JSON.parse(plan.content) : plan.content;
      const secs: Array<[string, string]> = [
        ['教学目标', c?.goals?.join ? c.goals.join('；') : c?.goals],
        ['教学重难点', c?.keyPoints?.join ? c.keyPoints.join('；') : c?.keyPoints],
        ['教学过程', c?.process?.map ? c.process.map((s: any) => `【${s.stage}·${s.minutes}分钟】\n教师：${s.teacher || ''}\n学生：${s.student || ''}${s.intent ? `\n意图：${s.intent}` : ''}`).join('\n\n') : c?.process],
        ['板书设计', c?.board],
        ['作业设计', c?.homework?.map ? c.homework.map((h: any) => `[${h.layer}] ${h.desc}`).join('\n') : c?.homework],
        ['教学反思', c?.reflection],
      ];
      html = secs
        .filter(([, v]) => v)
        .map(([k, v]) => `<div style="background:#f7f7ff;border-radius:10px;padding:12px 14px;margin-bottom:12px"><div style="font-size:11px;color:var(--faint);font-weight:700;margin-bottom:5px">${k}</div><div style="font-size:13px;line-height:1.8;white-space:pre-wrap">${esc(String(v))}</div></div>`)
        .join('');
      if (plan.outline) html += `<div style="font-size:11px;color:var(--faint);font-weight:700;margin-bottom:5px">教案大纲</div><div style="font-size:13px;line-height:1.8;white-space:pre-wrap">${esc(plan.outline)}</div>`;
    } catch {
      const raw = typeof plan.content === 'string' ? plan.content : (plan.content ?? null);
      html = raw ? `<div style="font-size:13px;line-height:1.9;white-space:pre-wrap">${esc(String(raw))}</div>` : '';
    }
    body.innerHTML = html || '<div style="color:var(--muted);font-size:13px">暂无教案正文</div>';
  }
  if (ask) {
    ask.style.display = '';
    ask.onclick = () => {
      const task = `请基于《${plan.topic || '该教案'}》教案继续优化：保持整体结构，改进导入与分层练习设计，用文档交付修订版。`;
      try { sessionStorage.setItem(TASK_CHANNEL, task); } catch { /* 静默 */ }
      location.href = 'agent.html';
    };
  }
  modal.classList.add('on');
}

function closePlanModal() {
  document.getElementById('planModal')?.classList.remove('on');
}

function bindPlanModal() {
  bindModalClose('#planModal .close, #planModalClose', closePlanModal);
}

/* ================= 一键组卷：试卷预览回填 + 下载按钮状态 ================= */

/** 解析 /papers/:id/export 文本（题干 / 层级 / 选项 / 参考答案 行结构）为题目列表 */
function parsePaperExport(content: string): Array<{ stem: string; answer: string; layer?: string; analysis?: string }> {
  const out: Array<{ stem: string; answer: string; layer?: string; analysis?: string }> = [];
  let cur: { stem: string; answer: string; layer?: string } | null = null;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const ans = line.match(/^（参考答案：(.+?)，\d+ 分）$/);
    if (ans) {
      if (cur) {
        cur.answer = ans[1];
        out.push(cur);
        cur = null;
      }
      continue;
    }
    const layerMatch = line.match(/^【([ABC]) 层】$/);
    if (layerMatch) {
      if (cur) cur.layer = layerMatch[1];
      continue;
    }
    if (cur === null) {
      const q = line.match(/^\d+\.\s+(.+)$/);
      if (q) cur = { stem: q[1], answer: '' };
      continue;
    }
    if (!/^\d+\.\s+/.test(line)) cur.stem += line;
  }
  return out;
}

/** 页面加载时回填最新试卷预览，并同步下载按钮可用状态（有试卷→可用+回填；无试卷→禁用+占位） */
async function refreshPaperPreview() {
  try {
    const papers = await get<any[]>('/papers');
    const hasAny = papers && papers.length > 0;
    const hint = document.getElementById('paperHint');
    if (hint) hint.style.display = hasAny ? 'none' : '';
    ['paperDlDocx', 'paperDlPdf'].forEach((id) => {
      const b = document.getElementById(id) as HTMLButtonElement | null;
      if (b) b.disabled = !hasAny;
    });
    const previewCard = findCardByTitle('#page-paper', '试卷预览');
    if (!previewCard) return;
    const listBox = previewCard.querySelector('.card-head + div');
    const chip = previewCard.querySelector('.card-head .chip');
    const tags = previewCard.querySelectorAll('.card-extra .tag');
    const emptyHtml = '<div style="padding:12px 0;text-align:center;color:var(--muted);font-size:13px">暂无试卷 · 请先「发送给智能体」组卷</div>';
    if (!hasAny) {
      if (listBox) listBox.innerHTML = emptyHtml;
      if (chip) chip.textContent = '0 题';
      tags.forEach((t, i) => (t.textContent = ['A', 'B', 'C'][i] + ' 层 — 题'));
      return;
    }
    const paper = papers[0];
    const exp = await get<{ content?: string }>('/papers/' + paper.id + '/export');
    const qs = parsePaperExport(exp?.content || '');
    const layerCnt = { A: 0, B: 0, C: 0 } as Record<string, number>;
    qs.forEach((q) => {
      if (q.layer && layerCnt[q.layer] !== undefined) layerCnt[q.layer]++;
    });
    if (listBox) {
      listBox.innerHTML = qs.length
        ? qs
            .map(
              (q, i) =>
                `<div class="list-row"><div style="flex:1"><div class="t-cell-main">${i + 1}. ${esc(q.stem)}</div><div class="t-cell-sub">${q.layer ? `<span class="tag tag-lv${esc(q.layer)}">${esc(q.layer)} 层</span> ` : ''}答案：${esc(q.answer || '—')}${q.analysis ? ` · ${esc(q.analysis)}` : ''}</div></div><span class="iconify" data-icon="ph:check-circle" style="color:var(--green);font-size:18px"></span></div>`,
            )
            .join('')
        : emptyHtml;
    }
    if (chip) chip.textContent = qs.length + ' 题';
    tags.forEach((t, i) => {
      const lv = ['A', 'B', 'C'][i];
      t.textContent = lv + ' 层 ' + (layerCnt[lv] > 0 ? layerCnt[lv] + ' 题' : '— 题');
    });
  } catch (e) {
    console.warn('[paper-preview]', e);
  }
}

function findCardByTitle(rootSel: string, title: string): HTMLElement | null {
  const root = document.querySelector(rootSel);
  if (!root) return null;
  for (const card of root.querySelectorAll('.card')) {
    const t = card.querySelector('.card-title');
    if (t && t.textContent && t.textContent.includes(title)) return card as HTMLElement;
  }
  return null;
}

async function loadSkills(charts: ChartInsts) {
  try {
    const items = await get<any[]>('/skills/self-assessment');
    if (!items || !items.length) return;
    if (charts.radar) {
      charts.radar.setOption({
        tooltip: {},
        radar: {
          indicator: items.map((i) => ({ name: i.key, max: 100 })),
          axisName: { color: '#666', fontSize: 12 },
          splitArea: { areaStyle: { color: ['#FBFBFA', '#F3F2EE'] } },
        },
        series: [{
          type: 'radar',
          data: [{ value: items.map((i) => i.score), name: '当前自评', areaStyle: { color: 'rgba(79,124,240,.25)' }, lineStyle: { color: '#4F7CF0' }, itemStyle: { color: '#4F7CF0' } }],
        }],
      });
    }
    const plan = document.getElementById('skillPlan');
    if (plan) {
      plan.innerHTML =
        '<div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px">最近一次自评得分</div>' +
        items
          .map((i) => `<div class="prow"><div class="pname">${esc(i.key)}</div><div class="ptrack"><i style="width:${Math.max(escNum(i.score), 2)}%;background:linear-gradient(90deg,var(--green),#34D399)"></i></div><div class="pval">${escNum(i.score)}</div></div>`)
          .join('');
    }
  } catch (e) {
    console.warn('[skills]', e);
  }
}

function escNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

let resFilter = '全部';

/** 授权范围渲染：公开领域/CC BY 用对应标签色，其余归 tag-doc */
function licTagOf(license: string): string {
  if (license === '公开领域') return 'tag-ppt';
  if (license === 'CC BY') return 'tag-xls';
  return 'tag-doc';
}

function renderResCard(r: any): string {
  const type = r.type || '资源';
  const isVideo = type === '视频' || type === '微课';
  const ico = isVideo ? 'ph:video' : 'ph:file';
  const grad = isVideo ? 'linear-gradient(135deg,#E0F2FE,#BAE6FD)' : 'linear-gradient(135deg,#EEF0FF,#E0E7FF)';
  const color = isVideo ? 'var(--sky)' : 'var(--primary)';
  return `<div class="res-card"><div class="res-cover" style="background:${grad}"><span class="iconify" data-icon="${ico}" style="color:${color}"></span><span class="type tag tag-lvB">${esc(type)}</span></div>
    <div class="res-body"><div class="res-title">${esc(r.title || '资源')}</div>
    <div class="res-meta"><span class="iconify" data-icon="ph:user"></span> ${esc(r.description || '无描述')} <span style="margin-left:auto">${fmtDate(r.createdAt)}</span></div>
    <div class="res-meta"><span class="tag ${licTagOf(r.license || '自建')}">${esc(r.license || '自建')}</span></div></div></div>`;
}

async function loadLibrary() {
  try {
    const search = ((document.getElementById('resSearch') as HTMLInputElement | null)?.value || '').trim();
    const params = new URLSearchParams();
    if (resFilter !== '全部') params.set('license', resFilter);
    if (search) params.set('q', search);
    const qs = params.toString();
    const res = await get<any[]>('/resources' + (qs ? '?' + qs : ''));
    const grid = document.getElementById('resGrid') as HTMLElement | null;
    if (!grid) return;
    grid.innerHTML = '';
    if (!res || !res.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);font-size:13px;padding:30px">资源库为空 · 上传或生成资源后会显示在这里</div>';
      return;
    }
    grid.innerHTML = res.map(renderResCard).join('');
  } catch (e) {
    console.warn('[resources]', e);
  }
}

/** 资源库筛选条 + 上传模态绑定：license pill / 搜索 debounce / 上传入库（video → video 分类） */
function bindResourceUi() {
  const pill = document.querySelector<HTMLElement>('#page-library .radio-pill[data-field="licenseFilter"]');
  pill?.querySelectorAll('span').forEach((s) => {
    s.addEventListener('click', () => {
      pill.querySelectorAll('span').forEach((x) => x.classList.remove('on'));
      s.classList.add('on');
      resFilter = (s.textContent || '').trim();
      void loadLibrary();
    });
  });
  const search = document.getElementById('resSearch') as HTMLInputElement | null;
  if (search) search.addEventListener('input', debounce(() => void loadLibrary(), 300));
  const add = document.getElementById('resAddBtn');
  add?.addEventListener('click', () => document.getElementById('resModal')?.classList.add('on'));
  const save = document.getElementById('resSaveBtn') as HTMLButtonElement | null;
  save?.addEventListener('click', async () => {
    if (save.disabled) return;
    const title = ((document.getElementById('resTitle') as HTMLInputElement | null)?.value || '').trim();
    const type = (document.getElementById('resType') as HTMLSelectElement | null)?.value;
    const license = (document.getElementById('resLicense') as HTMLSelectElement | null)?.value;
    const file = (document.getElementById('resFile') as HTMLInputElement | null)?.files?.[0];
    if (!title) {
      toast('请填写资源标题', '!');
      return;
    }
    if (!file) {
      toast('请选择文件', '!');
      return;
    }
    const isVideo = file.type.startsWith('video/');
    if (isVideo && file.size > 100 * 1024 * 1024) {
      toast('视频不能超过 100MB', '!');
      return;
    }
    if (!isVideo && file.size > 10 * 1024 * 1024) {
      toast('文件不能超过 10MB', '!');
      return;
    }
    save.disabled = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const up = await upload<any>('/files/upload?category=' + (isVideo ? 'video' : 'document'), fd);
      if (!up?.id) throw new Error('上传未返回文件 ID');
      await post('/resources', { title, type, license, fileId: up.id, description: '' });
      toast('资源已上传');
      closeResModal();
      (document.getElementById('resFile') as HTMLInputElement | null)!.value = '';
      void loadLibrary();
    } catch (e: any) {
      toast('上传失败：' + (e?.message || ''), '!');
    } finally {
      save.disabled = false;
    }
  });
  bindModalClose('#resModal .close, #resModalClose', closeResModal);
}

function closeResModal() {
  document.getElementById('resModal')?.classList.remove('on');
}

async function loadSpeechDocs() {
  try {
    const docs = await get<any[]>('/speech-docs');
    if (!docs || !docs.length) return;
    const rows = docs
      .slice(0, 4)
      .map(
        (d) =>
          `<div class="list-row"><div style="flex:1"><div class="t-cell-main">${esc(d.theme || '发言稿')}</div><div class="t-cell-sub">${esc(d.docType || '')} · ${fmtDate(d.createdAt)} · ${esc(d.duration || '')} 分钟 · 点击查看</div></div><span class="chip chip-blue">已保存</span><span class="iconify" data-icon="ph:caret-right" style="color:var(--faint)"></span></div>`,
      )
      .join('');
    const box = document.getElementById('pm-empty');
    if (box && box.querySelector('.list-row')) {
      box.querySelector('.card-head')?.insertAdjacentHTML('afterend', `<div style="padding:4px 20px 14px">${rows}</div>`);
    } else if (box) {
      box.innerHTML = '<div style="font-size:14px;font-weight:700;margin-bottom:12px">历史发言稿</div>' + rows;
    }
    box?.querySelectorAll('.list-row').forEach((row, i) => {
      row.addEventListener('click', () => openSpeechDoc(docs[i]));
    });
  } catch (e) {
    console.warn('[speech-docs]', e);
  }
}

/** 打开发言稿：有 runId → 跳会话；无（种子数据主路径）→ 详情模态 */
function openSpeechDoc(d: any) {
  if (d?.runId) {
    location.href = 'agent.html?conv=' + d.runId;
    return;
  }
  const modal = document.getElementById('sdModal');
  if (!modal) return;
  document.getElementById('sdModalTitle')!.textContent = `${d.theme || '发言稿'}`;
  const body = document.getElementById('sdModalBody');
  if (body) {
    const meta = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <span class="chip chip-blue">${esc(d.docType || '')}</span>
      <span class="chip chip-green">${esc(d.duration || '')} 分钟</span>
      ${d.audience ? `<span class="chip chip-amber">${esc(d.audience)}</span>` : ''}
    </div>`;
    body.innerHTML = meta + `<div style="font-size:13px;line-height:1.9;white-space:pre-wrap;color:#4b5162">${esc(d.content || '（暂无正文）')}</div>`;
  }
  modal.classList.add('on');
}

function closeSdModal() {
  document.getElementById('sdModal')?.classList.remove('on');
}

function bindSpeechDocModal() {
  bindModalClose('#sdModal .close, #sdModalClose', closeSdModal);
}

const BT_TYPE_LABELS: Record<string, string> = {
  lesson_plan: '教案',
  lessonware: '课件',
  parent_meeting: '家长会',
};

let btItems: any[] = [];

async function loadReturnPackage() {
  try {
    const pkg = await get<any>('/back-to-school/package');
    if (!pkg || !pkg.items) return;
    btItems = pkg.items;
    const grid = document.getElementById('btGrid');
    if (!grid) return;
    if (!btItems.length) {
      grid.innerHTML = '<div class="card" style="padding:28px;text-align:center;color:var(--muted);font-size:13px;border-style:dashed">暂无模板 · 请先运行 seed 初始化模板库</div>';
      return;
    }
    grid.innerHTML = btItems
      .map(
        (it: any) =>
          `<div class="card card-hover"><div class="card-head"><div class="card-title">${esc(it.name || '未命名材料')}</div></div><div style="padding:16px 20px"><div style="font-size:12.5px;color:var(--muted);line-height:1.8;margin-bottom:12px">${esc(it.preview || '')}</div><div style="display:flex;align-items:center;gap:10px"><span class="chip chip-green">${esc(it.license || '自建')}</span>${it.type ? `<span class="chip chip-blue">${esc(BT_TYPE_LABELS[it.type] || it.type)}</span>` : ''}<button class="btn btn-ghost btn-sm" style="margin-left:auto" data-bt-open="1" data-bt-id="${esc(String(it.id))}">预览/编辑</button></div></div></div>`,
      )
      .join('');
    grid.querySelectorAll('[data-bt-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number((btn as HTMLElement).dataset.btId);
        const it = btItems.find((x) => x.id === id) || btItems[0];
        openBtItem(it);
      });
    });
  } catch (e) {
    console.warn('[return-pkg]', e);
  }
}

/* ================= 开学材料包：预览/编辑模态 ================= */

let btEditId = 0;

function openBtItem(it: any) {
  btEditId = it?.id ?? 0;
  const modal = document.getElementById('btModal');
  const body = document.getElementById('btModalBody');
  if (!modal || !body) return;
  document.getElementById('btModalTitle')!.textContent = it?.name || '材料预览';
  body.innerHTML =
    '<div style="display:flex;gap:10px;margin-bottom:14px"><span class="chip chip-green">' + esc(it?.license || '') + '</span></div>' +
    '<textarea class="input" id="btEditArea" style="min-height:320px;font-size:13px">' + esc(it?.content || it?.preview || '') + '</textarea>';
  modal.classList.add('on');
}

function closeBtModal() {
  document.getElementById('btModal')?.classList.remove('on');
}

function bindBtModal() {
  const save = document.getElementById('btSaveBtn');
  let saving = false;
  save?.addEventListener('click', async () => {
    if (saving) return;
    const area = document.getElementById('btEditArea') as HTMLTextAreaElement | null;
    if (!area || !btEditId) {
      toast('无内容可保存');
      return;
    }
    saving = true;
    const btn = document.getElementById('btSaveBtn') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    try {
      const r = await patch('/back-to-school/package/' + btEditId, { content: area.value });
      if (r?.ok) {
        toast('修改已保存');
        void loadReturnPackage();
      } else toast('保存失败', '!');
    } catch (e: any) {
      toast(e?.message || '保存失败', '!');
    } finally {
      saving = false;
      if (btn) btn.disabled = false;
    }
  });
  bindModalClose('#btModal .close, #btModalClose', closeBtModal);
}

async function loadKnowledgeBase() {
  try {
    const kb = await get<any[]>('/knowledge-base');
    if (!kb || !kb.length) return;
    const page = document.getElementById('page-leftbehind');
    if (!page) return;
    const rows = kb
      .map(
        (k) =>
          `<div class="list-row"><div style="flex:1"><div class="t-cell-main">${esc(k.title)}</div><div class="t-cell-sub">${esc(k.category || '')} · ${esc(k.content || '')}</div></div><span class="chip chip-amber">${esc(k.scene || '')}</span></div>`,
      )
      .join('');
    const target = page.querySelector('.card') || page.querySelector('.grid');
    if (target) {
      target.insertAdjacentHTML('afterend', `<div class="card" id="kbCard" style="margin-top:18px"><div class="card-head"><div class="card-title">知识库 · 家校沟通要点</div></div><div style="padding:4px 20px 14px">${rows}</div></div>`);
    }
  } catch (e) {
    console.warn('[kb]', e);
  }
}

async function loadCollab() {
  try {
    const [groups, feed] = await Promise.all([
      get<any[]>('/collab/groups'),
      get<any[]>('/collab/feed'),
    ]);
    const grid = document.getElementById('collabGrid');
    if (grid && groups && groups.length) {
      grid.innerHTML = groups
        .map(
          (g) =>
            `<div class="card card-pad"><div class="card-head"><div class="card-title">${esc(g.name)}</div></div><div style="font-size:12.5px;color:var(--muted);line-height:1.8">成员 ${esc(g.members ?? 0)} 人 · 动态 ${esc(g.notes ?? 0)} 条</div><div style="margin-top:10px"><span class="chip ${g.status === 'ongoing' ? 'chip-green' : 'chip-blue'}">${esc(statusText(g.status))}</span></div></div>`,
        )
        .join('');
    }
    const tl = document.getElementById('collabTimeline');
    if (tl && feed && feed.length) {
      tl.innerHTML = feed
        .map(
          (f) =>
            `<div class="tl-item"><div class="tl-dot"></div><div style="flex:1"><div style="font-size:13px;line-height:1.7">${esc(f.content || '')}</div><div style="font-size:11px;color:var(--muted);margin-top:3px">${fmtDate(f.createdAt)}</div></div></div>`,
        )
        .join('');
    }
  } catch (e) {
    console.warn('[collab]', e);
  }
}

/* ================= 导航刷新 ================= */

function bindNavRefresh() {
  const refreshMap: Record<string, () => void> = {
    dashboard: () => void loadDashboard(chartsRef()),
    collab: () => void loadCollab(),
  };
  document.querySelectorAll('.nav-item').forEach((nav) => {
    nav.addEventListener('click', () => {
      const page = (nav as HTMLElement).dataset.page;
      const fn = page && refreshMap[page];
      if (fn) fn();
      window.setTimeout(() => resizeCharts(), 160);
    });
  });
}

function chartsRef(): ChartInsts {
  return {
    ring: window._chartInsts?.[0],
    trend: window._chartInsts?.[1],
    radar: window._chartInsts?.[2],
    mini: window._chartInsts?.[3],
  };
}

function bindCollabWizard() {
  preempt('#prepWizSub', () => toast('协作备课已进入模拟流程（演示）'));
}

/* ================= 职称材料上传 ================= */

function bindTitleUpload() {
  const zone = document.getElementById('titleDrop');
  const input = document.getElementById('titleFiles') as HTMLInputElement | null;
  if (!zone || !input) return;
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    handleTitleFiles(input.files);
    input.value = '';
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag');
    if (e.dataTransfer?.files?.length) handleTitleFiles(e.dataTransfer.files);
  });
}

async function handleTitleFiles(files: FileList | null) {
  if (!files || !files.length) return;
  const queue = document.getElementById('titleQueue');
  const list: Array<{ name: string; size: number; fileId: string }> = [];
  for (const f of Array.from(files).slice(0, 20)) {
    const row = document.createElement('div');
    row.className = 'list-row';
    row.style.border = '1px solid var(--border)';
    row.style.borderRadius = '10px';
    row.innerHTML = `<div class="row-icon" style="background:var(--primary-soft);color:var(--primary)"><span class="iconify" data-icon="ph:file"></span></div><div style="flex:1"><div class="t-cell-main">${esc(f.name)}</div><div class="t-cell-sub">${(f.size / 1024).toFixed(1)} KB · 上传中…</div></div>`;
    if (queue) queue.appendChild(row);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const r = await upload('/files/upload?category=document', fd);
      list.push({ name: f.name, size: f.size, fileId: r?.id || '' });
      row.querySelector('.t-cell-sub')!.textContent = '已上传 · 待智能体分类';
      row.querySelector('.row-icon')!.innerHTML = '<span class="iconify" data-icon="ph:check-circle" style="color:var(--green)"></span>';
    } catch (e: any) {
      row.querySelector('.t-cell-sub')!.textContent = '上传失败：' + (e?.message || '未知错误');
    }
  }
  sessionStorage.setItem('xy.title.files', JSON.stringify(list));
  classifyTitleHeuristic(list);
}

/** 启发式预分类（四类桶 + 关键词；first-match-wins，规则顺序即优先级） */
function classifyTitleHeuristic(files: Array<{ name: string; size: number; fileId: string }>) {
  const bucket: Record<string, string[]> = { '获奖证书': [], '论文与课题': [], '继续教育': [], '任职与教案': [] };
  const rules: Array<[string, RegExp]> = [
    ['获奖证书', /获奖|荣誉|表彰|能手|优质课/],
    ['论文与课题', /论文|课题|发表|教研|著作|教材/],
    ['继续教育', /证书|培训|研修|国培|省培|学时|结业|普通话|信息技术/],
    ['任职与教案', /教案|任职|班主任|聘书|证明|职称/],
  ];
  files.forEach((f) => {
    const hit = rules.find(([, re]) => re.test(f.name));
    bucket[hit ? hit[0] : '任职与教案'].push(f.name);
  });
  const box = document.getElementById('title-empty');
  if (!box) return;
  box.innerHTML = '<div style="font-size:14px;font-weight:700;color:var(--ink);margin-bottom:12px">预分类结果 <span class="chip chip-amber" style="margin-left:6px">启发式 · 以智能体正式分类为准</span></div>' +
    Object.entries(bucket)
      .filter(([, v]) => v.length)
      .map(([k, v]) => `<div class="list-row"><div class="row-icon" style="background:var(--primary-soft);color:var(--primary)"><span class="iconify" data-icon="ph:folder"></span></div><div style="flex:1"><div class="t-cell-main">${k} <span class="chip chip-blue" style="margin-left:6px">${v.length} 份</span></div><div class="t-cell-sub">${esc(v.join(' · ').slice(0, 80))}</div></div></div>`)
      .join('');
}

/* ================= 教研员：教案文件解析注入 ================= */

/** resTab1 上传条：docx/pdf → /files/extract-text → 文本注入「教案材料」输入区（可编辑） */
function bindResUpload() {
  const btn = document.getElementById('resUpBtn') as HTMLButtonElement | null;
  const input = document.getElementById('resUpFile') as HTMLInputElement | null;
  if (!btn || !input) return;
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast('文件不能超过 10MB', '!');
      return;
    }
    btn.disabled = true;
    const status = document.getElementById('resUpStatus');
    if (status) status.textContent = '解析中…';
    try {
      const fd = new FormData();
      fd.append('file', f);
      const r = await upload<{ text?: string; name?: string; chars?: number; truncated?: boolean }>('/files/extract-text', fd);
      const ta = document.querySelector<HTMLTextAreaElement>('#resTab1 textarea');
      if (!r?.text) throw new Error('解析结果为空，请直接粘贴文本');
      if (ta) {
        ta.value = (ta.value.trim() ? ta.value.trim() + '\n\n' : '') + r.text.slice(0, 60000);
        ta.style.minHeight = '260px';
      }
      if (status) status.textContent = `已解析「${r.name || f.name}」（${r.chars ?? r.text.length} 字${r.truncated ? '，内容过长已截断' : ''}）并注入输入区，可编辑后发送`;
      toast('教案已解析并注入');
    } catch (e: any) {
      if (status) status.textContent = '解析失败：' + (e?.message || '未知错误');
      toast('解析失败', '!');
    } finally {
      btn.disabled = false;
      input.value = '';
    }
  });
}

/* ================= 启动 ================= */

async function boot() {
  const user = await requireRole(['teacher'], { preview: isPreviewMode() });
  setUserCard(user);
  if (isPreviewMode()) showPreviewBanner(user.role);

  const charts: ChartInsts = {
    ring: window._chartInsts?.[0],
    trend: window._chartInsts?.[1],
    radar: window._chartInsts?.[2],
    mini: window._chartInsts?.[3],
  };
  [charts.ring, charts.trend, charts.radar, charts.mini].forEach((c) => c && regChart(c));

  bindGlobalControls();
  bindSendAgent();
  applyRes2SentMarker();
  bindPaperDownload();
  bindTeleprompterTemplates();
  bindNavRefresh();
  bindCollabWizard();
  bindPlanModal();
  bindSpeechDocModal();
  bindBtModal();
  bindTitleUpload();
  bindResUpload();
  bindResourceUi();

  await Promise.all([
    loadDashboard(charts),
    loadLessonList(),
    refreshPaperPreview(),
    loadSkills(charts),
    loadLibrary(),
    loadSpeechDocs(),
    loadReturnPackage(),
    loadKnowledgeBase(),
    loadCollab(),
  ]);
}

function setUserCard(user: SafeUser) {
  setText('.user-card .user-name', `${user.displayName} 老师`);
  setText('.user-card .user-role', `五年级 语文 ｜ 云溪镇中心小学`);
  const av = document.querySelector('.user-card .avatar');
  if (av) av.textContent = initialsOf(user.displayName);
  fixRoleLinks();
  fixPreviewLinks(user.role);
}

declare global {
  interface Window {
    _chartInsts?: any[];
    closePlanModal: () => void;
    closeSdModal: () => void;
    closeBtModal: () => void;
    closeResModal: () => void;
  }
}

window.closePlanModal = closePlanModal;
window.closeSdModal = closeSdModal;
window.closeBtModal = closeBtModal;
window.closeResModal = closeResModal;

boot().catch((e) => {
  console.error('[teacher-main]', e);
  if (!(e instanceof ApiError)) location.href = 'login.html';
});

import { esc, toast, btnBusy, preempt } from '../core/ui';
import { streamAgentChat, AgentEv } from '../core/agent-stream';
import { stripMd } from '../core/agent-view';
import { isPreviewMode } from '../core/guard';

/** 管理端 AI 任务注册表：每个入口 = 一个精炼治理任务（行动建议优先，去“报告”化） */
interface AiTask {
  label: string;
  task: string;
}

const AI_TASKS: Record<string, AiTask> = {
  overview: {
    label: '全域盘点',
    task: '盘点当前区域学情概览与全部预警（控辍保学/心理防欺凌/师资/资源均衡），指出最需要处置的 3 件事，每件给出：数据依据、建议动作、建议责任方。300 字内，直接给结论，不要客套话。',
  },
  region: {
    label: '区域诊断',
    task: '基于区域学情概览数据，诊断当前最需关注的 3 个问题，说明数据依据，给出下一步行动建议。300 字内，直接给结论。',
  },
  dropout: {
    label: '控辍分析',
    task: '分析最新控辍保学预警列表，指出最紧急的 3 个预警，给出处置建议（建议责任人与时限）。300 字内，直接给结论。',
  },
  mental: {
    label: '心理分析',
    task: '分析心理与防欺凌预警列表，给出处置优先级建议（按预警分级说明谁介入、何时介入）。300 字内，直接给结论。',
  },
  teacher: {
    label: '师资分析',
    task: '分析师资结构预警与教师画像数据，指出缺口最大的学科与学校，给出补员或调配建议。300 字内，直接给结论。',
  },
  balance: {
    label: '均衡分析',
    task: '分析城乡资源均衡相关预警与区域数据，指出差距最大的 3 项，给出优先改进建议。300 字内，直接给结论。',
  },
};

/** 工具英文名 → 中文可读名（轨迹展示用） */
const TOOL_LABELS: Record<string, string> = {
  get_region_overview: '区域学情概览',
  list_alerts: '预警列表',
  get_teacher_profile: '教师画像',
  search_knowledge: '知识库检索',
  get_class_overview: '班级学情概览',
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] || name;
}

/** 绑定所有 [data-ai-task] 按钮：点击 → 打开 AI 治理弹窗（SSE 流式） */
export function bindAiButtons(): void {
  preempt('[data-ai-task]', (btn) => {
    const key = btn.dataset.aiTask || '';
    const cfg = AI_TASKS[key];
    if (!cfg) {
      toast('未知 AI 任务');
      return;
    }
    void openAiModal(key, cfg, btn);
  });
  // 「智能体工作台」：跳转 agent.html（与教师智能体同款对话界面，可自由追问）
  preempt('[data-ai-agent]', () => {
    location.href = 'agent.html' + (isPreviewMode() ? '?preview=1' : '');
  });
}

async function openAiModal(key: string, cfg: AiTask, trigger: HTMLElement): Promise<void> {
  btnBusy(trigger, true);
  const mask = document.createElement('div');
  mask.style.cssText =
    'position:fixed;inset:0;background:rgba(15,15,20,.55);z-index:300;display:flex;align-items:center;justify-content:center';
  const card = document.createElement('div');
  card.style.cssText =
    'width:520px;max-width:92vw;max-height:78vh;display:flex;flex-direction:column;background:#fff;border-radius:16px;overflow:hidden';
  card.innerHTML =
    `<div style="display:flex;align-items:center;gap:8px;padding:14px 20px;border-bottom:1px solid #EEF2F7">` +
    `<span class="iconify" data-icon="ph:sparkle" style="color:var(--sky,#0EA5E9)"></span>` +
    `<div style="font-size:15px;font-weight:900;flex:1">AI 治理助手 · ${esc(cfg.label)}</div>` +
    `<span id="aiStatus" style="font-size:11.5px;color:var(--muted);font-weight:600">准备分析…</span>` +
    `<span style="cursor:pointer;color:#94A3B8;font-size:16px" data-ai-close>✕</span></div>` +
    `<div style="padding:14px 20px;border-bottom:1px dashed #EEF2F7" data-ai-trace style="display:none">` +
    `<div style="font-size:11px;font-weight:700;color:var(--faint);margin-bottom:8px">分析轨迹</div>` +
    `<div data-ai-trace-body style="display:flex;flex-direction:column;gap:6px"></div></div>` +
    `<div style="padding:16px 20px;flex:1;overflow-y:auto;font-size:13px;line-height:1.9;color:#334155" data-ai-answer>正在分析…</div>` +
    `<div style="padding:12px 20px;border-top:1px solid #EEF2F7"><button class="btn btn-primary" style="width:100%" data-ai-close>知道了</button></div>`;
  mask.appendChild(card);
  document.body.appendChild(mask);

  const statusEl = card.querySelector('#aiStatus') as HTMLElement | null;
  const traceBody = card.querySelector('[data-ai-trace-body]') as HTMLElement | null;
  const traceWrap = card.querySelector('[data-ai-trace]') as HTMLElement | null;
  const answerEl = card.querySelector('[data-ai-answer]') as HTMLElement | null;
  const closeAll = () => {
    mask.remove();
    btnBusy(trigger, false);
  };
  card.querySelectorAll('[data-ai-close]').forEach((el) => el.addEventListener('click', closeAll));

  const handleEvent = (ev: AgentEv) => {
    switch (ev.type) {
      case 'thinking': {
        if (statusEl) statusEl.textContent = '分析中…';
        if (answerEl && answerEl.dataset.first !== '1') {
          answerEl.textContent = stripMd(ev.text);
        }
        break;
      }
      case 'tool_start': {
        if (statusEl) statusEl.textContent = '读取数据…';
        if (traceWrap) traceWrap.style.display = 'block';
        if (traceBody) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)';
          row.dataset.tool = ev.name;
          row.innerHTML = `<span style="color:var(--sky)">↳</span> ${esc(toolLabel(ev.name))} <span style="color:var(--faint)">读取中…</span>`;
          traceBody.appendChild(row);
        }
        break;
      }
      case 'tool_end': {
        const row = traceBody?.querySelector<HTMLElement>(`[data-tool="${CSS.escape(ev.name)}"]`);
        if (row) {
          row.innerHTML = ev.error
            ? `<span style="color:var(--rose,#F43F5E)">✕</span> ${esc(toolLabel(ev.name))} <span style="color:var(--rose)">失败</span>`
            : `<span style="color:var(--green,#10B981)">✓</span> ${esc(toolLabel(ev.name))} <span style="color:var(--faint)">${Math.round(ev.durationMs)}ms</span>`;
        }
        break;
      }
      case 'text_delta': {
        answerEl.dataset.first = '1';
        answerEl.textContent += ev.delta;
        break;
      }
      case 'done': {
        if (statusEl) statusEl.textContent = '完成';
        if (answerEl) answerEl.textContent = stripMd(ev.finalText);
        break;
      }
      case 'error': {
        if (statusEl) statusEl.textContent = '出错';
        if (answerEl) answerEl.textContent = ev.text;
        break;
      }
      case 'usage':
      case 'task_start':
      case 'task_end':
        break;
    }
  };

  try {
    await streamAgentChat(cfg.task, handleEvent, { redirectOn401: false });
    // 流结束未收到 done（异常中断）时,answer 保留已流式内容
  } catch (e: any) {
    if (statusEl) statusEl.textContent = '失败';
    if (answerEl) answerEl.textContent = (e?.message || '生成失败') + '，请稍后重试。';
  } finally {
    btnBusy(trigger, false);
  }
}
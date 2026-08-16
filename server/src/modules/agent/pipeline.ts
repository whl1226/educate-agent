import type { ToolCallRecord, ToolContext, ToolRegistry } from './tool-registry';
import type { AgentEvent } from './agent-graph';
import { runSubagent } from './subagent';

export type PipelineStep =
  | { kind: 'tool'; tool: string; args: Record<string, unknown>; label: string; capture?: string; collectRefs?: boolean }
  | { kind: 'parallel'; label: string; steps: PipelineStep[] };

export interface PipelineTemplate {
  name: string;
  description: string;
  steps: PipelineStep[];
}

export type PipelineVars = Record<string, string | number>;

/** capture 预览上限：注入下游的是"结果预览"而非完整数据（下游不得依赖其可解析为完整 JSON） */
const CAPTURE_MAX = 1500;
const CAPTURE_TRUNCATED_MARK = '...[truncated]';

/** '${topic}' → vars.topic（DSH workflow 组合子的模板化参数）；缺失变量 fail-fast */
export function renderArgs(args: Record<string, unknown>, vars: PipelineVars): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = typeof v === 'string'
      ? v.replace(/\$\{(\w+)\}/g, (_, name: string) => {
          if (vars[name] === undefined) throw new Error(`pipeline 变量未提供: ${name}`);
          return String(vars[name]);
        })
      : v;
  }
  return out;
}

/** 截断不拆 UTF-16 代理对：Array.from 按 Unicode 码点切分，并追加截断标记 */
function capturePreview(result: unknown): string {
  const raw = JSON.stringify(result ?? {});
  if (raw.length <= CAPTURE_MAX) return raw;
  const truncated = Array.from(raw).slice(0, CAPTURE_MAX).join('');
  return `${truncated}${CAPTURE_TRUNCATED_MARK}`;
}

export interface PipelineResult {
  toolCalls: ToolCallRecord[];
  refs: string[];
  needsHuman: boolean;
}

/**
 * 流水线执行器（DSH pipeline 组合子的轻量版）：串行步 + 并行屏障。
 * 与自由 ReAct 互补：固定高价值流程用模板保证结构一致性，其余交给模型自主。
 * 安全设计：流水线模板为预置可信流程，工具调用走 registry 内建权限校验（垂直/水平越权），
 * 但不挂审批策略链 hooks——审批仅作用于 LLM 自由发起的工具调用（agent-graph 内透传 pipelineHooks）。
 * needsHuman 语义：与 agent-graph 的 demo/LLM 模式（末步失败+自愈逻辑）不同，
 * 模板场景为严格闩锁——任一步失败即 true 且不重置（流水线无自愈能力，任何环节失败都需人工介入）。
 */
export async function runPipeline(
  registry: ToolRegistry,
  ctx: ToolContext,
  template: PipelineTemplate,
  vars: PipelineVars,
  onEvent?: (ev: AgentEvent) => void | Promise<void>,
): Promise<PipelineResult> {
  const liveVars: PipelineVars = { ...vars };
  const toolCalls: ToolCallRecord[] = [];
  const refs: string[] = [];
  let needsHuman = false;

  /** 执行工具（不落记录不发事件）：副作用仅限 needsHuman 闩锁 / refs 收集 / capture 写 liveVars */
  const callTool = async (step: { tool: string; args: Record<string, unknown>; capture?: string; collectRefs?: boolean }) => {
    const args = renderArgs(step.args, liveVars);
    const rec = await registry.call(ctx, step.tool, args);
    if (rec.error) needsHuman = true;
    if (step.collectRefs && (rec.result as Array<{ ref: string }> | undefined)?.length) {
      (rec.result as Array<{ ref: string }>).forEach((c) => refs.push(c.ref));
    }
    if (step.capture) {
      liveVars[step.capture] = capturePreview(rec.result);
    }
    return { step, rec, args };
  };

  /** 按模板顺序提交一次调用：发事件 + 落 toolCalls。
   * subEmitted：子代理已内部发事件（tool_start/tool_end），此处仅落库不再重复发。
   * 顺序语义：parallel 分支事件由子代理按完成序交错发出（SSE 事件流），而 toolCalls 始终按模板序落库（轨迹记录）——
   * 两者顺序不一致为设计内取舍（子代理自发事件）；未来若并行分支调用同名工具，按 name 关联事件/时长可能错配，
   * 当前模板无同名并行工具，无实际影响。 */
  const commitCall = async (step: { tool: string }, args: Record<string, unknown>, rec: ToolCallRecord, subEmitted = false) => {
    if (onEvent && !subEmitted) await onEvent({ type: 'tool_start', name: step.tool, args });
    toolCalls.push(rec);
    if (onEvent && !subEmitted) await onEvent({ type: 'tool_end', name: step.tool, result: rec.result, error: rec.error, durationMs: rec.durationMs });
  };

  /** 返回本步树中所有调用的收集结果（按模板声明顺序）：Promise.all 保索引序，flat 后即模板序。
   * depth：嵌套委派深度上下文（顶层 1，每层 parallel 嵌套 +1）——子代理深度预算真实约束嵌套委派层数 */
  const runStep = async (step: PipelineStep, depth: number): Promise<Array<{ step: { tool: string }; rec: ToolCallRecord; args: Record<string, unknown>; subEmitted?: boolean }>> => {
    if (step.kind === 'tool') return [await callTool(step)];
    const groups = await Promise.all(step.steps.map(async (s) => {
      if (s.kind === 'parallel') return runStep(s, depth + 1);
      // capture 仅串行步（liveVars 顺序依赖）：并行分支带 capture 直接 fail-fast，与 renderArgs 缺失变量一致
      if (s.capture) throw new Error(`并行步骤不支持 capture: ${s.tool}`);
      // 并行 tool 子步委派子智能体：白名单仅本工具（DSH 委派权限固定）、独立上下文、深度预算 depth+1；
      // 事件由子代理内部发出（tool_start/tool_end/被拒 thinking），外层 commit 仅合并落库
      const args = renderArgs(s.args, liveVars);
      const sub = await runSubagent(
        registry, ctx,
        { prompt: s.label, allowedTools: [s.tool], depth: depth + 1 },
        [{ tool: s.tool, args, label: s.label }],
        onEvent,
      );
      // 白名单拒绝（正常不触发：白名单即本工具）或工具错误 → 人工介入闩锁
      if (sub.refused.length > 0 || sub.toolCalls.some((rec) => rec.error)) needsHuman = true;
      for (const rec of sub.toolCalls) {
        if (s.collectRefs && (rec.result as Array<{ ref: string }> | undefined)?.length) {
          (rec.result as Array<{ ref: string }>).forEach((c) => refs.push(c.ref));
        }
      }
      return sub.toolCalls.map((rec) => ({ step: { tool: s.tool }, rec, args, subEmitted: true }));
    }));
    return groups.flat();
  };

  for (const step of template.steps) {
    for (const call of await runStep(step, 1)) {
      await commitCall(call.step, call.args, call.rec, call.subEmitted);
    }
  }
  return { toolCalls, refs, needsHuman };
}

/** 备课流水线模板：教材检索+班级学情并行 → 教案生成 → 教研质检（自愈闭环由质检结果驱动） */
export const LESSON_PLAN_PIPELINE: PipelineTemplate = {
  name: 'lesson_plan',
  description: '备课流水线：并行检索教材与学情 → 教案生成 → 教研点评质检',
  steps: [
    {
      kind: 'parallel',
      label: '并行：教材检索 + 班级学情',
      steps: [
        { kind: 'tool', tool: 'search_knowledge', args: { query: '${topic}', topK: 5 }, label: '教材检索', collectRefs: true },
        { kind: 'tool', tool: 'get_class_overview', args: { classId: '${classId}' }, label: '学情概览' },
      ],
    },
    { kind: 'tool', tool: 'generate_lesson_plan', args: { subject: '${subject}', grade: '${grade}', topic: '${topic}' }, label: '教案生成', capture: 'planSummary' },
    { kind: 'tool', tool: 'researcher_comment', args: { sourceContent: '${planSummary}' }, label: '教研质检' },
  ],
};

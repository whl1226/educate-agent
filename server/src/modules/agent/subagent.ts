import type { ToolCallRecord, ToolContext, ToolRegistry } from './tool-registry';
import type { AgentEvent } from './agent-graph';

export const MAX_SUBAGENT_DEPTH = 3;

export interface SubagentOptions {
  prompt: string;
  /** 工具白名单（显式声明，缺省拒绝一切——DSH 委派权限固定 + Kimi disallowedTools 双校验） */
  allowedTools: string[];
  depth?: number;
}

export interface SubagentStep {
  tool: string;
  args: Record<string, unknown>;
  label: string;
}

export interface SubagentResult {
  finalText: string;
  toolCalls: ToolCallRecord[];
  refused: string[];
}

/**
 * 子智能体执行器（第一期：受限作用域的确定性步骤执行，为分节并行备课打底）：
 * 1. 权限收窄：仅 allowedTools 白名单内可执行，其余记 refused（拒绝执行而非报错中断）；
 * 2. 上下文隔离：结果只经返回值回流，不写入主对话 messages（Kimi subagent 独立上下文）；
 * 3. 深度预算：嵌套委派超 MAX_SUBAGENT_DEPTH 直接拒绝（DSH resolveChildDepth）——
 *    与白名单拒绝同语义：steps 全量记入 refused + thinking 事件，不静默丢失（pipeline 并行分支 needsHuman 闩锁生效）。
 */
export async function runSubagent(
  registry: ToolRegistry,
  ctx: ToolContext,
  opts: SubagentOptions,
  steps: SubagentStep[],
  onEvent?: (ev: AgentEvent) => void | Promise<void>,
): Promise<SubagentResult> {
  const depth = Math.max(1, opts.depth ?? 1);
  if (depth > MAX_SUBAGENT_DEPTH) {
    if (onEvent) await onEvent({ type: 'thinking', text: '子代理深度超限，拒绝委派' });
    return { finalText: `子代理深度超限（${depth} > ${MAX_SUBAGENT_DEPTH}），拒绝委派`, toolCalls: [], refused: steps.map((s) => s.tool) };
  }
  const allowed = new Set(opts.allowedTools);
  const toolCalls: ToolCallRecord[] = [];
  const refused: string[] = [];

  for (const step of steps) {
    if (!allowed.has(step.tool)) {
      refused.push(step.tool);
      if (onEvent) await onEvent({ type: 'thinking', text: `子代理「${opts.prompt.slice(0, 30)}」被拒工具：${step.tool}（不在白名单）` });
      continue;
    }
    if (onEvent) await onEvent({ type: 'tool_start', name: step.tool, args: step.args });
    const rec = await registry.call(ctx, step.tool, step.args);
    toolCalls.push(rec);
    if (onEvent) await onEvent({ type: 'tool_end', name: step.tool, result: rec.result, error: rec.error, durationMs: rec.durationMs });
  }

  return {
    finalText: `子代理完成：${toolCalls.length} 步成功，${refused.length} 步被白名单拒绝`,
    toolCalls,
    refused,
  };
}

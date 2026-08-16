export type PolicyResult =
  | { kind: 'approve'; reason?: string }
  | { kind: 'deny'; reason?: string; message?: string }
  | { kind: 'ask'; reason?: string };

export interface ToolPolicy {
  readonly name: string;
  decide(role: string, toolName: string, args: Record<string, unknown>): PolicyResult | null;
}

/** 敏感数据工具：学生家庭信息/教师画像/心理与控辍预警/班级风险学生 → ask（Kimi sensitive-file-access-ask 教育版） */
export const SENSITIVE_TOOLS = new Set<string>([
  'get_weekly_report',
  'get_teacher_profile',
  'list_alerts',
  'get_class_overview',
]);

/** 敏感工具中文标签（单一来源）：系统提示词权限段据此渲染，避免文案与 SENSITIVE_TOOLS 漂移 */
export const SENSITIVE_TOOL_LABELS: Record<string, string> = {
  get_weekly_report: '周报',
  get_teacher_profile: '教师画像',
  list_alerts: '预警',
  get_class_overview: '班级概览',
};

export const sensitiveDataPolicy: ToolPolicy = {
  name: 'sensitive-data-ask',
  decide(_role, toolName) {
    if (SENSITIVE_TOOLS.has(toolName)) {
      return { kind: 'ask', reason: '涉及学生隐私/家庭/心理敏感数据，需审批' };
    }
    return null;
  },
};

export const defaultAllowPolicy: ToolPolicy = {
  name: 'default-allow',
  decide() {
    return { kind: 'approve', reason: '常规工具默认放行' };
  },
};

export const fallbackAskPolicy: ToolPolicy = {
  name: 'fallback-ask',
  decide() {
    return { kind: 'ask', reason: '未匹配任何策略，兜底询问' };
  },
};

export type PolicyChainMode = 'off' | 'strict';

/** off=向后兼容（全放行）；strict=敏感工具询问 + fail-closed */
export function buildPolicyChain(mode: PolicyChainMode): readonly ToolPolicy[] {
  if (mode === 'strict') return [sensitiveDataPolicy, defaultAllowPolicy, fallbackAskPolicy];
  return [defaultAllowPolicy];
}

export function runPolicyChain(
  chain: readonly ToolPolicy[],
  role: string,
  toolName: string,
  args: Record<string, unknown>,
): PolicyResult {
  for (const p of chain) {
    const r = p.decide(role, toolName, args);
    if (r) return r;
  }
  return { kind: 'ask', reason: '策略链耗尽，兜底询问' };
}

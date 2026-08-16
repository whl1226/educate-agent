import { describe, expect, it } from 'vitest';
import { buildPolicyChain, runPolicyChain, SENSITIVE_TOOLS, SENSITIVE_TOOL_LABELS } from '../sensitive-data-policy';

describe('sensitive data policy chain', () => {
  it('strict 模式：敏感工具 → ask', () => {
    const chain = buildPolicyChain('strict');
    const r = runPolicyChain(chain, 'parent', 'get_weekly_report', {});
    expect(r.kind).toBe('ask');
  });

  it('strict 模式：常规工具 → approve（不打断日常流程）', () => {
    const chain = buildPolicyChain('strict');
    const r = runPolicyChain(chain, 'teacher', 'generate_lesson_plan', { subject: '语文' });
    expect(r.kind).toBe('approve');
  });

  it('off 模式：一切 approve（向后兼容默认值）', () => {
    const chain = buildPolicyChain('off');
    expect(runPolicyChain(chain, 'parent', 'get_weekly_report', {}).kind).toBe('approve');
    expect(runPolicyChain(chain, 'admin', 'list_alerts', {}).kind).toBe('approve');
  });

  it('敏感清单覆盖学生隐私/家庭/心理/画像类工具', () => {
    expect(SENSITIVE_TOOLS.has('get_weekly_report')).toBe(true);
    expect(SENSITIVE_TOOLS.has('get_teacher_profile')).toBe(true);
    expect(SENSITIVE_TOOLS.has('list_alerts')).toBe(true);
  });

  it('SENSITIVE_TOOLS 与 SENSITIVE_TOOL_LABELS 的 key 集合一致（两常量单源对齐）', () => {
    expect(new Set(Object.keys(SENSITIVE_TOOL_LABELS))).toEqual(SENSITIVE_TOOLS);
  });
});

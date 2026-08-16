import { describe, expect, it, vi } from 'vitest';
import { buildRegistry, type ToolBindings, type ToolContext } from '../tool-registry';
import { MAX_SUBAGENT_DEPTH, runSubagent } from '../subagent';

const ctx: ToolContext = { userId: 5, role: 'teacher', user: { id: 5, username: 'u5', role: 'teacher', jti: 'j', scopeKey: '5' } };

describe('runSubagent', () => {
  it('白名单收窄：白名单外工具被拒绝并记入 refused（委派权限固定）', async () => {
    const b = {
      search_knowledge: vi.fn(async () => []),
      get_class_overview: vi.fn(async () => ({ total: 1 })),
    } as unknown as ToolBindings;
    const r = buildRegistry(b);
    const out = await runSubagent(r, ctx, { prompt: '检索', allowedTools: ['search_knowledge'] }, [{ tool: 'get_class_overview', args: { classId: 1 }, label: '越权尝试' }]);
    expect(out.toolCalls).toHaveLength(0);
    expect(out.refused).toEqual(['get_class_overview']);
  });

  it('白名单内工具正常执行，结果独立回流', async () => {
    const b = {
      search_knowledge: vi.fn(async () => [{ ref: 'chunk:9' }]),
    } as unknown as ToolBindings;
    const r = buildRegistry(b);
    const out = await runSubagent(r, ctx, { prompt: '检索', allowedTools: ['search_knowledge'] }, [{ tool: 'search_knowledge', args: { query: '草船' }, label: '检索' }]);
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0].result).toEqual([{ ref: 'chunk:9' }]);
  });

  it('深度超限拒绝委派（防递归爆炸）：steps 全量记 refused + thinking 事件，不静默丢失', async () => {
    const r = buildRegistry({} as ToolBindings);
    const events: { type: string; text: string }[] = [];
    const out = await runSubagent(r, ctx, { prompt: 'x', allowedTools: [], depth: MAX_SUBAGENT_DEPTH + 1 }, [
      { tool: 'get_class_overview', args: { classId: 1 }, label: '委派步骤1' },
      { tool: 'search_knowledge', args: { query: 'q' }, label: '委派步骤2' },
    ], (ev) => { events.push(ev as { type: string; text: string }); });
    expect(out.finalText).toContain('深度超限');
    expect(out.refused).toEqual(['get_class_overview', 'search_knowledge']);
    expect(events).toContainEqual({ type: 'thinking', text: '子代理深度超限，拒绝委派' });
  });
});

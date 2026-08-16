import { describe, expect, it } from 'vitest';
import { buildRequestSnapshot } from '../request-snapshot';

describe('buildRequestSnapshot', () => {
  const schemas = [{ function: { name: 'search_knowledge' } }, { function: { name: 'run_diagnosis' } }];

  it('快照含模型/温度/提示词哈希/工具哈希/工具清单', () => {
    const s = buildRequestSnapshot({ model: 'deepseek-chat', temperature: 0.4, systemPrompt: '你是乡芽', toolSchemas: schemas, role: 'teacher' });
    expect(s.model).toBe('deepseek-chat');
    expect(s.toolCount).toBe(2);
    expect(s.toolNames).toEqual(['search_knowledge', 'run_diagnosis']);
    expect(s.systemPromptSha).toMatch(/^[0-9a-f]{16}$/);
  });

  it('提示词改动 → 哈希变化（模型行为漂移可定位）', () => {
    const a = buildRequestSnapshot({ model: 'm', temperature: 0.4, systemPrompt: '规则A', toolSchemas: [], role: 'teacher' });
    const b = buildRequestSnapshot({ model: 'm', temperature: 0.4, systemPrompt: '规则B', toolSchemas: [], role: 'teacher' });
    expect(a.systemPromptSha).not.toBe(b.systemPromptSha);
  });

  it('工具顺序不影响工具哈希（集合语义）', () => {
    const a = buildRequestSnapshot({ model: 'm', temperature: 0.4, systemPrompt: 'p', toolSchemas: schemas, role: 'teacher' });
    const b = buildRequestSnapshot({ model: 'm', temperature: 0.4, systemPrompt: 'p', toolSchemas: [...schemas].reverse(), role: 'teacher' });
    expect(a.toolsSha).toBe(b.toolsSha);
  });
});

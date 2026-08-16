import { describe, expect, it } from 'vitest';
import { envelope, extractUsage, TRAJECTORY_TYPES, TextStreamBuffer } from '../trajectory';

describe('trajectory envelope', () => {
  it('信封包含单调 seq/time/type/data 四要素', () => {
    const before = Date.now();
    const e = envelope(7, 'tool_start', { name: 'search_knowledge' });
    expect(e.seq).toBe(7);
    expect(e.time).toBeGreaterThanOrEqual(before);
    expect(e.type).toBe('tool_start');
    expect(e.data).toEqual({ name: 'search_knowledge' });
  });

  it('事件类型白名单覆盖全部 SSE 事件与新增事件', () => {
    for (const t of ['thinking', 'tool_start', 'tool_end', 'text_delta', 'done', 'error', 'usage', 'task_start', 'task_end'] as const) {
      expect(TRAJECTORY_TYPES).toContain(t);
    }
  });

  it('extractUsage 从 LangChain usage_metadata 提取 token（无元数据返回 0）', () => {
    const msg = { usage_metadata: { input_tokens: 120, output_tokens: 30, total_tokens: 150 } };
    expect(extractUsage(msg)).toEqual({ inputTokens: 120, outputTokens: 30 });
    expect(extractUsage({})).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('extractUsage 兼容仅 total_tokens 的 provider', () => {
    const msg = { usage_metadata: { total_tokens: 80 } };
    expect(extractUsage(msg)).toEqual({ inputTokens: 80, outputTokens: 0 });
  });
});

describe('TextStreamBuffer', () => {
  it('聚合 delta，flush 返回合并文本并清空', () => {
    const b = new TextStreamBuffer();
    b.push('你'); b.push('好'); b.push('，世界');
    expect(b.flush()).toBe('你好，世界');
    expect(b.flush()).toBe('');
  });
});

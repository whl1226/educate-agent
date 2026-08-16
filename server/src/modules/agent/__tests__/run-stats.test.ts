import { describe, expect, it } from 'vitest';
import { RunStatsAccumulator } from '../run-stats';
import type { AgentEvent } from '../agent-graph';

describe('RunStatsAccumulator', () => {
  it('折叠 tool 配对耗时与错误计数（FIFO 配对）', () => {
    const acc = new RunStatsAccumulator();
    acc.onEvent({ type: 'tool_start', name: 'run_diagnosis', args: {} });
    acc.onEvent({ type: 'tool_end', name: 'run_diagnosis', result: {}, durationMs: 120 });
    acc.onEvent({ type: 'tool_start', name: 'generate_paper', args: {} });
    acc.onEvent({ type: 'tool_end', name: 'generate_paper', error: 'boom', durationMs: 45 });
    const s = acc.snapshot();
    expect(s.toolMs).toBe(165);
    expect(s.toolCount).toBe(2);
    expect(s.toolErrorCount).toBe(1);
  });

  it('ttft = 首个 thinking 到首个 text_delta', () => {
    const acc = new RunStatsAccumulator();
    acc.onEvent({ type: 'thinking', text: '开始' });
    acc.onEvent({ type: 'tool_start', name: 'search_knowledge', args: {} });
    acc.onEvent({ type: 'tool_end', name: 'search_knowledge', result: [], durationMs: 10 });
    acc.onEvent({ type: 'text_delta', delta: '最终' });
    const s = acc.snapshot();
    expect(s.ttftMs).not.toBeNull();
  });

  it('无 text_delta 时 ttft 为 null', () => {
    const acc = new RunStatsAccumulator();
    acc.onEvent({ type: 'thinking', text: '开始' });
    expect(acc.snapshot().ttftMs).toBeNull();
  });
});

import type { AgentEvent } from './agent-graph';

export interface RunStats {
  toolMs: number;
  toolCount: number;
  toolErrorCount: number;
  /** 首 token 时延（最近一次 thinking 事件 → 首个 text_delta；thinking 可能多次出现，实现取最后一次） */
  ttftMs: number | null;
}

/**
 * DSH session-stats 轻量版：从事件流实时折叠统计，run 结束时落库。
 * 不依赖落库轨迹重算，崩溃前的事件也已计入。
 */
export class RunStatsAccumulator {
  private toolStarts: number[] = [];
  private stats: RunStats = { toolMs: 0, toolCount: 0, toolErrorCount: 0, ttftMs: null };
  private thinkingAt: number | null = null;
  private firstDeltaSeen = false;

  onEvent(ev: AgentEvent): void {
    switch (ev.type) {
      case 'thinking':
        this.thinkingAt = Date.now();
        break;
      case 'tool_start':
        this.toolStarts.push(Date.now());
        break;
      case 'tool_end': {
        // 优先取事件自带的 durationMs（与轨迹落库一致、可确定测试）；缺失时回退墙钟 FIFO 配对差值
        const startAt = this.toolStarts.shift() ?? Date.now();
        this.stats.toolMs += ev.durationMs >= 0 ? ev.durationMs : Math.max(0, Date.now() - startAt);
        this.stats.toolCount += 1;
        if (ev.error) this.stats.toolErrorCount += 1;
        break;
      }
      case 'text_delta':
        if (!this.firstDeltaSeen) {
          this.firstDeltaSeen = true;
          this.stats.ttftMs = this.thinkingAt === null ? null : Math.max(0, Date.now() - this.thinkingAt);
        }
        break;
      default:
        break;
    }
  }

  snapshot(): RunStats {
    return { ...this.stats };
  }
}

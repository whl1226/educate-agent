/**
 * 轨迹事件信封（DeepSeek-Harness SessionEvent 的轻量版）：
 * 追加式、可回放——seq 单调连续、time 毫秒时间戳、type 判别联合、data 载荷。
 * 消息历史（回放/统计/审计）一律由事件派生，事件日志是唯一事实源。
 */
export const TRAJECTORY_TYPES = [
  'thinking', 'tool_start', 'tool_end', 'text_delta', 'done', 'error',
  'usage', 'task_start', 'task_end',
] as const;

export type TrajectoryEventType = (typeof TRAJECTORY_TYPES)[number];

export interface TrajectoryEnvelope {
  /** run 内单调递增序号 */
  seq: number;
  /** Unix epoch 毫秒 */
  time: number;
  type: TrajectoryEventType;
  data: Record<string, unknown>;
}

export function envelope(seq: number, type: TrajectoryEventType, data: Record<string, unknown>): TrajectoryEnvelope {
  return { seq, time: Date.now(), type, data };
}

/** 从 LangChain AIMessage 提取 token 用量（OpenAI 兼容 usage_metadata，缺失时 0） */
export function extractUsage(msg: unknown): { inputTokens: number; outputTokens: number } {
  const m = msg as { usage_metadata?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } } | undefined;
  const um = m?.usage_metadata;
  if (!um) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: um.input_tokens ?? Math.max(0, (um.total_tokens ?? 0) - (um.output_tokens ?? 0)),
    outputTokens: um.output_tokens ?? 0,
  };
}

/**
 * text_delta 流式文本缓冲：逐片 delta 聚合为整段，flush 一次性落库（记录但压缩，而非丢弃）。
 * 借鉴 DSH packChunks 思路：轨迹可回放且不随分片数膨胀。
 */
export class TextStreamBuffer {
  private chunks: string[] = [];

  push(text: string): void {
    this.chunks.push(text);
  }

  flush(): string {
    const joined = this.chunks.join('');
    this.chunks = [];
    return joined;
  }
}

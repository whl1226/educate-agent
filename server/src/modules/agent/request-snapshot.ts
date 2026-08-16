import crypto from 'crypto';

export interface RequestSnapshot {
  model: string;
  temperature: number;
  systemPromptSha: string;
  toolsSha: string;
  toolCount: number;
  toolNames: string[];
  role: string;
  at: number;
}

const sha16 = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

/**
 * DSH request/header 快照：每次 run 开始时记录"模型请求的完整形态"。
 * 效果回退时可按哈希定位是提示词漂移 / 工具集变化 / 模型切换。
 */
export function buildRequestSnapshot(opts: {
  model: string;
  temperature: number;
  systemPrompt: string;
  toolSchemas: Array<{ function: { name: string } }>;
  role: string;
}): RequestSnapshot {
  return {
    model: opts.model,
    temperature: opts.temperature,
    systemPromptSha: sha16(opts.systemPrompt),
    toolsSha: sha16(opts.toolSchemas.map((t) => t.function.name).sort().join(',')),
    toolCount: opts.toolSchemas.length,
    toolNames: opts.toolSchemas.map((t) => t.function.name),
    role: opts.role,
    at: Date.now(),
  };
}

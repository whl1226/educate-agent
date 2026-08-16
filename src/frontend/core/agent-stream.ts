import { readCookie } from './request';
import { getToken } from './auth';
import { randomNonce, signRequest } from './sign';
import { isPreviewMode } from './guard';

/**
 * Agent 流式事件（与后端 /agent/chat SSE 帧对应）。
 * 教师/学生/家长/管理 多端共用的单一事件类型。
 */
export type AgentEv =
  | { type: 'thinking'; text: string }
  | { type: 'tool_start'; name: string; args: unknown }
  | { type: 'tool_end'; name: string; result?: unknown; error?: string; durationMs: number }
  | { type: 'text_delta'; delta: string }
  | { type: 'done'; finalText: string; refs: string[]; intent: string }
  | { type: 'error'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'task_start'; taskId: string; kind: string; description: string }
  | { type: 'task_end'; taskId: string; state: string; outputSummary?: string };

/**
 * 原始 SSE 请求（防重放头 + CSRF + Bearer）：
 * 将后端 /agent/chat 的流式事件逐步回调给 onEvent。
 * 401 抛出"登录已过期"，由调用方决定跳转；其余错误抛 HTTP 状态。
 */
export async function streamAgentChat(
  task: string,
  onEvent: (ev: AgentEv) => void,
  opts: { redirectOn401?: boolean } = {},
): Promise<void> {
  const csrf = readCookie('XSRF-TOKEN');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  // 体验预览模式：服务端 RbacGuard 与 agent 工具权限依据该头放行（与 request.ts 一致）
  if (isPreviewMode()) headers['X-Preview'] = '1';
  const ts = Date.now();
  headers['X-Timestamp'] = String(ts);
  headers['X-Nonce'] = randomNonce();
  headers['X-Signature'] = await signRequest('POST', '/api/v1/agent/chat', ts);

  const res = await fetch('/api/v1/agent/chat', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ task }),
  });
  if (res.status === 401) {
    if (opts.redirectOn401 !== false) location.href = 'login.html';
    throw new Error('登录已过期，请重新登录');
  }
  if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      const lines = part.split('\n');
      const dataLine = lines.find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine.slice(6)) as AgentEv);
      } catch {
        /* 跳过坏帧 */
      }
    }
  }
}
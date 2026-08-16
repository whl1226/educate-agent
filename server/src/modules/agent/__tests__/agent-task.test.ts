import { describe, expect, it, vi } from 'vitest';
import { AgentTaskManager, AGENT_TASK_TIMEOUT_MS, canManageTask } from '../agent-task';

describe('AgentTaskManager', () => {
  it('start → transition completed', () => {
    const m = new AgentTaskManager();
    const rec = m.start({ taskId: 't1', runId: 1, kind: 'document', description: '教案渲染' });
    expect(rec.state).toBe('running');
    const done = m.transition('t1', 'completed', '/download/1');
    expect(done?.state).toBe('completed');
    expect(done?.outputSummary).toBe('/download/1');
    expect(done?.finishedAt).toBeGreaterThan(0);
  });

  it('终态后 transition 不再变化（状态机单向）', () => {
    const m = new AgentTaskManager();
    m.start({ taskId: 't2', runId: 1, kind: 'document', description: 'x' });
    m.transition('t2', 'failed', 'err');
    expect(m.transition('t2', 'completed')?.state).toBe('failed');
  });

  it('stop → killed；stopAll 按 runId 批量停止', () => {
    const m = new AgentTaskManager();
    m.start({ taskId: 'a', runId: 1, kind: 'document', description: 'x' });
    m.start({ taskId: 'b', runId: 2, kind: 'paper', description: 'y' });
    m.stopAll(1);
    expect(m.get('a')?.state).toBe('killed');
    expect(m.get('b')?.state).toBe('running');
  });

  it('超时 → timed_out（假时钟）', () => {
    vi.useFakeTimers();
    const m = new AgentTaskManager();
    m.start({ taskId: 't3', runId: 1, kind: 'document', description: 'x' });
    vi.advanceTimersByTime(AGENT_TASK_TIMEOUT_MS + 1);
    expect(m.get('t3')?.state).toBe('timed_out');
    vi.useRealTimers();
  });

  it('markLost 把 running 标为 lost（服务重启恢复语义）', () => {
    const m = new AgentTaskManager();
    m.start({ taskId: 't4', runId: 1, kind: 'document', description: 'x' });
    m.transition('t4', 'completed');
    m.start({ taskId: 't5', runId: 1, kind: 'paper', description: 'y' });
    m.markLost();
    expect(m.get('t4')?.state).toBe('completed');
    expect(m.get('t5')?.state).toBe('lost');
  });

  it('onTaskChange 通知任务状态变化', () => {
    const m = new AgentTaskManager();
    const fn = vi.fn();
    m.setOnTaskChange(fn);
    m.start({ taskId: 't6', runId: 1, kind: 'document', description: 'x' });
    expect(fn).toHaveBeenCalled();
  });

  it('markLost 后 emit 被调用（恢复通知落库钩子）', () => {
    const m = new AgentTaskManager();
    const fn = vi.fn();
    m.setOnTaskChange(fn);
    m.start({ taskId: 't7', runId: 1, kind: 'document', description: 'x' });
    m.transition('t7', 'completed');
    m.start({ taskId: 't8', runId: 1, kind: 'paper', description: 'y' });
    fn.mockClear();
    m.markLost();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].state).toBe('lost');
  });
});

describe('canManageTask（任务越权隔离授权函数）', () => {
  it('admin 跨 run 可管理', () => {
    expect(canManageTask('admin', 1, 2)).toBe(true);
    expect(canManageTask('admin', 1, undefined)).toBe(true);
  });

  it('teacher 同 run 可管理', () => {
    expect(canManageTask('teacher', 1, 1)).toBe(true);
  });

  it('teacher 跨 run 不可管理', () => {
    expect(canManageTask('teacher', 1, 2)).toBe(false);
  });

  it('ctxRunId 缺失不可管理（非 admin）', () => {
    expect(canManageTask('teacher', 1, undefined)).toBe(false);
    expect(canManageTask('student', 1, undefined)).toBe(false);
  });

  it('parent 同 run 可管理（绑定层不重复角色检查）', () => {
    expect(canManageTask('parent', 1, 1)).toBe(true);
  });
});

describe('generate_document 后台模式（逻辑层）', () => {
  it('background=true 时不阻塞：任务状态由回调异步收敛', async () => {
    const m = new AgentTaskManager();
    const done = vi.fn();
    const taskId = 'doc_t1';
    const rec = m.start({ taskId, runId: 1, kind: 'document', description: '教案渲染' });
    // 模拟 agent.service 中后台执行体
    void (async () => {
      await new Promise((r) => setTimeout(r, 5));
      m.transition(taskId, 'completed', '/api/v1/files/9/download');
      done();
    })();
    expect(rec.state).toBe('running'); // 立即返回，未阻塞
    await new Promise((r) => setTimeout(r, 15));
    expect(m.get(taskId)?.state).toBe('completed');
    expect(done).toHaveBeenCalled();
  });

  // 注：纯逻辑层只能覆盖 AgentTaskManager 状态机（service 层 runQueues 路由/SSE 推送属集成面，
  // 需 Controller 级测试方可断言）；此处锁定"校验失败 → failed 终态 + 错误摘要"的状态机语义
  it('后台任务校验失败 → failed 终态且输出错误摘要', async () => {
    const m = new AgentTaskManager();
    const taskId = 'doc_t2';
    const rec = m.start({ taskId, runId: 1, kind: 'document', description: '教案渲染' });
    void (async () => {
      await new Promise((r) => setTimeout(r, 5));
      m.transition(taskId, 'failed', '校验失败：INVALID_YAML,NO_FORMAT');
    })();
    expect(rec.state).toBe('running');
    await new Promise((r) => setTimeout(r, 15));
    const t = m.get(taskId);
    expect(t?.state).toBe('failed');
    expect(t?.outputSummary).toBe('校验失败：INVALID_YAML,NO_FORMAT');
    expect(t?.finishedAt).toBeGreaterThan(0);
  });
});

export type AgentTaskState = 'running' | 'completed' | 'failed' | 'timed_out' | 'killed' | 'lost';

export interface AgentTaskInfo {
  taskId: string;
  runId: number;
  kind: string;
  description: string;
  state: AgentTaskState;
  outputSummary?: string;
  createdAt: number;
  finishedAt?: number;
}

export const AGENT_TASK_TIMEOUT_MS = 10 * 60_000;

/**
 * 任务越权隔离授权（纯函数）：admin 恒可管理；其余角色仅可管理自己 runId 内的任务。
 * ctxRunId 缺失（如未透传 runId 的调用）→ 非 admin 一律拒绝（fail-closed 防御：上下文缺失时拒绝而非放行）。
 * 注意：不做角色白名单——registry 层的 needsPermission 已负责角色限制（task_stop='teacher'）。
 */
export function canManageTask(role: string, taskRunId: number, ctxRunId: number | undefined): boolean {
  if (role === 'admin') return true;
  if (ctxRunId === undefined || ctxRunId === null) return false;
  return taskRunId === ctxRunId;
}

/**
 * 工具即任务（Kimi tool-as-task）：长时工作统一为可查询/停止/超时的任务实体。
 * 状态机：running → completed | failed | timed_out | killed；进程重启后 running → lost。
 * 模型通过 task_list/task_output/task_stop 三件套管理任务（Task 3.2）。
 */
export class AgentTaskManager {
  private tasks = new Map<string, AgentTaskInfo>();
  private timers = new Map<string, NodeJS.Timeout>();
  private onTaskChange?: (rec: AgentTaskInfo) => void | Promise<void>;

  setOnTaskChange(fn: (rec: AgentTaskInfo) => void | Promise<void>): this {
    this.onTaskChange = fn;
    return this;
  }

  start(rec: Omit<AgentTaskInfo, 'state' | 'createdAt'>): AgentTaskInfo {
    const record: AgentTaskInfo = { ...rec, state: 'running', createdAt: Date.now() };
    const oldTimer = this.timers.get(record.taskId);
    if (oldTimer) clearTimeout(oldTimer);
    this.timers.delete(record.taskId);
    this.tasks.set(record.taskId, record);
    const timer = setTimeout(() => this.transition(record.taskId, 'timed_out'), AGENT_TASK_TIMEOUT_MS);
    this.timers.set(record.taskId, timer);
    void this.emit(record);
    return record;
  }

  /** 状态迁移：仅 running → 终态生效（状态机单向，防乱序回调覆盖终态） */
  transition(taskId: string, state: Exclude<AgentTaskState, 'running'>, outputSummary?: string): AgentTaskInfo | undefined {
    const rec = this.tasks.get(taskId);
    if (!rec || rec.state !== 'running') return rec;
    rec.state = state;
    rec.finishedAt = Date.now();
    if (outputSummary !== undefined) rec.outputSummary = outputSummary;
    const timer = this.timers.get(taskId);
    if (timer) clearTimeout(timer);
    this.timers.delete(taskId);
    void this.emit(rec);
    return rec;
  }

  get(taskId: string): AgentTaskInfo | undefined {
    return this.tasks.get(taskId);
  }

  list(runId?: number): AgentTaskInfo[] {
    const all = [...this.tasks.values()];
    return runId === undefined ? all : all.filter((t) => t.runId === runId);
  }

  /** 服务重启后恢复：未完成任务标 lost（不误报 running），同步清理 timer 并通知 */
  markLost(): void {
    for (const rec of this.tasks.values()) {
      if (rec.state === 'running') {
        rec.state = 'lost';
        rec.finishedAt = Date.now();
        const timer = this.timers.get(rec.taskId);
        if (timer) clearTimeout(timer);
        this.timers.delete(rec.taskId);
        void this.emit(rec);
      }
    }
  }

  stop(taskId: string): boolean {
    return !!this.transition(taskId, 'killed');
  }

  stopAll(runId?: number): number {
    let n = 0;
    for (const rec of this.tasks.values()) {
      if (rec.state === 'running' && (runId === undefined || rec.runId === runId)) {
        if (this.stop(rec.taskId)) n++;
      }
    }
    return n;
  }

  private async emit(rec: AgentTaskInfo): Promise<void> {
    if (!this.onTaskChange) return;
    try {
      await this.onTaskChange(rec);
    } catch {
      // 通知失败不影响任务本身
    }
  }
}

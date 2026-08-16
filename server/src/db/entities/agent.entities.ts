import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/** Agent 任务运行（一次完整闭环） */
@Entity('agent_runs')
@Index('idx_ar_user_time', ['userId', 'createdAt'])
export class AgentRun extends BaseEntity {
  @Column({ name: 'user_id', type: 'int' }) userId: number;
  @Column({ type: 'varchar', length: 16 }) role: string;
  @Column({ name: 'task_input', type: 'text' }) taskInput: string;
  @Column({ type: 'varchar', length: 32 }) intent: string;
  @Column({ type: 'varchar', length: 16, default: 'running' }) status: string;
  @Column({ type: 'text', nullable: true }) summary: string | null;
  @Column({ type: 'int', default: 0 }) durationMs: number;
  @Column({ type: 'int', default: 0 }) toolCalls: number;
  @Column({ name: 'input_tokens', type: 'int', default: 0 }) inputTokens: number;
  @Column({ name: 'output_tokens', type: 'int', default: 0 }) outputTokens: number;
  /** DSH request/header 快照 JSON（模型/温度/提示词哈希/工具集哈希），模型行为漂移定位用 */
  @Column({ name: 'request_snapshot', type: 'text', nullable: true }) requestSnapshot: string | null;
  /** 运行统计折叠 JSON（ttftMs/toolMs/工具计数/错误计数），run 结束随 patchRun 落库 */
  @Column({ name: 'stats_json', type: 'text', nullable: true }) statsJson: string | null;
}

/** Agent 消息（含思考/工具调用轨迹，步骤流 UI 的数据源） */
@Entity('agent_messages')
@Index('idx_am_run', ['runId'])
export class AgentMessage extends BaseEntity {
  @Column({ name: 'run_id', type: 'int' }) runId: number;
  /** user | assistant | tool */
  @Column({ type: 'varchar', length: 16 }) role: string;
  /** 消息类型：text | thinking | tool_call | tool_result | refs | final */
  @Column({ type: 'varchar', length: 24 }) kind: string;
  @Column({ type: 'text', nullable: true }) content: string | null;
  /** 工具名（kind=tool_call/tool_result 时） */
  @Column({ type: 'varchar', length: 64, nullable: true }) tool: string | null;
  /** 工具参数 JSON（tool_call） */
  @Column({ type: 'text', nullable: true }) argsJson: string | null;
  /** 工具结果 JSON 摘要（tool_result，截断 2000） */
  @Column({ type: 'text', nullable: true }) resultJson: string | null;
  /** 状态：pending/running/done/error（tool） */
  @Column({ type: 'varchar', length: 16, default: 'done' }) status: string;
  /** 耗时 ms（tool） */
  @Column({ type: 'int', default: 0 }) durationMs: number;
  /** 引用 refs JSON（final 消息） */
  @Column({ type: 'text', nullable: true }) refsJson: string | null;
  /** 轨迹事件信封：run 内单调序号 */
  @Column({ type: 'int', default: 0 }) seq: number;
  /** 轨迹事件信封：Unix epoch 毫秒 */
  @Column({ type: 'int', default: 0 }) time: number;
  /** 轨迹事件信封：事件类型 */
  @Column({ name: 'event_type', type: 'varchar', length: 32, default: '' }) eventType: string;
}

/** Agent 后台任务（工具即任务：长时工作的持久化视图） */
@Entity('agent_tasks')
@Index('idx_at_run', ['runId'])
@Index('idx_at_tid', ['taskId'], { unique: true })
export class AgentTask extends BaseEntity {
  @Column({ name: 'task_id', type: 'varchar', length: 64 }) taskId: string;
  @Column({ name: 'run_id', type: 'int' }) runId: number;
  @Column({ type: 'varchar', length: 32 }) kind: string;
  @Column({ type: 'varchar', length: 256 }) description: string;
  @Column({ type: 'varchar', length: 16, default: 'running' }) state: string;
  @Column({ name: 'output_summary', type: 'text', nullable: true }) outputSummary: string | null;
  @Column({ name: 'finished_at', type: 'int', nullable: true }) finishedAt: number | null;
}

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatOpenAI } from '@langchain/openai';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { AgentRun, AgentMessage, AgentTask } from '../../db/entities/agent.entities';
import { StudentService } from '../student/student.service';
import { TeacherService } from '../teacher/teacher.service';
import { OrgService } from '../org/org.service';
import { ParentService } from '../parent/parent.service';
import { AdminService } from '../admin/admin.service';
import { OfficeService } from '../office/office.service';
import type { GenerateDocumentInput } from '../office/office.types';
import { HybridRetriever } from '../knowledge/hybrid-retriever';
import { AIService } from '../ai/ai.service';
import { JwtUser } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { buildRegistry, type ToolBindings, type ToolContext } from './tool-registry';
import { buildAgentGraph, buildSystemPrompt, type AgentEvent } from './agent-graph';
import { envelope, TextStreamBuffer, type TrajectoryEnvelope } from './trajectory';
import { verifyRefsAndFlag } from './refs-verify';
import { buildRequestSnapshot } from './request-snapshot';
import { RunStatsAccumulator } from './run-stats';
import { AgentTaskManager, canManageTask } from './agent-task';
import type { AgentTaskInfo } from './agent-task';
import { ApprovalService } from './approval';
import { buildPolicyChain, runPolicyChain, SENSITIVE_TOOL_LABELS, type PolicyChainMode } from './sensitive-data-policy';
import { stripEmoji } from '../office/md-validator';

/** 学生数据类工具的水平越权校验：studentId 必须等于登录用户 ID（C1 核心防线） */
export function assertSelfScope(ctx: ToolContext, studentId: number) {
  if (!studentId || ctx.user.id !== studentId) {
    throw new BizException(ErrorCodes.SCOPE_FORBIDDEN, '无权访问该学生数据');
  }
}

/** LLM 默认配置（与 config env 校验默认值对齐）：统一引用，避免字面量漂移 */
const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_TEMPERATURE = 0.4;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  /** 后台任务管理器（工具即任务：长时工作的内存视图 + 状态机） */
  private readonly taskManager = new AgentTaskManager();
  /** run 级事件队列注册表（Task 3.3）：供后台任务回调按 runId 路由推送 task 事件进 SSE 流 */
  private readonly runQueues = new Map<number, EventQueue>();

  constructor(
    private readonly config: ConfigService,
    private readonly student: StudentService,
    private readonly teacher: TeacherService,
    private readonly org: OrgService,
    private readonly parent: ParentService,
    private readonly admin: AdminService,
    private readonly office: OfficeService,
    private readonly retriever: HybridRetriever,
    private readonly ai: AIService,
    private readonly approval: ApprovalService,
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
    @InjectRepository(AgentMessage) private readonly msgs: Repository<AgentMessage>,
    @InjectRepository(AgentTask) private readonly taskRepo: Repository<AgentTask>,
  ) {
    // 任务变更回调只在构造时注册一次（回调按 rec.runId 路由，无 per-run 状态）：
    // 状态迁移 → 落库 agent_tasks（upsert 语义，失败静默）+ SSE 推送
    this.taskManager.setOnTaskChange((rec) => {
      this.taskRepo
        .upsert(
          {
            taskId: rec.taskId,
            runId: rec.runId,
            kind: rec.kind,
            description: rec.description,
            state: rec.state,
            outputSummary: rec.outputSummary ?? null,
            finishedAt: rec.finishedAt ?? null,
          },
          ['taskId'],
        )
        .catch(() => undefined);
      void this.pushTaskEvent(rec.runId, rec);
    });
  }

  /** 工具绑定：复用现有业务 Service（真实数据闭环）；studentId 必须与登录用户一致，杜绝水平越权 */
  private buildRegistry() {
    const b: ToolBindings = {
      run_diagnosis: async (ctx, sid) => {
        assertSelfScope(ctx, sid);
        return this.student.runDiagnosis(ctx.user);
      },
      get_latest_diagnosis: async (ctx, sid) => {
        assertSelfScope(ctx, sid);
        return this.student.latestDiagnosis(ctx.user);
      },
      get_error_book: async (ctx, sid) => {
        assertSelfScope(ctx, sid);
        return this.student.errorBook(ctx.user);
      },
      get_study_plan: async (ctx, sid) => {
        assertSelfScope(ctx, sid);
        return this.student.studyPlan(ctx.user);
      },
      practice_questions: async (ctx, kpId, count) =>
        this.student.practiceQuestions(ctx.user, kpId ?? undefined, count, undefined),
      submit_answer: async (ctx, qid, ans) =>
        this.student.submitAnswer(ctx.user, { questionId: qid, answer: ans }),
      search_knowledge: async (query, topK) => this.retriever.retrieve(query, topK ?? 5),
      socratic_tutor: async (problem, reply) => this.student.socraticTurn(problem, reply),
      generate_lesson_plan: async (ctx, args) =>
        this.teacher.generateLessonPlan({ id: ctx.user.id, role: ctx.user.role } as JwtUser, { ...args, grade: args.grade ?? '五年级' }, ctx.runId),
      generate_paper: async (ctx, args) =>
        this.teacher.generatePaper({ id: ctx.user.id, role: ctx.user.role } as JwtUser, { ...args, grade: args.grade ?? '五年级', questionCount: args.questionCount ?? 6 }),
      // 自愈闭环：校验失败返回 { error, issues }，LLM 看到 code+fix 后修复内容重试
      generate_document: async (ctx, args) => {
        const input = args as GenerateDocumentInput & { background?: boolean };
        if (!input.background) {
          const out = await this.office.generateDocument(ctx.user, input);
          if (!out.valid) {
            return { error: `文档校验失败：${(out.issues ?? []).map((i) => `${i.code}:${i.fix}`).join('；')}`, issues: out.issues };
          }
          return out;
        }
        // Kimi run_in_background 语义：立即返回任务句柄，渲染在后台完成，模型用 task_list/task_output 查询
        const taskId = `doc_${Date.now()}_${randomUUID().slice(0, 8)}`;
        // runId 缺失时任务无法路由 SSE（runQueues 查不到队列，task 事件静默丢弃），但 agent_tasks 仍落库可查
        this.taskManager.start({
          taskId,
          runId: ctx.runId ?? 0,
          kind: 'document',
          description: `文档生成：${input.title ?? input.format}`,
        });
        void (async () => {
          try {
            const out = await this.office.generateDocument(ctx.user, input);
            if (!out.valid) {
              this.taskManager.transition(taskId, 'failed', `校验失败：${(out.issues ?? []).map((i) => i.code).join(',')}`);
              return;
            }
            this.taskManager.transition(taskId, 'completed', out.downloadUrl ?? out.filename ?? '已生成');
          } catch (e) {
            this.taskManager.transition(taskId, 'failed', (e as Error).message?.slice(0, 200) ?? '未知错误');
          }
        })();
        return { taskId, state: 'running', hint: '任务已在后台启动，稍后可用 task_list / task_output 查询进度与结果' };
      },
      get_class_overview: async (_ctx, cid) => this.org.classOverview(cid),
      researcher_comment: async (ctx, src) =>
        this.teacher.researcher({ id: ctx.user.id, role: ctx.user.role } as JwtUser, 'comment', { sourceContent: src }),
      // 周报走 weeklyReportFor：内部 childrenOf 绑定校验兜底（非绑定学生一律拒绝）
      get_weekly_report: async (ctx, sid) => this.parent.weeklyReportFor(ctx.user, sid),
      get_region_overview: async () => this.admin.regionOverview(),
      list_alerts: async (type, limit) => {
        // 现有 listAlerts(status?, type?)：status 不限制，type 透传，limit 截断
        const rows = await this.admin.listAlerts(undefined, type);
        return limit && Number.isFinite(limit) ? rows.slice(0, Math.max(1, Math.floor(limit))) : rows;
      },
      get_teacher_profile: async (_ctx, tid) => this.admin.teacherProfile(tid),
      // 任务三件套：按 runId 隔离（canManageTask 纯函数授权），ctx.runId 缺失时不折叠共享桶
      task_list: async (ctx, state) => {
        if (ctx.runId == null) return [];
        const list = this.taskManager.list(ctx.runId).filter((t) => !state || t.state === state);
        return list.map((t) => ({ taskId: t.taskId, kind: t.kind, description: t.description, state: t.state, createdAt: t.createdAt }));
      },
      task_output: async (ctx, taskId) => {
        const t = this.taskManager.get(taskId);
        if (!t) return { error: `任务不存在: ${taskId}` };
        if (!canManageTask(ctx.role, t.runId, ctx.runId)) return { error: '无权查看他人会话的任务' };
        return { taskId: t.taskId, kind: t.kind, state: t.state, outputSummary: t.outputSummary ?? null };
      },
      task_stop: async (ctx, taskId) => {
        const t = this.taskManager.get(taskId);
        if (!t) return { error: `任务不存在: ${taskId}` };
        if (!canManageTask(ctx.role, t.runId, ctx.runId)) return { error: '无权停止他人会话的任务' };
        return { stopped: this.taskManager.stop(taskId) };
      },
    };
    return buildRegistry(b);
  }

  private buildLlm() {
    // 关键修复：直接从 ConfigService 读取 LLM 配置（provider 私有字段无公开 getter），
    // demo 模式或无 Key 时返回 null，由 agent-graph 走规则引擎降级
    if (this.ai.isDemo) return null;
    const apiKey = this.config.get<string>('LLM_API_KEY') || '';
    if (!apiKey) return null;
    return new ChatOpenAI({
      model: this.config.get<string>('LLM_MODEL') || DEFAULT_MODEL,
      apiKey,
      configuration: { baseURL: this.config.get<string>('LLM_BASE_URL') || 'https://api.deepseek.com/v1' },
      temperature: DEFAULT_TEMPERATURE,
    });
  }

  /** 检查点连接单例（避免每次会话重建 SqliteSaver 导致连接泄漏）；失败时降级为无记忆 */
  private checkpointerPromise?: Promise<SqliteSaver | undefined>;
  private checkpointer(): Promise<SqliteSaver | undefined> {
    if (!this.checkpointerPromise) {
      // 独立 checkpoint 文件：与业务库分开，避免与 TypeORM 同库并发写触发 SQLITE_BUSY
      const dbPath = process.env.DB_ABS || './data/xiangya.db';
      const cpPath = dbPath.replace(/\.db$/, '-checkpoints.db');
      let p: Promise<SqliteSaver | undefined>;
      try {
        p = Promise.resolve(SqliteSaver.fromConnString(cpPath)).catch((e: Error) => {
          this.logger.warn(`checkpoint-sqlite 初始化失败，本轮记忆关闭: ${e?.message ?? String(e)}`);
          return undefined;
        });
      } catch (e) {
        this.logger.warn(`checkpoint-sqlite 初始化失败，本轮记忆关闭: ${(e as Error).message}`);
        p = Promise.resolve(undefined);
      }
      this.checkpointerPromise = p;
    }
    return this.checkpointerPromise;
  }

  /**
   * 流式执行：返回 AsyncIterable<AgentEvent>，Controller 转 SSE。
   * 图执行与事件流出并行：事件一经产生立即 push 出队，不再 collect 缓冲。
   */
  async *stream(user: JwtUser, input: { task: string }, opts: { preview?: boolean } = {}): AsyncGenerator<AgentEvent> {
    if (!input.task?.trim()) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'task 必填');
    const text = input.task.trim();

    const run = await this.runs.save(
      this.runs.create({
        userId: user.id,
        role: user.role,
        taskInput: text.slice(0, 500),
        intent: 'general',
        status: 'running',
        durationMs: 0,
        toolCalls: 0,
      }),
    );
    // registry 需在 run.save 之后立即创建：快照需要工具清单（toolsSha），后续 llm/图构建也依赖它
    const registry = this.buildRegistry();
    // 敏感数据策略链（Task 2.3）：AGENT_APPROVAL_MODE=strict 时敏感工具 ask 审批（fail-closed），默认 off 全放行（向后兼容）
    const approvalMode: PolicyChainMode = this.config.get<string>('AGENT_APPROVAL_MODE') === 'strict' ? 'strict' : 'off';
    const policyChain = buildPolicyChain(approvalMode);
    const pipelineHooks = {
      preExecute: async (_ctx: ToolContext, tool: { name: string }, args: unknown) => {
        const decision = runPolicyChain(policyChain, user.role, tool.name, (args ?? {}) as Record<string, unknown>);
        if (decision.kind === 'approve') return { kind: 'allow' as const };
        if (decision.kind === 'deny') return { kind: 'deny' as const, reason: decision.reason ?? '策略链拒绝' };
        return { kind: 'ask' as const, reason: decision.reason };
      },
    };
    // 审批装配（DSH user-approval seam）：策略与审计对全部收敛在 ApprovalService 内——
    // never 返回 denied、ask 无应答者返回 denied_unavailable，均成对写 audit_logs（log-only，模型只看工具结果）
    const runId = run.id;
    registry.setApprovalHandler(async (_ctx, tool, _args, callId) =>
      this.approval.request({ runId, userId: user.id, toolName: tool.name, callId }),
    );
    const started = Date.now();
    const queue = new EventQueue();
    // Task 3.3：run 队列注册（供后台任务回调按 runId 路由推送 task 事件），finally 中随 close 清理
    this.runQueues.set(run.id, queue);
    // 事件双消费者（落库 + 流出）：落库不 await，避免阻塞事件流出；seq 闭包计数保证 run 内单调连续
    let seq = 0;
    // text_delta 缓冲聚合（DSH packChunks 思路）：逐片入缓冲，run 收尾 flush 一次性落库——记录但压缩，而非丢弃
    const streamBuf = new TextStreamBuffer();
    // 运行统计折叠（ttft/toolMs/错误计数）：事件流实时累计，run 结束时随 patchRun 落库
    const statsAcc = new RunStatsAccumulator();
    const flushStream = () => {
      const text = streamBuf.flush();
      if (!text) return;
      return this.msgs
        .save(
          this.msgs.create({
            runId: run.id,
            role: 'assistant',
            kind: 'text_stream',
            content: text,
            status: 'done',
            seq: ++seq,
            time: Date.now(),
            eventType: 'text_delta',
          }),
        )
        .catch(() => undefined);
    };
    const onEvent = (ev: AgentEvent) => {
      queue.push(ev);
      // 统计折叠（崩溃前的事件也已计入，不依赖落库轨迹重算）
      statsAcc.onEvent(ev);
      // text_delta 不逐条落库（会随分片数膨胀）：仅入缓冲，由 flushStream 收尾聚合落库
      if (ev.type === 'text_delta') {
        streamBuf.push(ev.delta);
        return;
      }
      this.persistEvent(run.id, envelope(++seq, ev.type, { ...ev })).catch(() => undefined);
    };
    const patchRun = (patch: Partial<AgentRun>) =>
      this.runs.update(run.id, patch).catch((e) => this.logger.warn(`run ${run.id} 状态更新失败: ${(e as Error).message}`));
    // DSH request/header 快照：记录"模型请求的完整形态"（模型/温度/提示词哈希/工具集哈希），
    // 效果回退时可按 systemPromptSha/toolsSha 定位是提示词漂移、工具集变化还是模型切换
    const llmModel = this.config.get<string>('LLM_MODEL') || DEFAULT_MODEL;
    // Task 2.4：权限边界摘要（单一来源）——快照与 invokeInput 共用，快照哈希必须覆盖真实发送的提示词
    const permissionSummary =
      `可调用工具：${registry.list().map((t) => t.name).join('/')}；` +
      (approvalMode === 'strict'
        ? `敏感数据工具（${Object.values(SENSITIVE_TOOL_LABELS).join('/')}）将触发审批拦截。`
        : '当前为宽松模式，工具调用直接放行。');
    const snapshot = buildRequestSnapshot({
      model: llmModel,
      temperature: DEFAULT_TEMPERATURE,
      systemPrompt: buildSystemPrompt(user.role, permissionSummary),
      toolSchemas: registry.toFunctionSchemas(),
      role: user.role,
    });
    await patchRun({ requestSnapshot: JSON.stringify(snapshot) } as Partial<AgentRun>);
    const llm = this.buildLlm();
    const refVerifier = (refs: string[]) => verifyRefsAndFlag(this.retriever, refs);
    const invokeInput = {
      input: text,
      userId: user.id,
      role: user.role,
      runId: run.id,
      preview: opts.preview,
      permissionSummary,
      intent: 'general' as const,
      toolCalls: [],
      finalText: '',
      refs: [],
      needsHuman: false,
      onEvent,
    };
    const invokeGraph = (cp: SqliteSaver | undefined) =>
      buildAgentGraph({ llm, registry, checkpointer: cp, refVerifier, pipelineHooks }).invoke(
        invokeInput,
        { configurable: { thread_id: `agent-${run.id}` } },
      );

    // 图执行在独立 promise 中推进，事件经 queue 边产生边流出
    const runPromise = (async () => {
      const checkpointer = await this.checkpointer();
      try {
        const out = await invokeGraph(checkpointer);
        await patchRun({
          status: out.needsHuman ? 'needs_human' : 'success',
          intent: (out as { intent?: string }).intent ?? 'general',
          summary: out.finalText?.slice(0, 2000),
          durationMs: Date.now() - started,
          toolCalls: out.toolCalls.length,
          inputTokens: (out as { usage?: { inputTokens: number } }).usage?.inputTokens ?? 0,
          outputTokens: (out as { usage?: { outputTokens: number } }).usage?.outputTokens ?? 0,
          statsJson: JSON.stringify(statsAcc.snapshot()),
        });
        // text_delta 缓冲收尾落库：图执行结束后的剩余分片一次性聚合写入
        await flushStream();
      } catch (e) {
        const msg = (e as Error).message?.slice(0, 300) ?? 'unknown';
        // I10：checkpointer 运行期故障（SQLITE_BUSY 等）→ 降级重试一次（无记忆）
        if (checkpointer && /SQLITE|sqlite|busy|locked/i.test(msg)) {
          this.logger.warn(`agent run ${run.id} 检查点存储异常(${msg})，降级重试（关闭记忆）`);
          queue.push({ type: 'thinking', text: '（检查点存储异常，本轮已降级为无记忆执行）' });
          // I3：丢弃第一次尝试已入缓冲的文本，防止两次尝试文本拼接污染轨迹（重试后 flushStream 只落第二次）
          streamBuf.flush();
          try {
            const out = await invokeGraph(undefined);
            await patchRun({
              status: out.needsHuman ? 'needs_human' : 'success',
              intent: (out as { intent?: string }).intent ?? 'general',
              summary: out.finalText?.slice(0, 2000),
              durationMs: Date.now() - started,
              toolCalls: out.toolCalls.length,
              inputTokens: (out as { usage?: { inputTokens: number } }).usage?.inputTokens ?? 0,
              outputTokens: (out as { usage?: { outputTokens: number } }).usage?.outputTokens ?? 0,
              statsJson: JSON.stringify(statsAcc.snapshot()),
            });
            await flushStream();
            return;
          } catch (e2) {
            // 降级也失败则按普通失败处理（不重复降级）
            this.logger.error(`agent run ${run.id} 降级重试仍失败: ${(e2 as Error).message}`);
          }
        }
        this.logger.error(`agent run ${run.id} failed: ${msg}`);
        await patchRun({ status: 'failed', summary: `执行失败：${msg}`, durationMs: Date.now() - started });
        queue.push({ type: 'error', text: msg });
      } finally {
        // session-scope 生命周期收尾：run 结束即清空该 run 的批准集合，防止跨 run 残留
        this.approval.endRun(run.id);
        this.runQueues.delete(run.id);
        queue.close();
      }
    })();

    try {
      // 边执行边流出：事件到达即 yield，无需等待图整体结束
      for await (const ev of queue) {
        // task 事件由 pushTaskEvent 直推队列（不经 onEvent）→ 在此补落库，与图事件共享 seq 单调计数
        if (ev.type === 'task_start' || ev.type === 'task_end') {
          this.persistEvent(run.id, envelope(++seq, ev.type, { ...ev })).catch(() => undefined);
        }
        yield ev;
      }
    } finally {
      // 确保收尾（DB 状态更新）完成后才结束生成器
      await runPromise;
    }
  }

  /** 任务变更 SSE 推送（Task 3.3）：按 rec.runId 路由到该 run 的事件队列；run 已结束则静默丢弃（upsert 落库不依赖此路径） */
  private pushTaskEvent(runId: number, rec: AgentTaskInfo): void {
    const q = this.runQueues.get(runId);
    // 后台任务在 run 结束后才完成 → runQueues 已随 run close 清理，task_end 不进 SSE/轨迹；
    // 回放（runDetail）中该任务停留在 running，最终状态以 agent_tasks 表（终态已 upsert 落库）为准
    if (!q) return;
    if (rec.state === 'running') {
      q.push({ type: 'task_start', taskId: rec.taskId, kind: rec.kind, description: rec.description });
    } else {
      q.push({ type: 'task_end', taskId: rec.taskId, state: rec.state, outputSummary: rec.outputSummary });
    }
  }

  /** 事件持久化（信封驱动，轨迹回放数据源）：seq/time/type 落信封列，data 按类型展开 */
  private async persistEvent(runId: number, env: TrajectoryEnvelope) {
    try {
      const base = { runId, seq: env.seq, time: env.time, eventType: env.type };
      const d = env.data as {
        text?: string; name?: string; args?: unknown; result?: unknown; error?: string;
        durationMs?: number; finalText?: string; refs?: string[]; inputTokens?: number; outputTokens?: number;
      };
      // 全链路 emoji 兜底剥离：LLM 输出（thinking/final/文本）入库前统一去 emoji
      const clean = (s: string | null | undefined): string | null | undefined => (s == null ? s : stripEmoji(s));
      switch (env.type) {
        case 'thinking':
          await this.msgs.save(this.msgs.create({ ...base, role: 'assistant', kind: 'thinking', content: clean(d.text), status: 'done' }));
          break;
        case 'tool_start':
          await this.msgs.save(this.msgs.create({ ...base, role: 'assistant', kind: 'tool_call', tool: clean(d.name) ?? undefined, argsJson: JSON.stringify(d.args)?.slice(0, 2000), status: 'running' }));
          break;
        case 'tool_end':
          await this.msgs.save(this.msgs.create({ ...base, role: 'tool', kind: 'tool_result', tool: clean(d.name) ?? undefined, resultJson: JSON.stringify(d.result ?? { error: d.error })?.slice(0, 2000), status: d.error ? 'error' : 'done', durationMs: d.durationMs }));
          break;
        case 'done':
          await this.msgs.save(this.msgs.create({ ...base, role: 'assistant', kind: 'final', content: clean(d.finalText), refsJson: JSON.stringify(d.refs), status: 'done' }));
          break;
        case 'usage':
          await this.msgs.save(this.msgs.create({ ...base, role: 'system', kind: 'usage', content: JSON.stringify({ inputTokens: d.inputTokens, outputTokens: d.outputTokens }), status: 'done' }));
          break;
        case 'error':
          await this.msgs.save(this.msgs.create({ ...base, role: 'assistant', kind: 'final', content: `错误：${d.text}`, status: 'error' }));
          break;
        case 'task_start': {
          const td = d as { taskId?: string; kind?: string; description?: string };
          await this.msgs.save(this.msgs.create({ ...base, role: 'system', kind: 'task', tool: td.taskId, content: td.description, status: 'running' }));
          break;
        }
        case 'task_end': {
          const td = d as { taskId?: string; state?: string; outputSummary?: string };
          await this.msgs.save(this.msgs.create({ ...base, role: 'system', kind: 'task', tool: td.taskId, content: td.outputSummary ?? '', status: td.state === 'completed' ? 'done' : 'error' }));
          break;
        }
      }
    } catch (e) {
      this.logger.warn(`事件持久化失败: ${(e as Error).message}`);
    }
  }

  /** 历史运行列表 */
  async listRuns(user: JwtUser, page = 1, pageSize = 20) {
    const [list, total] = await this.runs.findAndCount({
      where: user.role === 'admin' ? {} : { userId: user.id },
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: Math.min(pageSize, 100),
    });
    return {
      list: list.map((r) => ({
        id: r.id,
        taskInput: r.taskInput,
        intent: r.intent,
        status: r.status,
        durationMs: r.durationMs,
        toolCalls: r.toolCalls,
        createdAt: r.createdAt,
        summary: r.summary?.slice(0, 200),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** 单次运行全链路回放 */
  async runDetail(user: JwtUser, id: number) {
    const run = await this.runs.findOne({ where: { id } });
    if (!run) throw new BizException(ErrorCodes.NOT_FOUND);
    if (user.role !== 'admin' && run.userId !== user.id) throw new BizException(ErrorCodes.SCOPE_FORBIDDEN);
    const msgs = await this.msgs.find({ where: { runId: id }, order: { id: 'ASC' } });
    // I2：轨迹 JSON 可能被截断（落库时 slice 2000 字）→ 解析失败返回原串，绝不让接口 500
    const safeParse = (s: string | null | undefined) => {
      if (!s) return null;
      try {
        return JSON.parse(s);
      } catch {
        return s;
      }
    };
    return {
      ...run,
      messages: msgs.map((m) => ({
        id: m.id,
        seq: m.seq,
        time: m.time,
        eventType: m.eventType,
        role: m.role,
        kind: m.kind,
        content: m.content,
        tool: m.tool,
        args: safeParse(m.argsJson),
        result: safeParse(m.resultJson),
        status: m.status,
        durationMs: m.durationMs,
        refs: safeParse(m.refsJson),
      })),
    };
  }
}

/**
 * 事件队列：生产者 push / 消费者 for-await，支撑图执行与 SSE 流出并行。
 * close() 后未消费的 next() 直接结束，避免悬挂。
 */
class EventQueue {
  private queue: AgentEvent[] = [];
  private resolvers: Array<(ev: AgentEvent | null) => void> = [];
  private closed = false;

  push(ev: AgentEvent) {
    const r = this.resolvers.shift();
    if (r) r(ev);
    else this.queue.push(ev);
  }

  close() {
    this.closed = true;
    while (this.resolvers.length) this.resolvers.shift()!(null);
  }

  [Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
    return {
      next: async (): Promise<IteratorResult<AgentEvent>> => {
        const ev = this.queue.shift();
        if (ev) return { value: ev, done: false };
        if (this.closed) return { value: undefined as never, done: true };
        return new Promise((resolve) =>
          this.resolvers.push((e) =>
            e ? resolve({ value: e, done: false }) : resolve({ value: undefined as never, done: true }),
          ),
        );
      },
    };
  }
}

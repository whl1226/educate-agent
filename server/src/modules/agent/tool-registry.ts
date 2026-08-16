import { randomUUID } from 'crypto';
import type { JwtUser } from '../../common/decorators/current-user.decorator';

export interface ToolContext {
  userId: number;
  role: string;
  /** 真实登录用户（工具层鉴权与数据范围校验的唯一依据） */
  user: JwtUser;
  /** 绑定的学生 ID（家长=孩子，学生=本人） */
  studentId?: number;
  classId?: number;
  /** 所属 Agent 运行 ID（任务三件套按 runId 隔离） */
  runId?: number;
  /** 体验预览模式（X-Preview: 1）：跨角色浏览时放行角色工具域，数据范围仍以 user 为准 */
  preview?: boolean;
}

export interface ToolDefinition<TArgs = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  needsPermission?: 'student' | 'teacher' | 'parent' | 'admin';
  execute: (ctx: ToolContext, args: TArgs) => Promise<TResult>;
}

export interface ToolCallRecord {
  tool: string;
  args: unknown;
  result?: unknown;
  error?: string;
  durationMs: number;
}

export type ToolDecision = { kind: 'allow' } | { kind: 'deny'; reason: string } | { kind: 'ask'; reason?: string };

export interface ToolPipelineHooks {
  /** ① pre-execute：waterfall 三态决策（DSH tools/pre-execute） */
  preExecute?: (ctx: ToolContext, tool: ToolDefinition, args: unknown) => ToolDecision | Promise<ToolDecision>;
  /** ② guard：单调否决（只能 deny，不能放行） */
  guard?: (ctx: ToolContext, tool: ToolDefinition, args: unknown) => { kind: 'deny'; reason: string } | null | Promise<{ kind: 'deny'; reason: string } | null>;
  /** ④ post-execute：观察/改写结果（异常吞掉，不影响执行结果） */
  postExecute?: (ctx: ToolContext, tool: ToolDefinition, args: unknown, rec: ToolCallRecord) => void | Promise<void>;
}

export type ApprovalHandler = (ctx: ToolContext, tool: ToolDefinition, args: unknown, callId: string) => Promise<'allowed' | 'denied' | 'denied_unavailable'>;

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private approvalHandler: ApprovalHandler | null = null;

  register<TArgs, TResult>(t: ToolDefinition<TArgs, TResult>): this {
    this.tools.set(t.name, t as ToolDefinition);
    return this;
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  toFunctionSchemas() {
    return this.list().map((t) => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
  }

  /** 注册审批处理器（ask 决策时调用；未注册 = fail-closed 拒绝） */
  setApprovalHandler(h: ApprovalHandler): this {
    this.approvalHandler = h;
    return this;
  }

  /** 执行并记录轨迹（供 Agent 循环调用） */
  async call(ctx: ToolContext, name: string, args: unknown, hooks?: ToolPipelineHooks): Promise<ToolCallRecord> {
    const tool = this.tools.get(name);
    const started = Date.now();
    if (!tool) {
      return { tool: name, args, error: `未知工具: ${name}`, durationMs: 0 };
    }
    // 垂直越权拦截：admin 可调所有工具，其余角色仅可调本人角色标注的工具；
    // 体验预览模式（X-Preview）放行角色工具域（跨角色浏览体验），数据范围仍由业务 Service 依据 ctx.user 校验
    if (
      tool.needsPermission &&
      ctx.role !== 'admin' &&
      ctx.role !== tool.needsPermission &&
      !ctx.preview
    ) {
      return { tool: name, args, error: '无权限调用该工具', durationMs: 0 };
    }
    // ① pre-execute 三态决策
    if (hooks?.preExecute) {
      const d = await hooks.preExecute(ctx, tool, args);
      if (d.kind === 'deny') return { tool: name, args, error: `工具被拒绝：${d.reason}`, durationMs: Date.now() - started };
      if (d.kind === 'ask') {
        if (!this.approvalHandler) {
          return { tool: name, args, error: '审批不可用（fail-closed 拒绝）', durationMs: Date.now() - started };
        }
        let outcome: 'allowed' | 'denied' | 'denied_unavailable';
        try {
          // 基础设施异常（如审批落库失败）一律 fail-closed，绝不穿透 call
          outcome = await this.approvalHandler(ctx, tool, args, randomUUID());
        } catch {
          outcome = 'denied_unavailable';
        }
        if (outcome !== 'allowed') {
          return {
            tool: name, args,
            error: outcome === 'denied' ? '审批被拒绝' : '审批不可用（fail-closed 拒绝）',
            durationMs: Date.now() - started,
          };
        }
      }
    }
    // ② guard 单调否决
    if (hooks?.guard) {
      const g = await hooks.guard(ctx, tool, args);
      if (g) return { tool: name, args, error: `guard 否决：${g.reason}`, durationMs: Date.now() - started };
    }
    // ③ execute（30s 超时不变）
    try {
      const result = await Promise.race([
        tool.execute(ctx, (args ?? {}) as never),
        new Promise((_, rej) => setTimeout(() => rej(new Error('工具超时（30s）')), 30_000)),
      ]);
      const rec: ToolCallRecord = { tool: name, args, result, durationMs: Date.now() - started };
      // ④ post-execute（观察型 hook 异常吞掉，不影响执行结果）
      if (hooks?.postExecute) {
        try {
          await hooks.postExecute(ctx, tool, args, rec);
        } catch {
          // 观察点失败不污染工具结果
        }
      }
      return rec;
    } catch (e) {
      return { tool: name, args, error: (e as Error).message?.slice(0, 500) ?? '未知错误', durationMs: Date.now() - started };
    }
    // ⑤ result：ToolCallRecord 即轨迹事件，由调用方落库
  }
}

export const TOOL_NAMES = [
  // 学生端
  'run_diagnosis', 'get_latest_diagnosis', 'get_error_book', 'get_study_plan',
  'practice_questions', 'submit_answer', 'search_knowledge', 'socratic_tutor',
  // 教师端
  'generate_lesson_plan', 'generate_paper', 'generate_document', 'get_class_overview', 'researcher_comment',
  // 家长端
  'get_weekly_report',
  // 管理端
  'get_region_overview', 'list_alerts', 'get_teacher_profile',
  // 任务三件套（工具即任务：所有角色可查询/查看本会话任务，停止仅教师/管理端且跨 run 仅 admin）
  'task_list', 'task_output', 'task_stop',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolBindings {
  run_diagnosis: (ctx: ToolContext, studentId: number) => Promise<unknown>;
  get_latest_diagnosis: (ctx: ToolContext, studentId: number) => Promise<unknown>;
  get_error_book: (ctx: ToolContext, studentId: number) => Promise<unknown>;
  get_study_plan: (ctx: ToolContext, studentId: number) => Promise<unknown>;
  practice_questions: (ctx: ToolContext, kpId: number | null, count: number) => Promise<unknown>;
  submit_answer: (ctx: ToolContext, questionId: number, answer: string) => Promise<unknown>;
  search_knowledge: (query: string, topK?: number) => Promise<unknown>;
  socratic_tutor: (problem: string, studentReply: string) => Promise<unknown>;
  generate_lesson_plan: (ctx: ToolContext, args: { subject: string; grade: string; topic: string; periodCount?: number; duration?: number }) => Promise<unknown>;
  generate_paper: (ctx: ToolContext, args: { subject: string; grade: string; title: string; layerMode?: string; questionCount?: number }) => Promise<unknown>;
  generate_document: (ctx: ToolContext, args: { format: string; content_md: string; title?: string; theme?: string; author?: string }) => Promise<unknown>;
  get_class_overview: (ctx: ToolContext, classId: number) => Promise<unknown>;
  researcher_comment: (ctx: ToolContext, sourceContent: string) => Promise<unknown>;
  get_weekly_report: (ctx: ToolContext, studentId: number) => Promise<unknown>;
  get_region_overview: () => Promise<unknown>;
  list_alerts: (type?: string, limit?: number) => Promise<unknown>;
  get_teacher_profile: (ctx: ToolContext, teacherId: number) => Promise<unknown>;
  task_list: (ctx: ToolContext, state?: string) => Promise<unknown>;
  task_output: (ctx: ToolContext, taskId: string) => Promise<unknown>;
  task_stop: (ctx: ToolContext, taskId: string) => Promise<unknown>;
}

export function buildRegistry(b: ToolBindings): ToolRegistry {
  const r = new ToolRegistry();
  const reg = (
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
    exec: (ctx: ToolContext, args: any) => Promise<unknown>,
    needsPermission?: 'student' | 'teacher' | 'parent' | 'admin',
  ) => r.register({ name, description, inputSchema, execute: exec, needsPermission });

  reg('run_diagnosis', '对当前登录学生执行 BKT 认知诊断，返回整体与各知识点掌握度、置信度、证据题数。省略 studentId 即诊断当前登录学生（学生端/家长端场景直接省略）。', {
    type: 'object', properties: { studentId: { type: 'integer', description: '学生 ID（可省略，默认当前登录学生）' } }, required: [],
  }, (c, a) => b.run_diagnosis(c, a.studentId));
  reg('get_latest_diagnosis', '获取学生最近一次诊断摘要。省略 studentId 默认当前登录学生。', {
    type: 'object', properties: { studentId: { type: 'integer', description: '学生 ID（可省略，默认当前登录学生）' } }, required: [],
  }, (c, a) => b.get_latest_diagnosis(c, a.studentId));
  reg('get_error_book', '获取学生错题本（含错因标签），用于定位反复出错知识点。省略 studentId 默认当前登录学生。', {
    type: 'object', properties: { studentId: { type: 'integer', description: '学生 ID（可省略，默认当前登录学生）' } }, required: [],
  }, (c, a) => b.get_error_book(c, a.studentId));
  reg('get_study_plan', '获取学生当前学习计划与步骤进度（ZPD）。省略 studentId 默认当前登录学生。', {
    type: 'object', properties: { studentId: { type: 'integer', description: '学生 ID（可省略，默认当前登录学生）' } }, required: [],
  }, (c, a) => b.get_study_plan(c, a.studentId));
  reg('practice_questions', '按知识点取练习题目（不泄露答案），用于生成个性化练习。', {
    type: 'object', properties: { kpId: { type: 'integer' }, count: { type: 'integer', minimum: 1, maximum: 10 } }, required: [],
  }, (c, a) => b.practice_questions(c, a.kpId ?? null, a.count ?? 3));
  reg('submit_answer', '提交一道题目的作答（客观题自动判分并回流诊断）。', {
    type: 'object', properties: { questionId: { type: 'integer' }, answer: { type: 'string' } }, required: ['questionId', 'answer'],
  }, (c, a) => b.submit_answer(c, a.questionId, a.answer));
  reg('search_knowledge', '检索教材知识库（embedding+BM25 混合，带出处引用）。回答知识问题必须调用本工具并标注引用。', {
    type: 'object', properties: { query: { type: 'string' }, topK: { type: 'integer', minimum: 1, maximum: 10 } }, required: ['query'],
  }, (_c, a) => b.search_knowledge(a.query, a.topK ?? 5));
  reg('socratic_tutor', '苏格拉底辅导一轮：输入问题与学生回答，输出引导语与阶段推进（绝不给答案）。', {
    type: 'object', properties: { problem: { type: 'string' }, studentReply: { type: 'string' } }, required: ['problem', 'studentReply'],
  }, (_c, a) => b.socratic_tutor(a.problem, a.studentReply));
  reg('generate_lesson_plan', '教师一键备课：生成结构化教案（目标/重难点/五段教学过程/分层作业/反思），带教材与模板引用。', {
    type: 'object', properties: { subject: { type: 'string' }, grade: { type: 'string' }, topic: { type: 'string' }, periodCount: { type: 'integer' }, duration: { type: 'integer' } }, required: ['subject', 'grade', 'topic'],
  }, (c, a) => b.generate_lesson_plan(c, a), 'teacher');
  reg('generate_paper', '教师一键组卷：A/B/C 分层试卷，返回结构与题目列表。', {
    type: 'object', properties: { subject: { type: 'string' }, grade: { type: 'string' }, title: { type: 'string' }, layerMode: { type: 'string', enum: ['uniform', 'layered'] }, questionCount: { type: 'integer' } }, required: ['subject', 'grade', 'title'],
  }, (c, a) => b.generate_paper(c, a), 'teacher');
  reg('generate_document', '教师办公文档生成：将 Markdown 内容（含 YAML 头：title/format/theme）渲染为 Word(docx)/PPT(pptx)/PDF/xlsx，返回下载链接。文档任务（教案/试卷/课件/报告/表格导出）必须使用本工具。', {
    type: 'object',
    properties: {
      format: { type: 'string', enum: ['docx', 'pptx', 'pdf', 'xlsx'], description: '目标格式' },
      content_md: { type: 'string', description: 'Markdown 内容，必须以 --- YAML 头开头（title/format/theme），正文用标准 Markdown' },
      title: { type: 'string', description: '文档标题（可选，覆盖 YAML title）' },
      theme: { type: 'string', description: '主题色：default/forest/ocean/sunset/ink/kids' },
    },
    required: ['format', 'content_md'],
  }, (c, a) => b.generate_document(c, a), 'teacher');
  reg('get_class_overview', '班级学情概览（人数/作答数/平均掌握度/风险学生）。', {
    type: 'object', properties: { classId: { type: 'integer' } }, required: ['classId'],
  }, (c, a) => b.get_class_overview(c, a.classId), 'teacher');
  reg('researcher_comment', 'AI 教研员：对教案内容点评，输出评分与改进建议。', {
    type: 'object', properties: { sourceContent: { type: 'string' } }, required: ['sourceContent'],
  }, (c, a) => b.researcher_comment(c, a.sourceContent), 'teacher');
  reg('get_weekly_report', '获取学生脱敏学情周报（家长端视图）。省略 studentId 默认当前登录学生的绑定孩子。', {
    type: 'object', properties: { studentId: { type: 'integer', description: '学生 ID（可省略，默认绑定孩子）' } }, required: [],
  }, (c, a) => b.get_weekly_report(c, a.studentId));
  reg('get_region_overview', '区域学情总览（学校数/活跃学生/平均掌握度/预警数）。', {
    type: 'object', properties: {}, required: [],
  }, () => b.get_region_overview(), 'admin');
  reg('list_alerts', '列出预警（控辍/心理/师资），含风险分与状态。', {
    type: 'object', properties: { type: { type: 'string' }, limit: { type: 'integer' } }, required: [],
  }, (_c, a) => b.list_alerts(a.type, a.limit ?? 10), 'admin');
  reg('get_teacher_profile', '教师数据画像（教学质量/教研/AI 融合等维度）。', {
    type: 'object', properties: { teacherId: { type: 'integer' } }, required: ['teacherId'],
  }, (c, a) => b.get_teacher_profile(c, a.teacherId), 'admin');
  reg('task_list', '列出本会话的后台任务（文档生成/组卷等）及其状态，可过滤状态（running/completed/failed）。', {
    type: 'object', properties: { state: { type: 'string', enum: ['running', 'completed', 'failed', 'timed_out', 'killed', 'lost'] } }, required: [],
  }, (c, a) => b.task_list(c, a.state));
  reg('task_output', '查询某后台任务的结果/进度摘要。', {
    type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'],
  }, (c, a) => b.task_output(c, a.taskId));
  reg('task_stop', '停止当前会话的后台任务（admin 可停止任意会话任务）。', {
    type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'],
  }, (c, a) => b.task_stop(c, a.taskId), 'teacher');

  return r;
}

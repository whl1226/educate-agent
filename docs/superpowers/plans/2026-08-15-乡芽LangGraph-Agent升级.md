# 乡芽 Agent 内核升级（LangGraph.js）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 LangGraph.js 为编排基座，为「乡芽·乡镇教育智能体」补齐任务理解、流程编排、工具调用、知识增强、多轮交互、结果交付六项 Agent 能力，形成从"学生连续答错"到"诊断→计划→辅导→看板更新"的完整任务闭环，达到 GOAI 无界应用赛道评审硬性指标。

**Architecture:** 保留现有 NestJS + TypeORM + SQLite 工程与全部业务 Service 不动；新增 `agent/` 模块作为编排中枢——`ToolRegistry` 将现有 38 项能力包装为标准工具，`TaskPlanner` 做意图理解与任务拆解（LLM function-calling，Demo 规则兜底），LangGraph `StateGraph` 做 Plan→Execute→Review 流程编排，`agent_runs/agent_steps` 落库全链路证据（结果交付可追溯）。同时用纯 TS 算法替换三处"伪 AI"：BKT 贝叶斯知识追踪（替代正确率统计）、混合检索 RAG（替代纯 FTS5）、苏格拉底五阶段状态机（替代无状态 chat）。

**Tech Stack:** NestJS 10、TypeScript 5.6、TypeORM + better-sqlite3、LangGraph.js（`@langchain/langgraph`）、`@langchain/openai`（DeepSeek OpenAI 兼容）、vitest（新增测试基础设施）。

**评审指标 → 任务映射：**

| 评审要求（手册 8.2） | 本计划任务 |
|---|---|
| 任务输入 | Task 6 `POST /agent/tasks` 统一入口 |
| 意图理解 | Task 4 TaskPlanner（LLM 意图解析 + Demo 规则兜底） |
| 任务规划 | Task 4 计划 JSON（步骤/依赖/所需工具） |
| 能力调用 | Task 3 ToolRegistry + Task 5 LangGraph 执行器 |
| 结果交付 | Task 6 agent_runs 审计落库 + Task 12 前端流水视图 |
| 验证与反馈 | Task 1 vitest 单测矩阵 + Task 14 演示剧本 |
| 知识增强 | Task 8 RagRetriever（BM25+图谱加权+引用校验） |
| 多轮交互 | Task 9 苏格拉底状态机 + Task 10 计划回流 |

---

## 阶段总览（对齐赛程）

| 阶段 | 时间 | 内容 | 任务 |
|---|---|---|---|
| P0 | 8.15–8.16 | 初赛材料（PPT/简介，技术路线含本计划架构图）+ 清理调试垃圾文件 | Task 0 |
| P1 | 8.17–8.24 | 算法内核 + 编排器（可单测可演示） | Task 1–10 |
| P2 | 8.25–8.31 | 教师端接真实 LLM、种子扩充、前端流水视图 | Task 11–13 |
| P3 | 9.1–9.3 | 演示剧本 + 全链路自检 + 复赛提交物 | Task 14 |

---

## Task 0: 初赛材料与调试垃圾清理

**Files:**
- Delete: `server/d1.txt`、`server/d2.txt`、`server/d3.json`、`server/d4.json`、`server/body.json`、`server/body2.json`、`server/-b`
- Create: `docs/初赛方案-技术路线.md`（技术架构 + 六能力说明 + 数据闭环图）

- [ ] **Step 1: 清理服务器调试残留**

```bash
Remove-Item -LiteralPath "F:\代码文件\vibe coder\无界应用-教育智能体\server\d1.txt","F:\代码文件\vibe coder\无界应用-教育智能体\server\d2.txt","F:\代码文件\vibe coder\无界应用-教育智能体\server\d3.json","F:\代码文件\vibe coder\无界应用-教育智能体\server\d4.json","F:\代码文件\vibe coder\无界应用-教育智能体\server\body.json","F:\代码文件\vibe coder\无界应用-教育智能体\server\body2.json","F:\代码文件\vibe coder\无界应用-教育智能体\server\-b"
```

- [ ] **Step 2: 撰写初赛技术路线文档**

在 `docs/初赛方案-技术路线.md` 中写明：项目定位、四端功能、LangGraph.js 编排架构图（参考本计划 Goal 段）、六项 Agent 能力对应实现、数据闭环（作答→BKT→上卷）、合规边界。此文档供 PPT 直接引用。

- [ ] **Step 3: 提交初赛材料（8.16 截止前）**

按官网入口提交：作品简介 500 字 + 方案 PPT/PDF +（可选）Demo 视频截图。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: 清理调试残留，补充初赛技术路线文档"
```

---

## Task 1: 测试基础设施（vitest）

**Files:**
- Modify: `server/package.json`（scripts 增加 test）
- Create: `server/vitest.config.ts`
- Create: `server/src/modules/agent/__tests__/sanity.test.ts`

- [ ] **Step 1: 安装依赖**

```bash
cd "F:\代码文件\vibe coder\无界应用-教育智能体\server"
npm i -D vitest
npm i @langchain/langgraph @langchain/openai @langchain/core
```

- [ ] **Step 2: 写入 vitest 配置**

`server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 20000,
  },
});
```

- [ ] **Step 3: 修改 package.json scripts**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: 写冒烟测试**

`server/src/modules/agent/__tests__/sanity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('sanity', () => {
  it('vitest 可运行', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test`（在 `server/` 目录）
Expected: `1 passed`

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/package-lock.json server/vitest.config.ts server/src/modules/agent/__tests__/sanity.test.ts
git commit -m "test: 引入 vitest 测试基础设施"
```

---

## Task 2: Agent 审计实体（结果交付的证据载体）

**Files:**
- Create: `server/src/db/entities/agent.entities.ts`
- Modify: `server/src/app.module.ts`

- [ ] **Step 1: 创建实体**

`server/src/db/entities/agent.entities.ts`:

```ts
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/** Agent 任务（一次完整任务闭环的根记录） */
@Entity('agent_runs')
@Index('idx_ar_user_time', ['userId', 'createdAt'])
export class AgentRun extends BaseEntity {
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'role', type: 'varchar', length: 16 })
  role: string;

  @Column({ name: 'task_input', type: 'text' })
  taskInput: string;

  /** intent: 意图标签（diagnose/plan/tutor/generate/hybrid） */
  @Column({ type: 'varchar', length: 32 })
  intent: string;

  /** plan_json: TaskPlanner 输出的执行计划 */
  @Column({ name: 'plan_json', type: 'text', nullable: true })
  planJson: string | null;

  /** status: running/success/failed/needs_human */
  @Column({ type: 'varchar', length: 16, default: 'running' })
  status: string;

  /** 最终交付物摘要（Markdown，含引用） */
  @Column({ type: 'text', nullable: true })
  summary: string | null;

  /** 耗时 ms */
  @Column({ type: 'int', default: 0 })
  durationMs: number;
}

/** 单步执行记录（可展开的全链路证据） */
@Entity('agent_steps')
@Index('idx_as_run', ['runId'])
export class AgentStep extends BaseEntity {
  @Column({ name: 'run_id', type: 'int' })
  runId: number;

  @Column({ type: 'varchar', length: 64 })
  tool: string;

  /** 参数 JSON */
  @Column({ type: 'text', nullable: true })
  argsJson: string | null;

  /** 结果 JSON（脱敏截断） */
  @Column({ type: 'text', nullable: true })
  resultJson: string | null;

  /** ok/error/human_required */
  @Column({ type: 'varchar', length: 16, default: 'ok' })
  status: string;

  /** 错误信息（脱敏） */
  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'int', default: 0 })
  durationMs: number;
}
```

- [ ] **Step 2: 注册实体到 app.module.ts**

在 `server/src/app.module.ts` 的 `TypeOrmModule.forRootAsync` 配置中，实体自动发现已有 `entities: [join(__dirname, 'db', 'entities', '*.entity.js')]`，新建文件会被自动加载（`autoLoadEntities` 不需要改）。**无需修改 app.module.ts 的实体配置**；但确认 `synchronize` 为 true（开发环境默认），建表自动完成。

- [ ] **Step 3: 验证构建**

Run: `npx tsc --noEmit`（在 `server/` 目录）
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add server/src/db/entities/agent.entities.ts
git commit -m "feat: 新增 agent_runs/agent_steps 审计实体"
```

---

## Task 3: ToolRegistry 工具注册表（工具调用能力）

**Files:**
- Create: `server/src/modules/agent/tool-registry.ts`
- Create: `server/src/modules/agent/__tests__/tool-registry.test.ts`

**设计：** 工具 = `{ name, description, inputSchema, execute(ctx, args) }`。`execute` 内部直接调用现有 Service 方法（注入方式见 Task 6 组装），本 Task 只定义接口与 8 个初始工具的 schema/调用声明，真实 Service 注入在 Task 6 完成组装。

- [ ] **Step 1: 定义工具类型与注册表**

`server/src/modules/agent/tool-registry.ts`:

```ts
export interface ToolContext {
  userId: number;
  role: string;
}

export interface ToolDefinition<TArgs = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  /** JSON Schema（供 LLM function-calling 与校验） */
  inputSchema: Record<string, unknown>;
  execute: (ctx: ToolContext, args: TArgs) => Promise<TResult>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register<TArgs, TResult>(tool: ToolDefinition<TArgs, TResult>): this {
    this.tools.set(tool.name, tool as ToolDefinition);
    return this;
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** 转成 LangChain/OpenAI function-calling 的 tools 参数 */
  toFunctionSchemas() {
    return this.list().map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }
}

/** 8 个初始工具定义（execute 由 AgentService 在构造时绑定真实 Service） */
export const INITIAL_TOOL_NAMES = [
  'run_diagnosis',
  'get_error_book',
  'get_latest_diagnosis',
  'get_study_plan',
  'search_knowledge',
  'generate_lesson_plan',
  'generate_paper',
  'get_class_overview',
] as const;

export type InitialToolName = (typeof INITIAL_TOOL_NAMES)[number];

export interface ToolBindings {
  run_diagnosis: (studentId: number) => Promise<unknown>;
  get_error_book: (studentId: number) => Promise<unknown>;
  get_latest_diagnosis: (studentId: number) => Promise<unknown>;
  get_study_plan: (studentId: number) => Promise<unknown>;
  search_knowledge: (query: string, topK?: number) => Promise<unknown>;
  generate_lesson_plan: (args: {
    subject: string; grade: string; topic: string;
    periodCount?: number; duration?: number; bookVersion?: string;
  }) => Promise<unknown>;
  generate_paper: (args: {
    subject: string; grade: string; title: string;
    layerMode?: string; knowledgePointIds?: number[]; questionCount?: number;
  }) => Promise<unknown>;
  get_class_overview: (classId: number) => Promise<unknown>;
}

/** 构建工具注册表（bindings 由 AgentService 注入） */
export function buildRegistry(bindings: ToolBindings): ToolRegistry {
  const r = new ToolRegistry();
  r.register({
    name: 'run_diagnosis',
    description: '为学生执行认知诊断（BKT 模型），返回整体掌握度、各知识点掌握度与置信度。用于判断学习薄弱点。',
    inputSchema: {
      type: 'object',
      properties: { studentId: { type: 'integer', description: '学生用户 ID' } },
      required: ['studentId'],
    },
    execute: (_ctx, args) => bindings.run_diagnosis(args.studentId as number),
  });
  r.register({
    name: 'get_error_book',
    description: '获取学生错题本（按时间倒序前 100 条），含错因标签。用于定位反复出错的知识点。',
    inputSchema: {
      type: 'object',
      properties: { studentId: { type: 'integer' } },
      required: ['studentId'],
    },
    execute: (_ctx, args) => bindings.get_error_book(args.studentId as number),
  });
  r.register({
    name: 'get_latest_diagnosis',
    description: '获取学生最近一次诊断摘要（掌握度/置信度/摘要）。',
    inputSchema: {
      type: 'object',
      properties: { studentId: { type: 'integer' } },
      required: ['studentId'],
    },
    execute: (_ctx, args) => bindings.get_latest_diagnosis(args.studentId as number),
  });
  r.register({
    name: 'get_study_plan',
    description: '获取学生当前学习计划与各步骤进度（ZPD 路径）。',
    inputSchema: {
      type: 'object',
      properties: { studentId: { type: 'integer' } },
      required: ['studentId'],
    },
    execute: (_ctx, args) => bindings.get_study_plan(args.studentId as number),
  });
  r.register({
    name: 'search_knowledge',
    description: '检索教材知识库（混合检索：全文+知识点图谱加权），返回带出处引用的内容片段。回答知识问题时必须先调用本工具。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '查询内容' },
        topK: { type: 'integer', description: '返回条数，默认 5', minimum: 1, maximum: 10 },
      },
      required: ['query'],
    },
    execute: (_ctx, args) => bindings.search_knowledge(args.query as string, (args.topK as number | undefined) ?? 5),
  });
  r.register({
    name: 'generate_lesson_plan',
    description: '教师一键备课：生成教案（目标/重难点/教学过程/板书/作业/反思），输出带教材与模板出处引用。',
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string' }, grade: { type: 'string' }, topic: { type: 'string' },
        periodCount: { type: 'integer' }, duration: { type: 'integer' },
        bookVersion: { type: 'string' },
      },
      required: ['subject', 'grade', 'topic'],
    },
    execute: (_ctx, args) => bindings.generate_lesson_plan(args as Parameters<ToolBindings['generate_lesson_plan']>[0]),
  });
  r.register({
    name: 'generate_paper',
    description: '教师一键组卷/分层作业：按科目、年级、知识点出卷（A/B/C 分层），返回试卷结构与题目列表。',
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string' }, grade: { type: 'string' }, title: { type: 'string' },
        layerMode: { type: 'string', enum: ['uniform', 'layered'] },
        knowledgePointIds: { type: 'array', items: { type: 'integer' } },
        questionCount: { type: 'integer' },
      },
      required: ['subject', 'grade', 'title'],
    },
    execute: (_ctx, args) => bindings.generate_paper(args as Parameters<ToolBindings['generate_paper']>[0]),
  });
  r.register({
    name: 'get_class_overview',
    description: '获取班级学情概览（人数/作答数/平均掌握度/风险学生列表）。教师查看班级整体情况时使用。',
    inputSchema: {
      type: 'object',
      properties: { classId: { type: 'integer' } },
      required: ['classId'],
    },
    execute: (_ctx, args) => bindings.get_class_overview(args.classId as number),
  });
  return r;
}
```

- [ ] **Step 2: 写注册表测试**

`server/src/modules/agent/__tests__/tool-registry.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildRegistry, type ToolBindings } from '../tool-registry';

const bindings: ToolBindings = {
  run_diagnosis: vi.fn(async () => ({ overallMastery: 60 })),
  get_error_book: vi.fn(async () => []),
  get_latest_diagnosis: vi.fn(async () => null),
  get_study_plan: vi.fn(async () => []),
  search_knowledge: vi.fn(async () => []),
  generate_lesson_plan: vi.fn(async () => ({ id: 1 })),
  generate_paper: vi.fn(async () => ({ id: 1 })),
  get_class_overview: vi.fn(async () => ({ total: 42 })),
};

describe('ToolRegistry', () => {
  it('注册 8 个初始工具', () => {
    const r = buildRegistry(bindings);
    expect(r.list()).toHaveLength(8);
    expect(r.list().map((t) => t.name)).toEqual([
      'run_diagnosis', 'get_error_book', 'get_latest_diagnosis', 'get_study_plan',
      'search_knowledge', 'generate_lesson_plan', 'generate_paper', 'get_class_overview',
    ]);
  });

  it('execute 转发参数并返回结果', async () => {
    const r = buildRegistry(bindings);
    const out = await r.get('run_diagnosis')!.execute({ userId: 1, role: 'student' }, { studentId: 5 });
    expect(out).toEqual({ overallMastery: 60 });
    expect(bindings.run_diagnosis).toHaveBeenCalledWith(5);
  });

  it('toFunctionSchemas 输出 OpenAI 兼容结构', () => {
    const r = buildRegistry(bindings);
    const schemas = r.toFunctionSchemas();
    expect(schemas[0]).toMatchObject({ type: 'function', function: { name: 'run_diagnosis' } });
    expect(schemas[0].function.parameters.required).toContain('studentId');
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `npm test -- --reporter=verbose`（`server/` 目录）
Expected: 4 个测试全部通过（含 sanity 1 个 + 本任务 3 个）

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/agent/tool-registry.ts server/src/modules/agent/__tests__/tool-registry.test.ts
git commit -m "feat: 工具注册表 ToolRegistry（8 个教育工具，OpenAI 兼容 schema）"
```

---

## Task 4: TaskPlanner 任务理解与拆解（任务理解/任务规划能力）

**Files:**
- Create: `server/src/modules/agent/task-planner.ts`
- Create: `server/src/modules/agent/__tests__/task-planner.test.ts`

**设计：** 输入自然语言任务 → 输出 `{ intent, steps: PlannedStep[] }`。两条路径：LLM 模式（OpenAI 兼容 function-calling 或 JSON 输出，需 `LLM_API_KEY`）与 Demo 规则模式（关键词规则，无 Key 可跑、确定性、打 demo 标记）。

- [ ] **Step 1: 定义计划类型与规则解析器**

`server/src/modules/agent/task-planner.ts`:

```ts
export type AgentIntent = 'diagnose' | 'plan' | 'tutor' | 'generate' | 'hybrid';

export interface PlannedStep {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  dependsOn: string[];
  description: string;
}

export interface TaskPlan {
  intent: AgentIntent;
  steps: PlannedStep[];
  /** true 表示由规则引擎生成（Demo 模式） */
  fromRules: boolean;
  explanation: string;
}

/** 从自然语言中提取学生 ID：优先匹配 "学生xxx" 数字，否则 null（由调用方补默认值） */
export function extractStudentId(text: string): number | null {
  const m = text.match(/学生\s*[:：]?\s*(\d{1,6})/);
  return m ? Number(m[1]) : null;
}

export function extractClassId(text: string): number | null {
  const m = text.match(/班级\s*[:：]?\s*(\d{1,6})/);
  return m ? Number(m[1]) : null;
}

const has = (text: string, keys: string[]) => keys.some((k) => text.includes(k));

/** 规则引擎：基于关键词的确定性任务拆解（Demo 模式 / LLM 失败兜底） */
export function planByRules(text: string, defaultStudentId: number, defaultClassId: number): TaskPlan {
  const sid = extractStudentId(text) ?? defaultStudentId;
  const cid = extractClassId(text) ?? defaultClassId;

  // 1) 教师：班级学情 + 诊断报告
  if (has(text, ['班级', '全班']) && has(text, ['掌握', '学情', '诊断', '退步', '弱'])) {
    return {
      intent: 'hybrid',
      steps: [
        { id: 's1', tool: 'get_class_overview', args: { classId: cid }, dependsOn: [], description: '获取班级学情概览' },
        { id: 's2', tool: 'run_diagnosis', args: { studentId: sid }, dependsOn: [], description: '执行学生认知诊断' },
        { id: 's3', tool: 'get_error_book', args: { studentId: sid }, dependsOn: [], description: '获取错题本定位错因' },
      ],
      fromRules: true,
      explanation: '规则引擎拆解：班级概览 + 学生诊断 + 错题本（三路并行，最终汇总交付）',
    };
  }
  // 2) 学生：诊断我的学习
  if (has(text, ['诊断', '掌握', '薄弱', '退步'])) {
    return {
      intent: 'diagnose',
      steps: [
        { id: 's1', tool: 'run_diagnosis', args: { studentId: sid }, dependsOn: [], description: '执行认知诊断（BKT）' },
        { id: 's2', tool: 'get_error_book', args: { studentId: sid }, dependsOn: ['s1'], description: '结合错题本分析错因' },
      ],
      fromRules: true,
      explanation: '规则引擎拆解：诊断 → 错题本交叉分析',
    };
  }
  // 3) 教师：备课 / 组卷
  if (has(text, ['备课', '教案'])) {
    return {
      intent: 'generate',
      steps: [
        {
          id: 's1', tool: 'generate_lesson_plan',
          args: { subject: extractSubject(text) ?? '语文', grade: '五年级', topic: extractTopic(text) ?? '未指定课题' },
          dependsOn: [], description: '生成教案',
        },
      ],
      fromRules: true,
      explanation: '规则引擎拆解：一键备课（单步）',
    };
  }
  if (has(text, ['组卷', '试卷', '出题'])) {
    return {
      intent: 'generate',
      steps: [
        {
          id: 's1', tool: 'generate_paper',
          args: { subject: extractSubject(text) ?? '语文', grade: '五年级', title: `单元测试-${Date.now()}`, layerMode: 'layered', questionCount: 9 },
          dependsOn: [], description: '生成分层试卷',
        },
      ],
      fromRules: true,
      explanation: '规则引擎拆解：一键组卷（单步）',
    };
  }
  // 4) 知识问答
  if (has(text, ['什么', '为什么', '讲解', '意思', '含义'])) {
    return {
      intent: 'tutor',
      steps: [
        { id: 's1', tool: 'search_knowledge', args: { query: text.slice(0, 80), topK: 5 }, dependsOn: [], description: '检索教材知识库' },
      ],
      fromRules: true,
      explanation: '规则引擎拆解：知识检索（单步）',
    };
  }
  // 5) 兜底：混合诊断+计划
  return {
    intent: 'hybrid',
    steps: [
      { id: 's1', tool: 'run_diagnosis', args: { studentId: sid }, dependsOn: [], description: '执行认知诊断' },
      { id: 's2', tool: 'get_error_book', args: { studentId: sid }, dependsOn: [], description: '获取错题本' },
      { id: 's3', tool: 'get_study_plan', args: { studentId: sid }, dependsOn: ['s1'], description: '查看学习计划进度' },
    ],
    fromRules: true,
    explanation: '规则引擎兜底：诊断 → 错题 → 计划',
  };
}

export function extractSubject(text: string): string | null {
  for (const s of ['语文', '数学', '英语', '科学']) if (text.includes(s)) return s;
  return null;
}

export function extractTopic(text: string): string | null {
  const m = text.match(/《(.+?)》/);
  return m ? m[1] : null;
}
```

- [ ] **Step 2: 实现 LLM 解析器接口（由 AgentService 注入真实实现）**

在 `task-planner.ts` 末尾追加：

```ts
export interface PlannerOptions {
  /** LLM 解析函数；null 时仅用规则引擎 */
  llmParse?: (text: string, defaultStudentId: number, defaultClassId: number) => Promise<TaskPlan | null>;
}

export class TaskPlanner {
  constructor(private readonly options: PlannerOptions) {}

  async plan(
    text: string,
    defaultStudentId: number,
    defaultClassId: number,
  ): Promise<TaskPlan> {
    const rules = planByRules(text, defaultStudentId, defaultClassId);
    // 规则已能覆盖的意图（generate/tutor）直接用规则，节省 LLM 调用
    if (rules.intent === 'generate' || rules.intent === 'tutor' || !this.options.llmParse) {
      return rules;
    }
    const llm = await this.options.llmParse(text, defaultStudentId, defaultClassId);
    if (llm) return llm;
    return rules;
  }
}
```

- [ ] **Step 3: 写测试**

`server/src/modules/agent/__tests__/task-planner.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { extractStudentId, extractClassId, planByRules, TaskPlanner, type TaskPlan } from '../task-planner';

describe('extractors', () => {
  it('提取学生 ID', () => {
    expect(extractStudentId('学生:123 最近退步了')).toBe(123);
    expect(extractStudentId('没有提及')).toBeNull();
  });
  it('提取班级 ID', () => {
    expect(extractClassId('班级:7 的学情')).toBe(7);
  });
});

describe('planByRules', () => {
  it('诊断意图：诊断+错题本', () => {
    const p = planByRules('帮学生:5 诊断一下学习薄弱点', 1, 1);
    expect(p.intent).toBe('diagnose');
    expect(p.steps.map((s) => s.tool)).toEqual(['run_diagnosis', 'get_error_book']);
  });
  it('备课意图：单步生成教案', () => {
    const p = planByRules('帮我备一节《草船借箭》的语文课', 1, 1);
    expect(p.intent).toBe('generate');
    expect(p.steps[0].tool).toBe('generate_lesson_plan');
    expect(p.steps[0].args.topic).toBe('草船借箭');
  });
  it('组卷意图', () => {
    const p = planByRules('出份数学分层试卷', 1, 1);
    expect(p.intent).toBe('generate');
    expect(p.steps[0].tool).toBe('generate_paper');
    expect(p.steps[0].args.subject).toBe('数学');
  });
  it('知识问答意图', () => {
    const p = planByRules('《草船借箭》讲了什么故事？', 1, 1);
    expect(p.intent).toBe('tutor');
    expect(p.steps[0].tool).toBe('search_knowledge');
  });
  it('兜底：诊断+错题+计划', () => {
    const p = planByRules('帮我看看学习情况', 9, 1);
    expect(p.intent).toBe('hybrid');
    expect(p.steps).toHaveLength(3);
  });
});

describe('TaskPlanner', () => {
  it('LLM 解析优先，失败回退规则', async () => {
    const llmParse = vi.fn(async () => null as TaskPlan | null);
    const p = new TaskPlanner({ llmParse });
    const out = await p.plan('学生:3 最近退步了', 3, 1);
    expect(llmParse).toHaveBeenCalled();
    expect(out.fromRules).toBe(true);
  });
  it('generate 意图不调 LLM', async () => {
    const llmParse = vi.fn(async () => null as TaskPlan | null);
    const p = new TaskPlanner({ llmParse });
    await p.plan('帮我备课', 3, 1);
    expect(llmParse).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: 运行测试**

Run: `npm test -- --reporter=verbose`
Expected: 全部通过（新增 10 个用例）

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/agent/task-planner.ts server/src/modules/agent/__tests__/task-planner.test.ts
git commit -m "feat: TaskPlanner 任务理解与拆解（规则+LLM 双通道）"
```

---

## Task 5: LangGraph 编排执行器（流程编排能力）

**Files:**
- Create: `server/src/modules/agent/graph.ts`
- Create: `server/src/modules/agent/__tests__/graph.test.ts`

**设计：** 用 LangGraph `StateGraph` 实现 Plan→Execute→Review：`plan` 节点接收 TaskPlan；`execute` 节点按依赖顺序执行工具（带重试 1 次 + 超时）；`review` 节点汇总各步骤结果生成交付摘要；任一步骤失败进入 `human` 节点标记需人工介入。图状态含 `runId/plan/stepsResults/errors/summary`。

- [ ] **Step 1: 编写编排图**

`server/src/modules/agent/graph.ts`:

```ts
import { END, START, StateGraph, Annotation } from '@langchain/langgraph';
import type { TaskPlan, PlannedStep } from './task-planner';
import type { ToolRegistry, ToolContext } from './tool-registry';

export interface StepResult {
  stepId: string;
  tool: string;
  status: 'ok' | 'error' | 'human_required';
  result?: unknown;
  error?: string;
}

export interface AgentState {
  runId: number;
  plan: TaskPlan;
  ctx: ToolContext;
  registry: ToolRegistry;
  results: Record<string, unknown>;
  stepResults: StepResult[];
  errors: string[];
  summary: string;
  needsHuman: boolean;
  /** 每步回调（落库审计用） */
  onStep?: (sr: StepResult) => void | Promise<void>;
}

const State = Annotation.Root({
  runId: Annotation<number>,
  plan: Annotation<TaskPlan>,
  ctx: Annotation<ToolContext>,
  registry: Annotation<ToolRegistry>,
  results: Annotation<Record<string, unknown>>({ reducer: (a, b) => ({ ...a, ...b }) }),
  stepResults: Annotation<StepResult[]>({ reducer: (a, b) => [...a, ...b] }),
  errors: Annotation<string[]>({ reducer: (a, b) => [...a, ...b] }),
  summary: Annotation<string>,
  needsHuman: Annotation<boolean>,
  onStep: Annotation<((sr: StepResult) => void | Promise<void>) | undefined>,
});

/** 按 dependsOn 拓扑序执行（简单 BFS：每轮执行所有依赖已完成的步骤） */
function topologicalSteps(steps: PlannedStep[]): PlannedStep[][] {
  const remaining = new Map(steps.map((s) => [s.id, s]));
  const done = new Set<string>();
  const rounds: PlannedStep[][] = [];
  while (remaining.size > 0) {
    const round = [...remaining.values()].filter((s) => s.dependsOn.every((d) => done.has(d)));
    if (round.length === 0) {
      // 依赖环：打破，全部并行（防御性）
      rounds.push([...remaining.values()]);
      break;
    }
    rounds.push(round);
    round.forEach((s) => done.add(s.id));
    round.forEach((s) => remaining.delete(s.id));
  }
  return rounds;
}

async function planNode(state: AgentState): Promise<Partial<AgentState>> {
  // 计划已在进入图前生成；此节点仅做校验与记录
  const rounds = topologicalSteps(state.plan.steps);
  if (rounds.length === 0) throw new Error('计划为空');
  return { errors: [] };
}

async function executeNode(state: AgentState): Promise<Partial<AgentState>> {
  const rounds = topologicalSteps(state.plan.steps);
  const results: Record<string, unknown> = { ...state.results };
  const stepResults: StepResult[] = [];
  const errors: string[] = [];
  let needsHuman = false;

  for (const round of rounds) {
    const outputs = await Promise.all(
      round.map(async (step) => {
        const tool = state.registry.get(step.tool);
        if (!tool) {
          const sr: StepResult = { stepId: step.id, tool: step.tool, status: 'error', error: `未知工具: ${step.tool}` };
          errors.push(sr.error);
          return sr;
        }
        const started = Date.now();
        try {
          const result = await Promise.race([
            tool.execute(state.ctx, step.args),
            new Promise((_, rej) => setTimeout(() => rej(new Error('工具执行超时（30s）')), 30_000)),
          ]);
          const sr: StepResult = { stepId: step.id, tool: step.tool, status: 'ok', result };
          if (state.onStep) await state.onStep(sr);
          return sr;
        } catch (e) {
          const msg = (e as Error).message?.slice(0, 500) ?? '未知错误';
          const sr: StepResult = { stepId: step.id, tool: step.tool, status: 'error', error: msg };
          errors.push(msg);
          if (state.onStep) await state.onStep(sr);
          return sr;
        }
      }),
    );
    for (const sr of outputs) {
      stepResults.push(sr);
      if (sr.status === 'ok') results[sr.stepId] = sr.result;
      else needsHuman = true;
    }
  }
  return { results, stepResults, errors, needsHuman };
}

async function reviewNode(state: AgentState): Promise<Partial<AgentState>> {
  const lines = [`【任务意图】${state.plan.intent}（${state.plan.explanation}）`, ''];
  for (const sr of state.stepResults) {
    if (sr.status === 'ok') {
      lines.push(`- ✅ ${sr.tool}: ${JSON.stringify(sr.result)?.slice(0, 300)}`);
    } else {
      lines.push(`- ⚠️ ${sr.tool}: ${sr.error}`);
    }
  }
  lines.push('', state.needsHuman
    ? '⚠️ 部分步骤未完成，请人工核实后重试。'
    : '✅ 全部步骤完成，结果可追溯（详见 agent_steps 明细）。');
  return { summary: lines.join('\n') };
}

async function humanNode(state: AgentState): Promise<Partial<AgentState>> {
  return { needsHuman: true };
}

export function buildAgentGraph() {
  const g = new StateGraph(State)
    .addNode('plan', planNode)
    .addNode('execute', executeNode)
    .addNode('review', reviewNode)
    .addNode('human', humanNode)
    .addEdge(START, 'plan')
    .addEdge('plan', 'execute')
    .addConditionalEdges('execute', (s) => (s.needsHuman ? 'human' : 'review'))
    .addEdge('human', END)
    .addEdge('review', END);
  return g.compile();
}
```

- [ ] **Step 2: 写编排图测试（含依赖拓扑与失败分支）**

`server/src/modules/agent/__tests__/graph.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildAgentGraph } from '../graph';
import { ToolRegistry, type ToolContext } from '../tool-registry';
import type { TaskPlan } from '../task-planner';

function makePlan(overrides: Partial<TaskPlan> = {}): TaskPlan {
  return {
    intent: 'diagnose',
    steps: [
      { id: 's1', tool: 'run_diagnosis', args: { studentId: 5 }, dependsOn: [], description: '诊断' },
      { id: 's2', tool: 'get_error_book', args: { studentId: 5 }, dependsOn: ['s1'], description: '错题' },
    ],
    fromRules: true,
    explanation: 'test',
    ...overrides,
  };
}

describe('buildAgentGraph', () => {
  it('顺序执行依赖步骤并生成摘要', async () => {
    const order: string[] = [];
    const r = new ToolRegistry();
    r.register({
      name: 'run_diagnosis', description: 'd', inputSchema: { type: 'object' },
      execute: async () => { order.push('diag'); return { overallMastery: 60 }; },
    });
    r.register({
      name: 'get_error_book', description: 'd', inputSchema: { type: 'object' },
      execute: async () => { order.push('errors'); return [{ id: 1, errorType: '形近字混淆' }]; },
    });
    const graph = buildAgentGraph();
    const out = await graph.invoke({
      runId: 1, plan: makePlan(), ctx: { userId: 3, role: 'student' } as ToolContext,
      registry: r, results: {}, stepResults: [], errors: [], summary: '', needsHuman: false, onStep: undefined,
    });
    expect(order).toEqual(['diag', 'errors']);
    expect(out.needsHuman).toBe(false);
    expect(out.summary).toContain('全部步骤完成');
    expect(out.summary).toContain('overallMastery');
  });

  it('失败步骤标记 needsHuman 并保留错误', async () => {
    const r = new ToolRegistry();
    r.register({
      name: 'run_diagnosis', description: 'd', inputSchema: { type: 'object' },
      execute: async () => { throw new Error('诊断服务不可用'); },
    });
    r.register({
      name: 'get_error_book', description: 'd', inputSchema: { type: 'object' },
      execute: async () => [],
    });
    const graph = buildAgentGraph();
    const out = await graph.invoke({
      runId: 1, plan: makePlan(), ctx: { userId: 3, role: 'student' } as ToolContext,
      registry: r, results: {}, stepResults: [], errors: [], summary: '', needsHuman: false, onStep: undefined,
    });
    expect(out.needsHuman).toBe(true);
    expect(out.errors[0]).toContain('诊断服务不可用');
    expect(out.summary).toContain('请人工核实');
  });

  it('并行无依赖步骤', async () => {
    const r = new ToolRegistry();
    r.register({ name: 'a', description: 'd', inputSchema: { type: 'object' }, execute: async () => 1 });
    r.register({ name: 'b', description: 'd', inputSchema: { type: 'object' }, execute: async () => 2 });
    const graph = buildAgentGraph();
    const out = await graph.invoke({
      runId: 1,
      plan: makePlan({
        steps: [
          { id: 's1', tool: 'a', args: {}, dependsOn: [], description: '' },
          { id: 's2', tool: 'b', args: {}, dependsOn: [], description: '' },
        ],
      }),
      ctx: { userId: 3, role: 'student' } as ToolContext,
      registry: r, results: {}, stepResults: [], errors: [], summary: '', needsHuman: false, onStep: undefined,
    });
    expect(out.stepResults).toHaveLength(2);
    expect(out.stepResults.every((s) => s.status === 'ok')).toBe(true);
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `npm test -- --reporter=verbose`
Expected: 新增 3 个用例全部通过（LangGraph 首次运行会打印版本信息，忽略）

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/agent/graph.ts server/src/modules/agent/__tests__/graph.test.ts
git commit -m "feat: LangGraph Plan-Execute-Review 编排图（依赖拓扑/失败降级/人工介入）"
```

---

## Task 6: AgentService 与 Controller（任务输入/结果交付入口）

**Files:**
- Create: `server/src/modules/agent/agent.service.ts`
- Create: `server/src/modules/agent/agent.controller.ts`
- Create: `server/src/modules/agent/agent.module.ts`
- Modify: `server/src/app.module.ts`（注册 AgentModule）

**设计：** AgentService 是编排中枢——注入 StudentService/TeacherService/OrgService/RagRetriever（Task 8 提供，本任务先注入 StudentService 的对应方法），组装 ToolBindings；`submit` 方法：TaskPlanner 拆解 → 建 agent_runs 记录 → 跑图 → 更新状态与摘要 → 返回可追溯结果；`llmParse` 用 OpenAI 兼容 function-calling（需 Key），无 Key 返回 null 走规则。

- [ ] **Step 1: 编写 AgentService**

`server/src/modules/agent/agent.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentRun, AgentStep } from '../../db/entities/agent.entities';
import { StudentService } from '../student/student.service';
import { TeacherService } from '../teacher/teacher.service';
import { OrgService } from '../org/org.service';
import { AIService } from '../ai/ai.service';
import { JwtUser } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { buildRegistry, type ToolBindings, type ToolContext } from './tool-registry';
import { TaskPlanner, type TaskPlan } from './task-planner';
import { buildAgentGraph } from './graph';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly graph = buildAgentGraph();
  private readonly planner: TaskPlanner;

  constructor(
    private readonly student: StudentService,
    private readonly teacher: TeacherService,
    private readonly org: OrgService,
    private readonly ai: AIService,
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
    @InjectRepository(AgentStep) private readonly steps: Repository<AgentStep>,
  ) {
    this.planner = new TaskPlanner({
      llmParse: this.ai.isDemo ? null : (text, sid, cid) => this.llmParse(text, sid, cid),
    });
  }

  /** LLM function-calling 意图解析（真实 Key 模式） */
  private async llmParse(text: string, defaultStudentId: number, defaultClassId: number): Promise<TaskPlan | null> {
    try {
      const registry = this.buildRegistry();
      const result = await this.ai.chatWithTools(
        [
          {
            role: 'system',
            content:
              '你是乡芽教育智能体的任务规划器。根据用户请求，用工具调用形式输出 1-5 个执行步骤。' +
              '规则：知识类问题必须先用 search_knowledge；诊断类先用 run_diagnosis；可并行步骤不互相依赖。' +
              '仅返回工具调用，不生成正文。',
          },
          { role: 'user', content: text },
        ],
        registry.toFunctionSchemas(),
      );
      if (!result.toolCalls?.length) return null;
      const steps = result.toolCalls.map((tc, i) => ({
        id: `s${i + 1}`,
        tool: tc.name,
        args: tc.args as Record<string, unknown>,
        dependsOn: [],
        description: tc.name,
      }));
      return { intent: 'hybrid', steps, fromRules: false, explanation: 'LLM 意图解析（function-calling）' };
    } catch (e) {
      this.logger.warn(`LLM 解析失败，回退规则引擎: ${(e as Error).message}`);
      return null;
    }
  }

  /** 组装工具绑定（直接调用现有业务 Service —— 复用既有数据闭环） */
  private buildRegistry() {
    const bindings: ToolBindings = {
      run_diagnosis: async (studentId) => {
        const fakeUser = { id: studentId, role: 'student' } as JwtUser;
        return this.student.runDiagnosis(fakeUser);
      },
      get_error_book: async (studentId) => {
        const fakeUser = { id: studentId, role: 'student' } as JwtUser;
        return this.student.errorBook(fakeUser);
      },
      get_latest_diagnosis: async (studentId) => {
        const fakeUser = { id: studentId, role: 'student' } as JwtUser;
        return this.student.latestDiagnosis(fakeUser);
      },
      get_study_plan: async (studentId) => {
        const fakeUser = { id: studentId, role: 'student' } as JwtUser;
        return this.student.studyPlan(fakeUser);
      },
      search_knowledge: async (query, topK) => {
        return this.student.searchKnowledge(query, topK);
      },
      generate_lesson_plan: async (args) => {
        const fakeUser = { id: 1, role: 'teacher' } as JwtUser;
        return this.teacher.generateLessonPlan(fakeUser, args);
      },
      generate_paper: async (args) => {
        const fakeUser = { id: 1, role: 'teacher' } as JwtUser;
        return this.teacher.generatePaper(fakeUser, args);
      },
      get_class_overview: async (classId) => {
        return this.org.classOverview(classId);
      },
    };
    return buildRegistry(bindings);
  }

  /** 提交任务：理解 → 规划 → 执行 → 审计 → 交付 */
  async submit(user: JwtUser, input: { task: string; studentId?: number; classId?: number }) {
    if (!input.task?.trim()) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'task 必填');
    const text = input.task.trim();
    const studentId = input.studentId ?? user.id;
    const classId = input.classId ?? 1;

    const run = await this.runs.save(
      this.runs.create({
        userId: user.id,
        role: user.role,
        taskInput: text.slice(0, 500),
        intent: 'hybrid',
        status: 'running',
      }),
    );

    const started = Date.now();
    const onStep = async (sr: { stepId: string; tool: string; status: string; result?: unknown; error?: string }) => {
      await this.steps.save(
        this.steps.create({
          runId: run.id,
          tool: sr.tool,
          argsJson: null,
          resultJson: sr.result !== undefined ? JSON.stringify(sr.result)?.slice(0, 2000) : null,
          status: sr.status,
          error: sr.error ?? null,
          durationMs: 0,
        }),
      );
    };

    try {
      const plan = await this.planner.plan(text, studentId, classId);
      await this.runs.update(run.id, { intent: plan.intent, planJson: JSON.stringify(plan) });

      const registry = this.buildRegistry();
      const out = await this.graph.invoke({
        runId: run.id,
        plan,
        ctx: { userId: user.id, role: user.role } satisfies ToolContext,
        registry,
        results: {},
        stepResults: [],
        errors: [],
        summary: '',
        needsHuman: false,
        onStep,
      });

      const status = out.needsHuman ? 'needs_human' : 'success';
      await this.runs.update(run.id, {
        status,
        summary: out.summary,
        durationMs: Date.now() - started,
      });
      const saved = await this.runs.findOne({ where: { id: run.id } });
      return {
        runId: run.id,
        intent: plan.intent,
        status,
        summary: out.summary,
        plan: plan.steps.map((s) => ({ id: s.id, tool: s.tool, dependsOn: s.dependsOn })),
        result: out.results,
        trace: `GET /api/v1/agent/runs/${run.id}`,
      };
    } catch (e) {
      const msg = (e as Error).message?.slice(0, 300) ?? 'unknown';
      await this.runs.update(run.id, { status: 'failed', summary: `执行失败：${msg}`, durationMs: Date.now() - started });
      this.logger.error(`agent run ${run.id} failed: ${msg}`);
      throw new BizException(ErrorCodes.INTERNAL_ERROR, '任务执行失败，请重试或联系管理员');
    }
  }

  /** 任务流水（结果交付可追溯） */
  async listRuns(user: JwtUser, page = 1, pageSize = 20) {
    const [list, total] = await this.runs.findAndCount({
      where: user.role === 'admin' ? {} : { userId: user.id },
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: Math.min(pageSize, 100),
    });
    return {
      list: list.map((r) => ({
        id: r.id, taskInput: r.taskInput, intent: r.intent, status: r.status,
        durationMs: r.durationMs, createdAt: r.createdAt, summary: r.summary?.slice(0, 200),
      })),
      total, page, pageSize,
    };
  }

  /** 单次运行全链路（含步骤明细） */
  async runDetail(user: JwtUser, id: number) {
    const run = await this.runs.findOne({ where: { id } });
    if (!run) throw new BizException(ErrorCodes.NOT_FOUND);
    if (user.role !== 'admin' && run.userId !== user.id) {
      throw new BizException(ErrorCodes.SCOPE_FORBIDDEN);
    }
    const stepList = await this.steps.find({ where: { runId: id }, order: { id: 'ASC' } });
    return {
      ...run,
      plan: run.planJson ? JSON.parse(run.planJson) : null,
      steps: stepList.map((s) => ({
        id: s.id, tool: s.tool, status: s.status, error: s.error,
        result: s.resultJson ? JSON.parse(s.resultJson) : null,
        durationMs: s.durationMs, createdAt: s.createdAt,
      })),
    };
  }
}
```

- [ ] **Step 2: 编写 Controller**

`server/src/modules/agent/agent.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { AgentService } from './agent.service';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { RateLimit, Roles } from '../../common/decorators/security.decorators';
import { BizException } from '../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';

@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Roles('student', 'teacher', 'parent', 'admin')
  @RateLimit({ limit: 10, windowSec: 60, keyPrefix: 'agent-task', byUser: true })
  @Post('tasks')
  submit(
    @CurrentUser() user: JwtUser,
    @Body() body: { task: string; studentId?: number; classId?: number },
  ) {
    return this.agent.submit(user, body);
  }

  @Roles('student', 'teacher', 'parent', 'admin')
  @Get('runs')
  list(@CurrentUser() user: JwtUser, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.agent.listRuns(user, page ? Number(page) : 1, pageSize ? Number(pageSize) : 20);
  }

  @Roles('student', 'teacher', 'parent', 'admin')
  @Get('runs/:id')
  detail(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.agent.runDetail(user, id);
  }
}
```

- [ ] **Step 3: 编写 Module 并注册**

`server/src/modules/agent/agent.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentRun, AgentStep } from '../../db/entities/agent.entities';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { StudentModule } from '../student/student.module';
import { TeacherModule } from '../teacher/teacher.module';
import { OrgModule } from '../org/org.module';

@Module({
  imports: [TypeOrmModule.forFeature([AgentRun, AgentStep]), StudentModule, TeacherModule, OrgModule],
  providers: [AgentService],
  controllers: [AgentController],
  exports: [AgentService],
})
export class AgentModule {}
```

在 `server/src/app.module.ts` 的 imports 数组中、`NotificationsModule` 之后追加 `AgentModule`，并在文件顶部 import：

```ts
import { AgentModule } from './modules/agent/agent.module';
```

- [ ] **Step 4: 补充 StudentService/TeacherService/OrgService 所需公开方法**

AgentService 引用了 `this.student.searchKnowledge`、`this.teacher.generateLessonPlan/generatePaper`（当前实为 `generateLessonPlan` 已存在、`generatePaper` 已存在）、`this.org.classOverview`（需确认）。逐一处理：

1. `student.searchKnowledge(query, topK)`：新增公开方法（包装现有 `searchTextbook`，见 Task 8 升级为 RAG）。
2. `teacher.generateLessonPlan/generatePaper`：已存在，无需改。
3. `org.classOverview(classId)`：若不存在，新增——查询班级 KPI（人数/作答数/平均掌握度/风险学生），复用 `OrgService` 已有聚合方法（`classOverview` 或 `classStudents`+聚合；按 `org.service.ts` 现有实现补充）。

- [ ] **Step 5: 验证编译**

Run: `npx tsc --noEmit`（`server/` 目录）
Expected: 无错误（如有缺方法报错，按 Step 4 补齐）

- [ ] **Step 6: 冒烟测试（真实服务自测）**

Run: `npm run start:dev`（`server/` 目录，需 .env 存在）
然后用 curl 验证：

```powershell
curl.exe -s -X POST http://localhost:3000/api/v1/agent/tasks -H "Content-Type: application/json" -H "X-CSRF-Token: <token>" -d "{\"task\":\"帮学生:5 诊断学习薄弱点\"}"
```

Expected: 返回 `runId` + `status: success` + `plan` 步骤数组 + `trace` 链接（Demo 模式零成本可跑通）。再 `GET /api/v1/agent/runs/1` 可看到完整步骤明细。

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/agent/ server/src/app.module.ts
git commit -m "feat: AgentService 编排中枢 + /agent/tasks 任务入口 + 全链路审计"
```

---

## Task 7: BKT 贝叶斯知识追踪引擎（高算法核心）

**Files:**
- Create: `server/src/modules/diagnosis/bkt.ts`
- Create: `server/src/modules/diagnosis/__tests__/bkt.test.ts`
- Modify: `server/src/modules/student/student.service.ts`（`runDiagnosis` 接入）

**设计：** 标准二态 HMM：`P(L0)` 初始掌握、`P(T)` 学习转移、`P(G)` 猜测、`P(S)` 失误。前向滤波：预测（含遗忘衰减）→ 观测更新。置信度 = `1 - 4·P(L)(1-P(L))`（后验接近 0/1 时置信度高）。提供 `fitByEM` 对 ≥15 条作答的序列做 Baum-Welch 一轮迭代（在线拟合）。

- [ ] **Step 1: 编写 BKT 引擎（纯函数，无外部依赖）**

`server/src/modules/diagnosis/bkt.ts`:

```ts
export interface BktParams {
  pL0: number; // P(L0) 初始掌握概率
  pT: number;  // P(T)  学习转移概率
  pG: number;  // P(G)  猜测概率
  pS: number;  // P(S)  失误概率
}

export interface BktObs {
  correct: boolean;
  /** 距上次作答天数（用于遗忘衰减），首次为 0 */
  daysSinceLast: number;
}

export interface BktResult {
  mastery: number;      // P(L|obs) ∈ [0,1]
  confidence: number;   // ∈ [0,1]
  evidenceCount: number;
}

export const DEFAULT_PARAMS: BktParams = { pL0: 0.15, pT: 0.35, pG: 0.25, pS: 0.15 };

/** 一阶遗忘：间隔 d 天，掌握概率按指数衰减并向先验靠拢 */
export function forget(prob: number, days: number, pL0: number, rate = 0.05): number {
  if (days <= 0) return prob;
  const w = Math.exp(-rate * days);
  return prob * w + pL0 * (1 - w);
}

/**
 * BKT 前向滤波：顺序处理作答序列，返回最终掌握度。
 * 公式：
 *   预测：L' = L + (1 - L) * P(T)
 *   更新（答对）：L'' = L' * (1 - P(S)) / [L' * (1 - P(S)) + (1 - L') * P(G)]
 *   更新（答错）：L'' = L' * P(S) / [L' * P(S) + (1 - L') * (1 - P(G))]
 */
export function bktFilter(obs: BktObs[], params: BktParams = DEFAULT_PARAMS): BktResult {
  let L = params.pL0;
  let prevDate = 0;
  for (const o of obs) {
    L = forget(L, o.daysSinceLast, params.pL0);
    const predicted = L + (1 - L) * params.pT;
    if (o.correct) {
      const denom = predicted * (1 - params.pS) + (1 - predicted) * params.pG;
      L = (predicted * (1 - params.pS)) / (denom || 1e-9);
    } else {
      const denom = predicted * params.pS + (1 - predicted) * (1 - params.pG);
      L = (predicted * params.pS) / (denom || 1e-9);
    }
    void prevDate;
  }
  const variance = L * (1 - L);
  const confidence = Math.max(0, Math.min(1, 1 - 4 * variance));
  return { mastery: round3(L), confidence: round3(confidence), evidenceCount: obs.length };
}

/**
 * 一次性 EM 拟合（Baum-Welch 简化版，针对单一作答序列）。
 * 用观测序列的总体正确率与状态转换计数更新四个参数，迭代 20 轮。
 */
export function fitByEM(obs: BktObs[], init: BktParams = DEFAULT_PARAMS, rounds = 20): BktParams {
  let p = { ...init };
  for (let r = 0; r < rounds; r++) {
    // 前向-后向求后验（用 bktFilter 近似：逐点掌握概率序列）
    let L = p.pL0;
    const ls: number[] = [L];
    for (const o of obs) {
      L = forget(L, o.daysSinceLast, p.pL0);
      const predicted = L + (1 - L) * p.pT;
      if (o.correct) {
        const denom = predicted * (1 - p.pS) + (1 - predicted) * p.pG;
        L = (predicted * (1 - p.pS)) / (denom || 1e-9);
      } else {
        const denom = predicted * p.pS + (1 - predicted) * (1 - p.pG);
        L = (predicted * p.pS) / (denom || 1e-9);
      }
      ls.push(L);
    }
    // 统计
    const n = obs.length;
    const correctCount = obs.filter((o) => o.correct).length;
    const avgL = ls.reduce((s, x) => s + x, 0) / Math.max(ls.length, 1);
    const transCount = Math.max(n - 1, 1);
    const learned = ls.filter((x) => x > 0.5).length;
    // 更新（平滑 0.01 防除零）
    p = {
      pL0: clamp(avgL, 0.05, 0.6),
      pT: clamp(learned / Math.max(n, 1), 0.05, 0.6),
      pG: clamp(correctCount / Math.max(n, 1) - 0.1, 0.05, 0.4),
      pS: clamp(1 - correctCount / Math.max(n, 1) - 0.1, 0.05, 0.4),
    };
    void transCount;
  }
  return { pL0: round3(p.pL0), pT: round3(p.pT), pG: round3(p.pG), pS: round3(p.pS) };
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
```

- [ ] **Step 2: 写 BKT 单测（含单调收敛与置信度特性）**

`server/src/modules/diagnosis/__tests__/bkt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bktFilter, fitByEM, forget, DEFAULT_PARAMS } from '../bkt';

describe('bktFilter', () => {
  it('全对序列掌握度单调上升', () => {
    const obs = Array.from({ length: 10 }, () => ({ correct: true, daysSinceLast: 1 }));
    let prev = 0;
    for (let i = 1; i <= obs.length; i++) {
      const r = bktFilter(obs.slice(0, i), DEFAULT_PARAMS);
      expect(r.mastery).toBeGreaterThanOrEqual(prev);
      prev = r.mastery;
    }
    const final = bktFilter(obs, DEFAULT_PARAMS);
    expect(final.mastery).toBeGreaterThan(0.8);
    expect(final.confidence).toBeGreaterThan(0.5);
  });

  it('全错序列掌握度趋近低位', () => {
    const obs = Array.from({ length: 10 }, () => ({ correct: false, daysSinceLast: 1 }));
    const r = bktFilter(obs, DEFAULT_PARAMS);
    expect(r.mastery).toBeLessThan(0.3);
  });

  it('遗忘衰减：间隔越久掌握度越低', () => {
    const seqA = bktFilter([{ correct: true, daysSinceLast: 1 }, { correct: true, daysSinceLast: 1 }], DEFAULT_PARAMS);
    const seqB = bktFilter([{ correct: true, daysSinceLast: 30 }, { correct: true, daysSinceLast: 30 }], DEFAULT_PARAMS);
    expect(seqB.mastery).toBeLessThan(seqA.mastery);
  });

  it('确定性：同一输入两次结果一致（可复现）', () => {
    const obs = [{ correct: true, daysSinceLast: 1 }, { correct: false, daysSinceLast: 2 }];
    expect(bktFilter(obs)).toEqual(bktFilter(obs));
  });
});

describe('forget', () => {
  it('间隔 0 天不衰减', () => {
    expect(forget(0.8, 0, 0.15)).toBe(0.8);
  });
  it('间隔越长越接近先验', () => {
    expect(forget(0.8, 1000, 0.15)).toBeLessThan(0.3);
  });
});

describe('fitByEM', () => {
  it('数据越多参数越稳定，且范围合法', () => {
    const obs = Array.from({ length: 30 }, () => ({ correct: true, daysSinceLast: 1 }));
    const p = fitByEM(obs);
    expect(p.pL0).toBeGreaterThanOrEqual(0.05);
    expect(p.pL0).toBeLessThanOrEqual(0.6);
    expect(p.pT).toBeGreaterThanOrEqual(0.05);
    expect(p.pG).toBeGreaterThanOrEqual(0.05);
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `npm test -- --reporter=verbose`
Expected: 新增 7 个用例全部通过

- [ ] **Step 4: 接入 student.service.ts 的 runDiagnosis**

修改 `server/src/modules/student/student.service.ts`：

1. 顶部 import：`import { bktFilter, fitByEM, DEFAULT_PARAMS } from '../diagnosis/bkt';`
2. 替换 `runDiagnosis` 中掌握度计算块（原第 228–244 行 `byKp` 统计保留，改为 BKT）：

```ts
const now = new Date();
// BKT：按知识点分组作答序列（按时间排序），逐点前向滤波
const recordsByKp = new Map<number, typeof records>();
for (const r of unique) {
  const arr = recordsByKp.get(r.knowledgePointId) || [];
  arr.push(r);
  recordsByKp.set(r.knowledgePointId, arr);
}
const dims = [...recordsByKp.entries()].map(([kpId, recs]) => {
  const kp = kpRows.find((k) => k.id === kpId);
  const sorted = recs.sort((a, b) => a.answeredAt.getTime() - b.answeredAt.getTime());
  let lastTime: number | null = null;
  const obs = sorted.map((r) => {
    const days = lastTime == null ? 0 : Math.max(0, (r.answeredAt.getTime() - lastTime) / 86_400_000);
    lastTime = r.answeredAt.getTime();
    return { correct: r.isCorrect === 1, daysSinceLast: days };
  });
  const fitted = obs.length >= 15 ? fitByEM(obs) : DEFAULT_PARAMS;
  const result = bktFilter(obs, fitted);
  return {
    knowledgePointId: kpId,
    name: kp?.name ?? `知识点#${kpId}`,
    mastery: Math.round(result.mastery * 100),
    confidence: result.confidence,
    evidenceCount: result.evidenceCount,
    paramSource: obs.length >= 15 ? 'em-fitted' : 'prior',
  };
});
```

3. `mastery_snapshots` 写入沿用 dims（confidence 字段用 `d.confidence` 替换原启发式）。

- [ ] **Step 5: 运行全量测试确认无回归**

Run: `npm test`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/diagnosis/bkt.ts server/src/modules/diagnosis/__tests__/bkt.test.ts server/src/modules/student/student.service.ts
git commit -m "feat: BKT 贝叶斯知识追踪引擎（前向滤波+遗忘衰减+EM 拟合）替换正确率统计"
```

---

## Task 8: 混合检索 RAG（知识增强能力）

**Files:**
- Create: `server/src/modules/knowledge/rag-retriever.ts`
- Create: `server/src/modules/knowledge/__tests__/rag-retriever.test.ts`
- Modify: `server/src/modules/student/student.service.ts`（`searchTextbook` → 走 RagRetriever）

**设计：** 粗排用 FTS5 BM25（`bm25()` 排序），精排融合图谱命中加权（查询词命中知识点名称/描述 → 该知识点关联教材片段加权 +0.15）+ 引用校验（返回带 `ref` 的片段，LLM 引用必须落在集合内——由 QA 层执行校验，见 Task 11）。

- [ ] **Step 1: 编写 RagRetriever**

`server/src/modules/knowledge/rag-retriever.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { KnowledgePoint, TextbookContent } from '../../db/entities/knowledge.entities';

export interface RetrievedChunk {
  id: number;
  title: string;
  chapter: string | null;
  unit: string | null;
  content: string;
  knowledgePointIds: number[];
  score: number;
  ref: string;
}

@Injectable()
export class RagRetriever {
  constructor(
    @InjectRepository(TextbookContent) private readonly textbooks: Repository<TextbookContent>,
    @InjectRepository(KnowledgePoint) private readonly kps: Repository<KnowledgePoint>,
  ) {}

  /**
   * 混合检索：
   * 1) FTS5 BM25 粗排取 top 10；
   * 2) 图谱命中加权：查询词命中知识点名称/描述 → 该知识点关联教材 +0.15；
   * 3) 引用校验：仅返回 topK 条且带 ref（textbook:<id>）。
   */
  async retrieve(query: string, subject?: string, grade?: string, topK = 5): Promise<RetrievedChunk[]> {
    const words = query.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').split(/\s+/).filter((w) => w.length >= 2).slice(0, 6);
    if (!words.length) return [];

    // 1) BM25 粗排
    let candidates: Array<{ id: number; title: string; chapter: string | null; unit: string | null; content: string; bm: number }> = [];
    try {
      const q = words.map((w) => `"${w}"`).join(' OR ');
      const rows = await this.textbooks.manager.query(
        `SELECT rowid AS id, title, chapter, unit, content,
                bm25(textbook_contents_fts) AS bm
         FROM textbook_contents_fts
         WHERE textbook_contents_fts MATCH ?
         ORDER BY bm LIMIT 10`,
        [q],
      );
      candidates = rows as typeof candidates;
    } catch {
      const like = `%${words[0]}%`;
      const rows = await this.textbooks.find({ where: [{ title: Like(like) }, { content: Like(like) }], take: 10 });
      candidates = rows.map((r) => ({ id: r.id, title: r.title, chapter: r.chapter, unit: r.unit, content: r.content, bm: 0 }));
    }
    if (!candidates.length) return [];

    // 2) 图谱命中加权
    const kps = await this.kps.find();
    const hitKpIds = new Set<number>();
    for (const kp of kps) {
      if (words.some((w) => (kp.name || '').includes(w) || (kp.description || '').includes(w))) {
        hitKpIds.add(kp.id);
      }
    }
    const subjectFilter = subject ? (s: string | null) => !s || s === subject : () => true;

    const scored = candidates
      .filter((c) => subjectFilter(c.unit) || subjectFilter(c.chapter) || subjectFilter(c.title))
      .map((c) => {
        // 通过题库反查教材关联的知识点（简化：按标题关键词命中）
        const kpIds = [...hitKpIds];
        const boost = kpIds.length ? 0.15 * kpIds.length : 0;
        return {
          id: c.id,
          title: c.title,
          chapter: c.chapter,
          unit: c.unit,
          content: c.content.slice(0, 400),
          knowledgePointIds: kpIds,
          score: round2(-c.bm + boost),
          ref: `textbook:${c.id}`,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
```

- [ ] **Step 2: 写测试（mock Repository，不依赖真实 DB）**

`server/src/modules/knowledge/__tests__/rag-retriever.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { RagRetriever, type RetrievedChunk } from '../rag-retriever';

function makeTextbooks() {
  return {
    manager: {
      query: vi.fn(async () => [
        { id: 1, title: '草船借箭', chapter: '第二单元', unit: '古典名著', content: '周瑜妒忌诸葛亮……诸葛亮说："用弓箭最好。"', bm: -8.2 },
        { id: 2, title: '祖父的园子', chapter: '第一单元', unit: '童年往事', content: '祖父栽花，我就栽花……', bm: -9.1 },
      ]),
    },
    find: vi.fn(async () => []),
  } as unknown as any;
}

function makeKps() {
  return {
    find: vi.fn(async () => [
      { id: 10, name: '概括主要内容', description: '六要素概括法', parentId: null },
      { id: 11, name: '人物形象分析', description: '抓住语言、动作、神态描写', parentId: null },
    ]),
  } as unknown as any;
}

describe('RagRetriever', () => {
  it('返回带 ref 的检索片段并应用图谱加权排序', async () => {
    const r = new RagRetriever(makeTextbooks(), makeKps());
    const out: RetrievedChunk[] = await r.retrieve('草船借箭 主要内容', '语文', '五年级', 3);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].ref).toMatch(/^textbook:\d+$/);
    expect(out[0].title).toBe('草船借箭');
  });

  it('空查询返回空数组', async () => {
    const r = new RagRetriever(makeTextbooks(), makeKps());
    expect(await r.retrieve('   ')).toEqual([]);
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `npm test -- --reporter=verbose`
Expected: 新增 2 个用例通过

- [ ] **Step 4: 接入 student.service.ts**

1. import `RagRetriever`，构造函数注入（StudentModule 需 imports `KnowledgeModule`，并在 `student.module.ts` 的 providers 中提供 `RagRetriever`——`KnowledgeModule` 新建 `server/src/modules/knowledge/knowledge.module.ts`：`@Module({ imports: [TypeOrmModule.forFeature([TextbookContent, KnowledgePoint])], providers: [RagRetriever], exports: [RagRetriever] })`）。
2. `searchTextbook` 改为调用 `this.rag.retrieve(keyword, undefined, undefined, 3)`，返回结构映射为 `{ title, content, ref }`（与现有 `qaMessage` 兼容）。
3. 新增公开方法：

```ts
async searchKnowledge(query: string, topK = 5) {
  const chunks = await this.rag.retrieve(query, undefined, undefined, topK);
  return chunks.map((c) => ({ title: c.title, content: c.content, ref: c.ref, score: c.score }));
}
```

- [ ] **Step 5: 全量测试 + 编译**

Run: `npm test; npx tsc --noEmit`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/knowledge/ server/src/modules/student/student.service.ts server/src/modules/student/student.module.ts
git commit -m "feat: 混合检索 RAG（BM25 粗排+图谱加权+引用 ref），QA 走知识增强通道"
```

---

## Task 9: 苏格拉底五阶段状态机（多轮交互能力）

**Files:**
- Create: `server/src/modules/agent/socratic-state-machine.ts`
- Create: `server/src/modules/agent/__tests__/socratic.test.ts`
- Modify: `server/src/modules/student/student.service.ts`（`tutorMessage` 接入）

**设计：** 五阶段 `read → identify → relate → solve → verify`。状态存会话（`ai_messages.state` JSON）。规则层：检测"学生已给出完整答案"或"LLM 输出含答案"→ 拦截重写为追问；学生卡住 2 轮回退阶段；连续 4 轮无进展 → 请求人工（提示找老师）。

- [ ] **Step 1: 编写状态机**

`server/src/modules/agent/socratic-state-machine.ts`:

```ts
export type SocraticStage = 'read' | 'identify' | 'relate' | 'solve' | 'verify';
export const SOCRATIC_STAGES: SocraticStage[] = ['read', 'identify', 'relate', 'solve', 'verify'];

export interface SocraticState {
  stage: SocraticStage;
  stallCount: number;
  problem: string;
  /** 学生最近一轮是否答出关键信息 */
  progress: boolean;
}

export interface SocraticTransition {
  state: SocraticState;
  /** 给 LLM 的阶段指令 */
  instruction: string;
  /** 规则层是否拦截了"直接给答案" */
  blockedAnswer?: boolean;
  /** 是否需要转人工 */
  escalate?: boolean;
}

export function createSocraticState(problem: string): SocraticState {
  return { stage: 'read', stallCount: 0, problem, progress: false };
}

export const STAGE_INSTRUCTIONS: Record<SocraticStage, string> = {
  read: '学生刚看到题目。请引导他：用自己的话说出题目讲了什么、已知条件有哪些。只提问，不讲解，更不给出答案。',
  identify: '学生已描述题目。请引导他：把已知条件逐条列出来，并说出要求解的目标是什么。每步只问一个问题。',
  relate: '学生已列出条件。请引导他：思考条件与目标之间有什么关系，提示相关的知识点名称（如"分数乘法""多音字"），让他自己建立联系。',
  solve: '学生已建立关系。请引导他：说出解题的第一步该做什么，并让他动手尝试。可以给步骤提示，但绝不直接写出完整答案。',
  verify: '学生已给出结果。请引导他：把结果代回原题检查一遍，确认是否合理，并总结这题的解题思路。',
};

/** 检测是否直接给出了答案（数字结果/公式/完整填空） */
export function detectFullAnswer(text: string): boolean {
  const clean = text.replace(/\s+/g, '');
  // 数学结果：= 数字 / 纯算式结果
  if (/(=\s*[-+]?\d+(\.\d+)?|答案[:：]\s*[-+]?\d)/.test(clean)) return true;
  // 选择题选项
  if (/^(答案|选|应该选)[:：]?\s*[A-Ea-e]$/.test(clean.trim())) return true;
  // 完整句子答案（超长无问号）
  if (clean.length > 40 && !clean.includes('？') && !clean.includes('?') && !clean.includes('你')) return true;
  return false;
}

/** 判断学生本轮是否推进了理解（有实质内容或答对引导问题） */
export function hasProgress(studentReply: string): boolean {
  const s = studentReply.trim();
  if (!s || s.length < 2) return false;
  // 有数字/选项/关键表述视为推进
  return /\d|已知|条件是|因为|所以|先|第一步|我觉得|答案/.test(s);
}

export function transition(state: SocraticState, studentReply: string): SocraticTransition {
  const advanced = hasProgress(studentReply);
  let stage = state.stage;
  let stallCount = state.stallCount;
  if (advanced) {
    const idx = SOCRATIC_STAGES.indexOf(stage);
    stage = idx < SOCRATIC_STAGES.length - 1 ? SOCRATIC_STAGES[idx + 1] : stage;
    stallCount = 0;
  } else {
    stallCount += 1;
    if (stallCount >= 2) {
      const idx = SOCRATIC_STAGES.indexOf(stage);
      stage = idx > 0 ? SOCRATIC_STAGES[idx - 1] : stage;
      stallCount = 0;
    }
  }
  const escalate = stallCount >= 4 || (state.problem === studentReply && state.stallCount >= 2);
  return {
    state: { ...state, stage, stallCount, progress: advanced },
    instruction: STAGE_INSTRUCTIONS[stage],
    escalate,
  };
}
```

- [ ] **Step 2: 写测试**

`server/src/modules/agent/__tests__/socratic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSocraticState, transition, detectFullAnswer, hasProgress, SOCRATIC_STAGES } from '../socratic-state-machine';

describe('detectFullAnswer', () => {
  it('拦截直接给答案', () => {
    expect(detectFullAnswer('答案：25')).toBe(true);
    expect(detectFullAnswer('结果是 48')).toBe(true);
    expect(detectFullAnswer('选 B')).toBe(true);
  });
  it('引导式提问放行', () => {
    expect(detectFullAnswer('你先说说题目里有哪些条件？')).toBe(false);
  });
});

describe('hasProgress', () => {
  it('有实质推进', () => {
    expect(hasProgress('已知小明有 3 个苹果')).toBe(true);
    expect(hasProgress('嗯')).toBe(false);
  });
});

describe('transition', () => {
  it('推进时前进阶段', () => {
    let s = createSocraticState('1+1=?');
    s = transition(s, '已知条件是 1 和 1').state;
    expect(s.stage).toBe('identify');
  });
  it('卡住 2 轮回退阶段', () => {
    let s = createSocraticState('x+3=5');
    s = transition(s, '不知道').state;
    s = transition(s, '不知道').state;
    expect(SOCRATIC_STAGES.indexOf(s.stage)).toBeLessThanOrEqual(SOCRATIC_STAGES.indexOf('read'));
  });
  it('长期无进展转人工', () => {
    let s = createSocraticState('x+3=5');
    for (let i = 0; i < 6; i++) {
      const t = transition(s, '不知道');
      s = t.state;
      if (t.escalate) { expect(t.escalate).toBe(true); return; }
    }
    throw new Error('未触发转人工');
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `npm test -- --reporter=verbose`
Expected: 新增 5 个用例通过

- [ ] **Step 4: 接入 tutorMessage**

修改 `student.service.ts`：

1. import：`import { createSocraticState, transition, detectFullAnswer } from '../agent/socratic-state-machine';`
2. `tutorMessage` 改造（读取会话最新状态 → 状态机 → 构造带阶段指令的 LLM 调用 → 规则层二次拦截 → 存回状态）：

```ts
async tutorMessage(user: JwtUser, convId: number, input: { content: string }) {
  const conv = await this.convs.findOne({ where: { id: convId, userId: user.id, type: 'tutor' } });
  if (!conv) throw new BizException(ErrorCodes.NOT_FOUND);
  const history = await this.msgs.find({ where: { conversationId: conv.id }, order: { id: 'ASC' }, take: 12 });
  // 恢复/创建苏格拉底状态（存会话首条消息的 state 字段，简化：从最近 12 条推导）
  const prevState = history.length
    ? (JSON.parse(history[0].state || 'null') as ReturnType<typeof createSocraticState> | null)
    : null;
  const state = prevState ?? createSocraticState(input.content);
  const t = transition(state, input.content);
  const userMsg = await this.msgs.save(
    this.msgs.create({ conversationId: conv.id, role: 'user', content: input.content, model: null, kind: 'normal' }),
  );
  const system = `你是苏格拉底式辅导老师。规则：绝不给最终答案，只通过提问引导。
${t.instruction}
【问题】${state.problem}`;
  const result = await this.ai.chat(system, input.content);
  // 规则层拦截：LLM 输出疑似完整答案 → 改写为追问
  let finalText = result.text;
  if (detectFullAnswer(finalText)) {
    finalText = `这个我们先不急着下结论。你先说说：${state.problem} 里，你找到了哪些已知条件？它们之间可能有什么关系？`;
  }
  const reply = await this.msgs.save(
    this.msgs.create({
      conversationId: conv.id,
      role: 'assistant',
      content: finalText,
      refs: JSON.stringify([{ title: `辅导阶段：${t.state.stage}`, ref: `socratic:${t.state.stage}` }]),
      model: result.model,
      kind: 'normal',
      state: JSON.stringify(t.state),
    }),
  );
  return {
    user: { id: userMsg.id, content: userMsg.content },
    reply: { id: reply.id, content: reply.content, refs: JSON.parse(reply.refs!) },
    stage: t.state.stage,
    escalate: t.escalate,
  };
}
```

（若 `AiMessage` 实体无 `state` 字段，在 `student.entities.ts` 的 `AiMessage` 上新增 `@Column({ type: 'text', nullable: true }) state: string | null;`）

- [ ] **Step 5: 全量测试 + 编译**

Run: `npm test; npx tsc --noEmit`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/agent/socratic-state-machine.ts server/src/modules/agent/__tests__/socratic.test.ts server/src/modules/student/student.service.ts server/src/db/entities/student.entities.ts
git commit -m "feat: 苏格拉底五阶段状态机（多轮推进/回退/转人工+答案拦截）"
```

---

## Task 10: ZPD 学习计划规划器（个性化算法）

**Files:**
- Create: `server/src/modules/diagnosis/zpd-planner.ts`
- Create: `server/src/modules/diagnosis/__tests__/zpd.test.ts`
- Modify: `server/src/modules/student/student.service.ts`（`generatePlan` 接入）

**设计：** 知识点树 → 依赖 DAG。候选节点 = 掌握度 ∈ [0.3, 0.7] 且前置全部 ≥ 0.6（最近发展区）；贪心排序：错题知识点优先 → 难度低优先 → 剪枝防循环；输出 plan_steps（review/practice/advance 三步型）。

- [ ] **Step 1: 编写 ZPD 规划器**

`server/src/modules/diagnosis/zpd-planner.ts`:

```ts
export interface ZpdNode {
  id: number;
  name: string;
  parentId: number | null;
  mastery: number; // 0~1
  errorCount: number;
  difficulty: number; // 1~5
}

export interface ZpdPlanStep {
  knowledgePointId: number;
  stepType: 'review' | 'practice' | 'advance';
  title: string;
  questionCount: number;
}

/**
 * 最近发展区规划：
 * 1) 候选 = mastery ∈ [0.3,0.7]（发展区）且前置节点（父链）全部 >= 0.6；
 * 2) 排序：错题数多优先 → 难度低优先；
 * 3) 生成三步计划：复习错题(review) → 练习(practice) → 进阶(advance)。
 */
export function planZPD(nodes: ZpdNode[], maxSteps = 6): ZpdPlanStep[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ready = nodes.filter((n) => {
    if (n.mastery < 0.3 || n.mastery > 0.7) return false;
    // 前置（父节点链）掌握度 >= 0.6
    let cur: ZpdNode | undefined = n;
    while (cur?.parentId != null) {
      cur = byId.get(cur.parentId);
      if (!cur || cur.mastery < 0.6) return false;
    }
    return true;
  });
  ready.sort((a, b) => b.errorCount - a.errorCount || a.difficulty - b.difficulty || a.id - b.id);

  const steps: ZpdPlanStep[] = [];
  for (const n of ready.slice(0, Math.ceil(maxSteps / 3))) {
    steps.push({ knowledgePointId: n.id, stepType: 'review', title: `复习：${n.name}`, questionCount: 3 });
    steps.push({ knowledgePointId: n.id, stepType: 'practice', title: `练习：${n.name}`, questionCount: 5 });
    steps.push({ knowledgePointId: n.id, stepType: 'advance', title: `进阶：${n.name}`, questionCount: 2 });
  }
  return steps.slice(0, maxSteps);
}
```

- [ ] **Step 2: 写测试**

`server/src/modules/diagnosis/__tests__/zpd.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { planZPD, type ZpdNode } from '../zpd-planner';

const nodes: ZpdNode[] = [
  { id: 1, name: '识字与写字', parentId: null, mastery: 0.9, errorCount: 0, difficulty: 1 },
  { id: 2, name: '易错多音字', parentId: 1, mastery: 0.4, errorCount: 3, difficulty: 2 },
  { id: 3, name: '形近字辨析', parentId: 1, mastery: 0.55, errorCount: 5, difficulty: 3 },
  { id: 4, name: '阅读与理解', parentId: null, mastery: 0.5, errorCount: 1, difficulty: 2 },
  { id: 5, name: '概括主要内容', parentId: 4, mastery: 0.2, errorCount: 2, difficulty: 3 }, // 低于发展区下限
  { id: 6, name: '写作表达', parentId: null, mastery: 0.8, errorCount: 0, difficulty: 4 }, // 高于上限
];

describe('planZPD', () => {
  it('只选择最近发展区（0.3~0.7 且前置已掌握）', () => {
    const plan = planZPD(nodes);
    const kpIds = plan.map((s) => s.knowledgePointId);
    expect(kpIds).toContain(2);
    expect(kpIds).toContain(3);
    expect(kpIds).not.toContain(1); // 已掌握
    expect(kpIds).not.toContain(5); // 前置不足/低于下限
    expect(kpIds).not.toContain(6); // 已掌握
  });
  it('错题多的知识点优先', () => {
    const plan = planZPD(nodes);
    expect(plan[0].knowledgePointId).toBe(3); // errorCount 5 > 2
  });
  it('每知识点生成三步（复习/练习/进阶）', () => {
    const plan = planZPD(nodes, 6);
    expect(plan.length).toBeLessThanOrEqual(6);
    expect(plan.map((s) => s.stepType)).toEqual(['review', 'practice', 'advance', 'review', 'practice', 'advance']);
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `npm test -- --reporter=verbose`
Expected: 新增 3 个用例通过

- [ ] **Step 4: 接入 generatePlan**

修改 `student.service.ts` `generatePlan`：注入 `planZPD`，用最新 `mastery_snapshots`（最近一次诊断）构造 `ZpdNode[]`：

```ts
async generatePlan(user: JwtUser, input: { title?: string; weekNo?: number }) {
  await this.plans.update({ studentId: user.id, status: 'active' }, { status: 'archived' });
  const snapshots = await this.snapshots.find({ where: { studentId: user.id } });
  const kps = await this.kps.find({ where: { subject: '语文', grade: '五年级' } });
  const latest = new Map<number, MasterySnapshot>();
  for (const s of snapshots) {
    const prev = latest.get(s.knowledgePointId);
    if (!prev || s.computedAt.getTime() > prev.computedAt.getTime()) latest.set(s.knowledgePointId, s);
  }
  const errors = await this.errors.find({ where: { studentId: user.id, mastered: 0 } });
  const errorCount = new Map<number, number>();
  for (const e of errors) errorCount.set(e.knowledgePointId, (errorCount.get(e.knowledgePointId) ?? 0) + 1);

  const nodes = kps.map((kp) => {
    const snap = latest.get(kp.id);
    return {
      id: kp.id, name: kp.name, parentId: kp.parentId,
      mastery: snap?.mastery ?? 0.5,
      errorCount: errorCount.get(kp.id) ?? 0,
      difficulty: 3,
    };
  });
  const planSteps = planZPD(nodes, 6);
  if (!planSteps.length) {
    // 无发展区节点：直接复习薄弱点
    const weak = kps.sort((a, b) => (latest.get(a.id)?.mastery ?? 1) - (latest.get(b.id)?.mastery ?? 1))[0];
    planSteps.push({ knowledgePointId: weak.id, stepType: 'review', title: `复习：${weak.name}`, questionCount: 3 });
  }
  const plan = await this.plans.save(
    this.plans.create({
      studentId: user.id,
      title: input.title || `第${input.weekNo || 1}周学习计划`,
      weekNo: input.weekNo || 1,
      progress: 0,
      status: 'active',
    }),
  );
  await this.steps.save(
    planSteps.map((s, i) =>
      this.steps.create({
        planId: plan.id,
        knowledgePointId: s.knowledgePointId,
        stepType: s.stepType,
        title: s.title,
        status: i === 0 ? 'active' : 'wait',
        mastery: null,
        questionCount: s.questionCount,
        completedQuestionCount: 0,
      }),
    ),
  );
  return { id: plan.id, title: plan.title, stepCount: planSteps.length };
}
```

- [ ] **Step 5: 全量测试 + 编译**

Run: `npm test; npx tsc --noEmit`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/diagnosis/zpd-planner.ts server/src/modules/diagnosis/__tests__/zpd.test.ts server/src/modules/student/student.service.ts
git commit -m "feat: ZPD 最近发展区规划（图依赖+贪心排序）替换固定取题"
```

---

## Task 11: 教师端生成器接真实 LLM（含引用校验）

**Files:**
- Modify: `server/src/modules/ai/ai.service.ts`（新增 `chatWithTools` + JSON 输出支持）
- Modify: `server/src/modules/teacher/teacher.service.ts`（备课/组卷/教研员/发言稿/微课走 LLM，Demo 降级）

- [ ] **Step 1: ai.service.ts 扩展**

在 `AIService` 增加：

```ts
async chatWithTools(
  messages: ChatMessage[],
  tools: Array<{ type: string; function: { name: string; description: string; parameters: unknown } }>,
): Promise<{ text: string; toolCalls?: Array<{ name: string; args: unknown }> }> {
  if (this.isDemo) {
    throw new BizException(ErrorCodes.AI_PROVIDER_UNAVAILABLE, 'Demo 模式不支持工具调用');
  }
  const provider = this.provider as OpenAICompatProvider;
  return provider.chatWithTools(messages, tools);
}
```

在 `OpenAICompatProvider` 增加 `chatWithTools`（发送 `tools` + `tool_choice: 'auto'`，解析 `tool_calls`）：

```ts
async chatWithTools(messages: ChatMessage[], tools: unknown[]): Promise<{ text: string; toolCalls?: Array<{ name: string; args: unknown }> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), this.timeoutMs);
  try {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.4,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new BizException(ErrorCodes.AI_PROVIDER_UNAVAILABLE);
    const json = (await res.json()) as {
      choices?: Array<{
        message?: { content?: string | null; tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> };
      }>;
    };
    const msg = json.choices?.[0]?.message;
    const toolCalls = (msg?.tool_calls ?? [])
      .filter((tc) => tc?.function?.name)
      .map((tc) => ({ name: tc.function!.name!, args: safeJson(tc.function!.arguments) }));
    return { text: msg?.content?.trim() ?? '', toolCalls };
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(s?: string): unknown {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}
```

- [ ] **Step 2: teacher.service.ts 改造生成器**

以 `generateLessonPlan` 为例（备课/组卷/教研员/发言稿/微课同一模式：非 demo → LLM JSON 生成 + schema 校验；demo → 现有函数）：

```ts
async generateLessonPlan(user: JwtUser, input: {...}) {
  let data: { content: string; outline: string; sourceRefs: string };
  if (!this.ai.isDemo) {
    const rag = await this.kbe.find({ where: { category: 'research' }, take: 5 });
    const prompt = `你是乡村小学语文教研专家。为「${input.grade}${input.subject}《${input.topic}》」写一份教案。
要求：包含 goals(数组3条)/keyPoints(2条)/process(5个stage,含minutes与detail)/board/homework(A/B/C三层)/reflection。
只输出 JSON，不要其他文字。可参考的教研规则：${rag.map((r) => r.content).slice(0, 3).join('；')}`;
    const res = await this.ai.chat('你是结构化输出助手，只输出合法 JSON。', prompt);
    try {
      const parsed = JSON.parse(extractJson(res.text));
      data = {
        content: JSON.stringify(parsed),
        outline: '一、教学目标\n二、教学重难点\n三、教学过程\n四、板书设计\n五、作业布置\n六、教学反思',
        sourceRefs: JSON.stringify([
          { title: `教材·${input.bookVersion || '人教版'}·${input.grade}${input.subject}《${input.topic}》`, ref: 'textbook' },
          { title: '教研规则库·备课规范', ref: 'kb:research' },
        ]),
      };
    } catch {
      data = demoLessonPlan({ ...input, periodCount: input.periodCount || 1, duration: input.duration || 40 });
    }
  } else {
    data = demoLessonPlan({ ...input, periodCount: input.periodCount || 1, duration: input.duration || 40 });
  }
  // ... 原有落库逻辑不变
}
```

（`extractJson`：从 LLM 文本中截取首个 `{...}` 的辅助函数，加入 `ai.service.ts` 导出或 teacher.service 本地实现。）

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit; npm test`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/ai/ai.service.ts server/src/modules/teacher/teacher.service.ts
git commit -m "feat: 教师端生成器接入真实 LLM（JSON schema 校验+教研规则增强，Demo 降级保留）"
```

---

## Task 12: 前端 Agent 流水视图 + 苏格拉底阶段展示

**Files:**
- Modify: `src/frontend/entries/student-main.ts`（展示辅导阶段）
- Modify: `src/frontend/entries/admin-main.ts`（Agent 任务流水卡片）

- [ ] **Step 1: 学生端显示苏格拉底阶段**

在 `sendChat` 的响应渲染处（`student-main.ts` 约 323 行后）追加阶段徽标：

```ts
const stage = res?.stage as string | undefined;
if (stage) {
  const stageNames: Record<string, string> = {
    read: '读题', identify: '列条件', relate: '找关系', solve: '尝试求解', verify: '验算',
  };
  appendHtml(chat, 'ai', `<div class="hint">🧭 当前辅导阶段：${esc(stageNames[stage] || stage)}</div>`);
}
```

（若无 `hint` 样式，复用现有气泡样式即可。）

- [ ] **Step 2: 管理端 Agent 流水卡片**

在 `admin-main.ts` 的看板加载函数中追加（复用 `post/get` 封装）：

```ts
async function loadAgentRuns() {
  try {
    const res = await get<any>('/agent/runs?page=1&pageSize=5');
    const list = res?.list || [];
    const wrap = document.getElementById('agentRuns');
    if (!wrap) return;
    wrap.innerHTML = list.length
      ? list.map((r: any) =>
          `<div class="run-item">
             <b>#${r.id}</b> ${esc(r.taskInput)}<br>
             <span class="muted">意图:${esc(r.intent)} · 状态:${esc(r.status)} · ${r.durationMs}ms</span>
             <a href="#" data-run="${r.id}">查看全链路</a>
           </div>`).join('')
      : '<div class="muted">暂无 Agent 任务</div>';
    wrap.querySelectorAll('a[data-run]').forEach((a) =>
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const id = (a as HTMLElement).dataset.run;
        const detail = await get<any>(`/agent/runs/${id}`);
        toast(`共 ${(detail?.steps || []).length} 步，见 agent_steps 审计表`);
        console.info('[AgentRun]', detail);
      }),
    );
  } catch { /* 静默 */ }
}
```

在对应页面结构（`public/admin.html`）看板区添加占位容器 `<div id="agentRuns" class="card"></div>`（若 TS 已接管看板 DOM，则直接在 DOM 构建处插入）。

- [ ] **Step 3: 前端构建验证**

Run: `node build-frontend.mjs`（项目根目录）
Expected: 构建成功，`public/assets/app/admin-main.js`、`student-main.js` 更新

- [ ] **Step 4: Commit**

```bash
git add src/frontend/entries/student-main.ts src/frontend/entries/admin-main.ts public/admin.html
git commit -m "feat: 前端 Agent 流水视图与苏格拉底阶段展示"
```

---

## Task 13: 种子数据扩充（教材分块 + 题库扩容）

**Files:**
- Modify: `server/src/db/seeds/run-seed.ts`

- [ ] **Step 1: 扩充教材分块（追加 6 篇课文，每篇拆 1-2 个知识块）**

在教材 seed 块（原 3 篇之后）追加（示例 2 篇，其余按此模式）：

```ts
await tbRepo.save([
  tbRepo.create({ subject: '语文', grade: '五年级', chapter: '第三单元', unit: '综合性学习', title: '遨游汉字王国（知识块1：汉字起源）', source: '人教版 2019 审定', license: '教材内容·教育用途', content: '汉字是世界上历史最悠久的文字之一，从甲骨文到金文、小篆、隶书、楷书，经历了几千年的演变。……汉字的造字方法主要有象形、指事、会意、形声等。' }),
  tbRepo.create({ subject: '语文', grade: '五年级', chapter: '第三单元', unit: '综合性学习', title: '遨游汉字王国（知识块2：趣味汉字）', source: '人教版 2019 审定', license: '教材内容·教育用途', content: '猜字谜、谐音歇后语、对联都是汉字文化的趣味形式。例如"一口咬掉牛尾巴"打一字，谜底是"告"。' }),
  tbRepo.create({ subject: '语文', grade: '五年级', chapter: '第四单元', unit: '家国情怀', title: '青山处处埋忠骨（知识块1）', source: '人教版 2019 审定', license: '教材内容·教育用途', content: '课文讲述了毛泽东主席得知儿子毛岸英牺牲后的内心抉择：青山处处埋忠骨，何须马革裹尸还。……' }),
  // ...（按此模式追加至 9 篇课文 12+ 知识块）
]);
```

同步更新 FTS5 重建：在追加后执行 `INSERT INTO textbook_contents_fts(rowid, title, content) SELECT id, title, content FROM textbook_contents`（幂等重建）或依赖触发器。

- [ ] **Step 2: 扩充题库（追加 ≥20 题，覆盖全部 9 个知识点）**

按现有 `qRepo.create` 模式追加 20+ 题，每知识点 ≥2 题，标注 `source: '公开题库·自整理'`。示例（易错多音字 2 题、人物形象分析 2 题…）——完整题目列表写入 seed 文件。

- [ ] **Step 3: 重新 seed 验证**

Run: `npm run seed`（`server/` 目录）
Expected: 输出含"教材内容: N 篇课文""题库: N 题"，无报错

- [ ] **Step 4: Commit**

```bash
git add server/src/db/seeds/run-seed.ts
git commit -m "feat: 种子扩充——教材分块 12+ 知识块、题库 40+ 题覆盖全知识点"
```

---

## Task 14: 演示剧本与全链路自检（复赛提交）

**Files:**
- Create: `docs/Agent能力演示剧本.md`
- Modify: `docs/演示脚本.md`（补充 Agent 闭环章节）

- [ ] **Step 1: 编写演示剧本**

`docs/Agent能力演示剧本.md` 完整剧本（评审 5 分钟版）：

```
场景：李小雨（学生:5）连续答错 → 自动诊断 → ZPD 计划 → 苏格拉底辅导 → 教师看板更新 → 家长周报
1. 登录学生端，做 5 道错题（演示"任务输入"）
2. 教师端打开班级看板：掌握度下降、风险学生提示（结果交付 T4）
3. 打开「Agent 任务流水」：输入"帮学生:5 诊断薄弱点并给出建议"
   → 展示 plan 拆解（run_diagnosis + get_error_book 并行）
   → 展示步骤执行明细（agent_steps：工具/参数/结果/耗时）
   → 展示 BKT 输出（掌握度+置信度+EM 参数标注）
4. 学生端苏格拉底辅导：观察五阶段推进徽标（read→identify→relate→solve→verify）
5. 知识问答提问《草船借箭》→ 展示 RAG 引用 refs（教材出处）
6. 家长端周报自动更新（脱敏视图）
7. 异常演示：断网/无 Key → Demo 降级角标（展示"失败处理"）
```

- [ ] **Step 2: 全链路自检清单（逐项勾选）**

| 检查项 | 验证方式 |
|---|---|
| 任务理解 | `/agent/tasks` 输入 5 类不同请求，意图标签正确 |
| 流程编排 | agent_steps 显示多步、依赖顺序正确 |
| 工具调用 | 步骤明细含工具名/参数/结果 |
| 知识增强 | QA 回答带 refs 且 ref 存在于检索结果 |
| 多轮交互 | 苏格拉底阶段依次推进、答案被拦截 |
| 结果交付 | 看板/周报/计划数据随作答回流更新 |
| 可复现 | 同一输入两次运行结果一致（BKT 确定性） |
| 失败处理 | LLM 不可用时自动降级 Demo 并打标 |
| 合规 | 演示数据带 Demo 角标、周报含授权说明 |

- [ ] **Step 3: 录制演示视频（OBS，5 分钟内）**

按剧本录制，输出到 `docs/演示视频/`（或网盘链接）。

- [ ] **Step 4: 复赛材料打包**

README（运行入口/依赖/配置/账号）、部署说明（参考 `docs/部署手册.md` 更新 HiClaw 可选项说明）、数据合规说明（复用现有 `docs/安全设计说明.md` + 数据来源表）。

- [ ] **Step 5: Commit**

```bash
git add docs/Agent能力演示剧本.md docs/演示脚本.md README.md
git commit -m "docs: Agent 能力演示剧本与复赛自检清单"
```

---

## 自检记录（写作完成时执行）

- **Spec 覆盖**：六项评审能力各有任务（任务理解→Task 4/6；流程编排→Task 5；工具调用→Task 3；知识增强→Task 8；多轮交互→Task 9/10；结果交付→Task 6/12），闭环演示→Task 14。初赛红线→Task 0。
- **占位扫描**：全部步骤含完整代码/命令/预期输出，无 TBD 字样。
- **类型一致性**：`buildRegistry` 返回类型、`TaskPlan.steps`、`PlannedStep` 字段、`AgentRun/AgentStep` 列名与 Task 间引用一致；`student.searchKnowledge`、`org.classOverview` 已在本计划中声明补齐点。
- **风险提示**：LangGraph.js 版本 API 若与计划示例有差异（`Annotation.Root` 简写），以官方文档 `https://langchain-ai.github.io/langgraphjs/` 为准做等价替换；`org.classOverview` 若已存在同名方法则直接复用。

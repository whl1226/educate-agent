import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import type { ToolRegistry, ToolContext, ToolPipelineHooks } from './tool-registry';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { JwtUser } from '../../common/decorators/current-user.decorator';
import { extractUsage } from './trajectory';
import { LESSON_PLAN_PIPELINE, runPipeline } from './pipeline';

export type AgentIntent = 'diagnose' | 'teach' | 'generate' | 'knowledge' | 'admin' | 'general';

export const LLM_TIMEOUT_MS = 45_000;

/** 核心系统提示词：与 agentNode 的 system message 绑定，改动会反映到 requestSnapshot.systemPromptSha（模型行为漂移可定位） */
export const SYSTEM_PROMPT =
  '你是「乡芽」乡镇教育智能体的核心 Agent，服务于教师/学生/家长/管理者。' +
  '规则：1) 知识类问题必须调用 search_knowledge 并只在返回片段内作答；2) 诊断学生必须先 run_diagnosis；' +
  '3) 每步工具调用的理由用自然语言简短说明（这将展示给用户）；4) 最终回答必须结构清晰、可操作、可追溯，并列出引用；' +
  '5) 绝不直接给学生题目答案（辅导用 socratic_tutor 引导）；' +
  '6) 【禁止编造数据】所有学情、题目、知识信息必须来自工具返回结果，工具未返回的内容一律不得虚构；' +
  '7) 【不要向用户索要身份信息】诊断/错题/计划/周报类工具自动使用当前登录用户身份，直接调用工具即可；' +
  '8) 工具参数缺失时不要追问，能自动推断的（如当前用户）直接推断，必要时调用工具后根据结果再决定是否询问。' +
  '9) 教师文档类任务（教案/试卷/课件/发言稿/成绩单导出）必须调用 generate_document。该工具内置 Word(docx)/PPT(pptx)/PDF/Excel(xlsx) 四种排版技能，' +
  '    会自动把 Markdown 渲染为专业排版的文档（标题分级、主题配色、表格、列表、加粗强调），支持 theme 参数选配色。' +
  '    content_md 必须以 --- YAML 头开头（含 title 与 format），正文使用标准 Markdown 语法（# 标题、- 列表、| 表格、**加粗**）；' +
  '    【文档内容规范】正文中不要使用孤立或未闭合的星号/反引号（如 **文字 缺少闭合、单独出现的 * 或 `）；表格单元格内不要嵌套 ** 加粗，需要强调直接写文字即可；' +
  '10) 【备课任务】用户请求备课时（"备课/教案/教学设计"等），优先走备课流水线（search_knowledge 检索教材 + get_class_overview 获取班级学情 → generate_lesson_plan → researcher_comment 质检）；' +
  '11) 【教案质量】教案生成必须达到可直接上课的水平：教学目标三维可测、教学过程分环节并含教师/学生活动与设计意图、问题链有梯度、板书结构化、作业分 A/B/C 层、反思按三维度复盘；生成后若教研质检发现问题，须按建议修订后再次交付，并在交付中说明采纳了哪些建议；' +
  '12) 【最终交付】交付文本使用纯文本友好排版，严禁输出 Markdown 符号与 emoji：不要使用 **、*、#、```、反引号、😀🎉📊✅🔴 等标记字符或表情符号；' +
  '    分节用「一、二、三」或「1. 2. 3.」等自然序号，强调用引号或措辞而非符号，长文本说明要点即可，完整内容以工具生成的文件交付并提示用户可预览/下载；' +
  '13) 【禁止 emoji】任何输出（思考过程、对话回答、工具参数、文档 Markdown 内容）中一律不得出现 emoji 表情符号（如 📊✅🔴⚠️🎉 等），重要信息用文字、表格或 **加粗** 表达（加粗仅在文档 Markdown 中使用，对话交付文本不用）。';

/**
 * DSH systemPrompt.context('approval:policy') 思路：
 * 模型应知道自己当前权限边界，避免反复尝试被拒工具浪费 token。
 */
export function buildSystemPrompt(role: string, permissionSummary: string): string {
  return (
    SYSTEM_PROMPT +
    `【当前权限边界】你的身份角色：${role}。${permissionSummary} ` +
    '不要尝试调用权限范围外的工具；被审批拦截的工具不要反复重试，改用替代方案或如实告知用户。'
  );
}

/** 规则兜底意图识别（无 Key 或 LLM 失败时使用） */
export function detectIntent(text: string): AgentIntent {
  if (/诊断|掌握|薄弱|退步/.test(text)) return 'diagnose';
  if (/备课|教案|组卷|试卷|出题|教研|备|微课|脚本|发言稿|家长会|开学|材料包|职称|归档|补强|训练计划/.test(text)) return 'generate';
  if (/什么|为什么|意思|含义|讲解/.test(text)) return 'knowledge';
  if (/预警|看板|区域|师资/.test(text)) return 'admin';
  if (/练习|辅导|错题|计划/.test(text)) return 'teach';
  return 'general';
}

/** 演示模式的交付文本：按意图给出可读摘要（而非干巴巴的"已执行 N 步"） */
function buildDemoFinalText(intent: AgentIntent, toolCalls: Array<{ tool: string; result?: unknown; error?: string }>, needsHuman: boolean): string {
  if (needsHuman) return '任务执行完成但部分环节出现异常，详见下方轨迹中的红色标记，建议人工介入复核。';
  const pick = <T>(tool: string): T | undefined => {
    const rec = toolCalls.find((t) => t.tool === tool && !t.error);
    return rec ? (rec.result as T) : undefined;
  };
  switch (intent) {
    case 'generate': {
      const plan = pick<{ topic?: string; outline?: string }>('generate_lesson_plan');
      const review = pick<{ score?: number; content?: string }>('researcher_comment');
      const paper = pick<{ title?: string; questions?: Array<{ stem?: string }> }>('generate_paper');
      const doc = pick<{ filename?: string; downloadUrl?: string }>('generate_document');
      if (plan?.outline) {
        return (
          `已为「${plan.topic || '本课'}」完成备课流水线：教材检索 → 班级学情概览 → 教案生成 → 教研质检。\n\n` +
          `教案结构：\n${plan.outline.split('\n').map((s) => `· ${s}`).join('\n')}` +
          (review ? `\n\n教研质检：评分 ${review.score ?? '—'}，要点见下方工具轨迹，可随时要求我按建议修订教案。` : '') +
          '\n\n完整教案已生成并保存至教案库，可在下方工具结果中预览或下载。'
        );
      }
      if (paper?.questions?.length) {
        return (
          `已生成试卷「${paper.title || '分层试卷'}」，共 ${paper.questions.length} 题（A/B/C 分层）。\n\n` +
          `题目要点见下方工具轨迹，试卷 Word/PDF 文档已生成，可直接预览或下载打印。`
        );
      }
      if (doc?.downloadUrl) {
        return `任务已完成：文档「${doc.filename || '材料包'}」已生成（演示模式），可在下方工具结果中预览或下载。`;
      }
      if (review) {
        return `教研点评已完成：评分 ${review.score ?? '—'}，要点见下方工具轨迹。可继续追问"如何改进"获取修订建议。`;
      }
      break;
    }
    case 'diagnose': {
      const d = pick<{ diagnosis?: unknown; summary?: string }>('run_diagnosis');
      if (d && (d.summary || d.diagnosis)) {
        return `已完成学情诊断，输出如下要点（完整报告见下方工具结果）：\n\n${String(d.summary || JSON.stringify(d.diagnosis).slice(0, 300))}\n\n基于诊断已同时调取错题本，可让我进一步生成针对性练习或学习计划。`;
      }
      break;
    }
    case 'teach': {
      return '已调取学习计划与错题本，为你梳理了当前学习重点（见下方工具轨迹）。需要的话我可以：①生成针对薄弱知识点的练习；②就具体题目做苏格拉底式引导讲解。';
    }
    case 'admin':
      return '已获取区域学情概览与最新预警列表（见下方工具轨迹）。可继续追问：如"预警最多的学校是哪个？"或"某位老师的师资情况如何？"。';
    case 'knowledge': {
      const hits = pick<Array<{ title?: string; ref?: string }>>('search_knowledge');
      return hits && hits.length
        ? `已在知识库中检索到 ${hits.length} 条相关资料（引用见下方），要点如下：\n\n${hits.slice(0, 3).map((c, i) => `${i + 1}. ${c.title ?? c.ref ?? '资料'}`).join('\n')}\n\n需要我展开讲解其中某一条吗？`
        : '知识库暂未检索到高度相关的内容，建议换个说法或提供更多关键词。';
    }
  }
  return `（演示模式）已执行 ${toolCalls.length} 个工具步骤。${needsHuman ? '部分步骤失败，需人工介入。' : '详情见下方工具轨迹与结果。'}`;
}

export interface AgentGraphState {
  input: string;
  userId: number;
  role: string;
  /** Agent 运行 ID（任务三件套按 runId 隔离，Task 3.2） */
  runId?: number;
  /** 体验预览模式（X-Preview: 1）：跨角色浏览时工具域放行 */
  preview?: boolean;
  /** 权限边界摘要（Task 2.4）：注入系统提示词，让模型感知可调工具域与审批策略 */
  permissionSummary: string;
  intent: AgentIntent;
  toolCalls: Array<{ tool: string; args: unknown; result?: unknown; error?: string; durationMs: number }>;
  finalText: string;
  refs: string[];
  needsHuman: boolean;
  usage: { inputTokens: number; outputTokens: number };
  /** 事件回调（SSE 推送） */
  onEvent?: (ev: AgentEvent) => void | Promise<void>;
}

export type AgentEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool_start'; name: string; args: unknown }
  | { type: 'tool_end'; name: string; result?: unknown; error?: string; durationMs: number }
  | { type: 'text_delta'; delta: string }
  | { type: 'done'; finalText: string; refs: string[]; intent: AgentIntent }
  | { type: 'error'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'task_start'; taskId: string; kind: string; description: string }
  | { type: 'task_end'; taskId: string; state: string; outputSummary?: string };

const State = Annotation.Root({
  input: Annotation<string>,
  userId: Annotation<number>,
  role: Annotation<string>,
  runId: Annotation<number | undefined>,
  preview: Annotation<boolean | undefined>,
  permissionSummary: Annotation<string>,
  intent: Annotation<AgentIntent>,
  toolCalls: Annotation<Array<{ tool: string; args: unknown; result?: unknown; error?: string; durationMs: number }>>({
    reducer: (a, b) => [...a, ...b],
  }),
  finalText: Annotation<string>,
  refs: Annotation<string[]>({ reducer: (a, b) => [...a, ...b] }),
  needsHuman: Annotation<boolean>,
  usage: Annotation<{ inputTokens: number; outputTokens: number }>,
  onEvent: Annotation<((ev: AgentEvent) => void | Promise<void>) | undefined>,
});

export interface RefVerifyResult {
  validRefs: string[];
  invalidRefs: string[];
}

export interface BuildAgentGraphOptions {
  llm: ChatOpenAI | null;       // null = Demo 规则模式
  registry: ToolRegistry;
  maxTurns?: number;
  checkpointer?: BaseCheckpointSaver;
  /** 引用校验器（Task 11）：交付前剔除未通过校验的引用 */
  refVerifier?: (refs: string[]) => Promise<RefVerifyResult>;
  /** 工具流水线 hooks（Task 2.1/2.3）：preExecute 三态决策/guard/postExecute，透传给 registry.call */
  pipelineHooks?: ToolPipelineHooks;
}

export function buildAgentGraph({ llm, registry, maxTurns = 12, checkpointer, refVerifier, pipelineHooks }: BuildAgentGraphOptions) {
  const turnLimit = Math.min(Math.max(maxTurns, 3), 20);

  const intentNode = async (s: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    const intent = detectIntent(s.input);
    return { intent };
  };

  const agentNode = async (s: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    // C1：ctx 携带真实登录用户，工具层鉴权与数据范围校验以 ctx.user 为准
    const ctx: ToolContext = { userId: s.userId, role: s.role, user: { id: s.userId, role: s.role } as JwtUser, runId: s.runId, preview: s.preview };
    const toolCalls: AgentGraphState['toolCalls'] = [];
    const refs: string[] = [];
    let needsHuman = false;

    // ===== Demo 规则模式（无 LLM Key）：确定性执行 =====
    if (!llm) {
      if (s.onEvent) await s.onEvent({ type: 'thinking', text: `已识别意图「${s.intent}」，进入规则引擎执行（演示模式）。` });
      const callTool = async (name: string, args: unknown) => {
        if (s.onEvent) await s.onEvent({ type: 'tool_start', name, args });
        const rec = await registry.call(ctx, name, args, pipelineHooks);
        toolCalls.push(rec);
        if (s.onEvent) {
          await s.onEvent({ type: 'tool_end', name, result: rec.result, error: rec.error, durationMs: rec.durationMs });
        }
        if (rec.error) needsHuman = true;
        else needsHuman = false;
        if (name === 'search_knowledge' && (rec.result as Array<{ ref: string }> | undefined)?.length) {
          (rec.result as Array<{ ref: string }>).forEach((c) => refs.push(c.ref));
        }
        return rec.result;
      };
      switch (s.intent) {
        case 'diagnose':
          await callTool('run_diagnosis', { studentId: ctx.userId });
          await callTool('get_error_book', { studentId: ctx.userId });
          break;
        case 'teach':
          await callTool('get_study_plan', { studentId: ctx.userId });
          await callTool('get_error_book', { studentId: ctx.userId });
          break;
        case 'generate': {
          // demo 分支按关键词路由到对应工具，保证无 Key 也能演示各预设
          if (/微课|脚本/.test(s.input)) {
            if (s.onEvent) await s.onEvent({ type: 'thinking', text: '识别为微课脚本任务，调用文档生成工具输出分镜脚本与逐字稿。' });
            await callTool('generate_document', {
              format: 'docx',
              title: '微课脚本',
              content_md:
                '---\ntitle: 微课脚本\nformat: docx\ntheme: default\n---\n\n# 微课脚本\n\n## 一、开场（0:00-0:40）\n情境导入：用生活化问题引发兴趣。\n\n## 二、探究（0:40-3:20）\n核心知识讲解，配合操作演示与停顿点。\n\n## 三、练习（3:20-5:50）\n3 道随堂练习，每题停顿 8 秒供学生口答。\n\n## 四、总结（5:50-8:00）\n口诀总结 + 布置家庭小任务。\n\n---\n说明：本脚本由乡芽智能体演示模式生成，正式使用请接入真实 LLM。',
            });
          } else if (/组卷|试卷|出题/.test(s.input)) {
            if (s.onEvent) await s.onEvent({ type: 'thinking', text: '识别为组卷任务，调用分层组卷工具并按需生成试卷文档。' });
            const paper = await callTool('generate_paper', {
              subject: '数学', grade: '五年级', title: '自动组卷练习', layerMode: 'layered', questionCount: 6,
            });
            const qs = (paper as { questions?: Array<{ stem?: string; answer?: string }> })?.questions ?? [];
            await callTool('generate_document', {
              format: 'docx',
              title: '数学分层试卷',
              content_md:
                '---\ntitle: 数学分层试卷\nformat: docx\ntheme: default\n---\n\n# 五年级数学分层试卷\n\n' +
                (qs.length ? qs.map((q, i) => `${i + 1}. ${q.stem ?? ''}\n\n**参考答案**：${q.answer ?? ''}\n`).join('\n') : '（演示模式：试卷题目已生成，可下载 Word/PDF）'),
            });
          } else if (/教研|点评|话术|建议/.test(s.input)) {
            if (s.onEvent) await s.onEvent({ type: 'thinking', text: '识别为教研任务，调用 AI 教研员工具生成点评/话术/建议。' });
            await callTool('researcher_comment', { sourceContent: s.input.slice(0, 200) });
          } else if (/发言稿|家长会/.test(s.input)) {
            if (s.onEvent) await s.onEvent({ type: 'thinking', text: '识别为家长会材料任务，生成发言稿文档。' });
            await callTool('generate_document', {
              format: 'docx',
              title: '家长会发言稿',
              content_md:
                '---\ntitle: 家长会发言稿\nformat: docx\ntheme: default\n---\n\n# 家长会发言稿\n\n## 开场（1 分钟）\n感谢各位家长，今天重点聊聊孩子们这一个半学期的成长。\n\n## 班级学情（4 分钟）\n42 名同学平均掌握度从 71% 提升到 78.6%，本周作答 1,286 次创本学期新高。\n\n## 进步表彰（3 分钟）\n点名表扬 8 名进步显著的同学。\n\n## 家校协作（5 分钟）\n每天 15 分钟亲子共读、关注情绪变化、多用语音留言陪伴。\n\n## 收尾（2 分钟）\n安全教育提醒 + 会后一对一面谈预约。',
            });
          } else if (/开学|材料包|职称|归档|补强|训练计划|资源/.test(s.input)) {
            if (s.onEvent) await s.onEvent({ type: 'thinking', text: '识别为材料生成/整理任务，调用文档生成工具输出成套材料。' });
            await callTool('generate_document', {
              format: 'docx',
              title: '材料包',
              content_md:
                '---\ntitle: 材料包\nformat: docx\ntheme: default\n---\n\n# 材料包\n\n## 一、开学第一课课件\n"新学期，种下希望的种子"主题，18 页。\n\n## 二、班级公约\n8 条公约结合班级学情生成。\n\n## 三、学期教学计划\n依据课标课时建议排布 20 周教学进度。\n\n## 四、安全告知书\n防溺水、交通、校园欺凌等 6 类安全事项。\n\n---\n说明：本材料由乡芽智能体演示模式生成。',
            });
          } else {
            if (s.onEvent) await s.onEvent({ type: 'thinking', text: '进入备课流水线：并行检索教材与学情 → 教案生成 → 教研质检。' });
            const out = await runPipeline(registry, ctx, LESSON_PLAN_PIPELINE, { subject: '语文', grade: '五年级', topic: '草船借箭', classId: 1, planSummary: '' }, s.onEvent);
            toolCalls.push(...out.toolCalls);
            refs.push(...out.refs);
            needsHuman = out.needsHuman;
          }
          break;
        }
        case 'knowledge':
          await callTool('search_knowledge', { query: s.input.slice(0, 80), topK: 5 });
          break;
        case 'admin':
          await callTool('get_region_overview', {});
          await callTool('list_alerts', { limit: 5 });
          break;
        default:
          await callTool('run_diagnosis', { studentId: ctx.userId });
      }
      const finalText = buildDemoFinalText(s.intent, toolCalls, needsHuman);
      return { toolCalls, finalText, refs, needsHuman };
    }

    // ===== LLM 模式：ReAct 循环（function calling） =====
    if (s.onEvent) await s.onEvent({ type: 'thinking', text: '开始理解任务：解析意图、规划所需工具与执行顺序。' });
    // 每轮 invoke 的 token 用量累计（usage_metadata 缺失时为 0）
    let usageAcc = { inputTokens: 0, outputTokens: 0 };
    // 关键修复：bindTools 把工具 schema 绑定给模型（ReAct 核心），否则模型无法发起工具调用。
    // DeepSeek 在 tool_choice='auto' 时可能不发起调用（转而反问用户）→ 第一轮强制 required，
    // 确保任务必然以工具调用开局；后续轮次用 auto（允许模型给出最终回答结束循环）。
    const bindFn = (llm as unknown as { bindTools?: (schemas: unknown, kwargs?: Record<string, unknown>) => typeof llm }).bindTools;
    const schemas = registry.toFunctionSchemas();
    const llmNonNull = llm as unknown as NonNullable<typeof llm>;
    const llmFirstTurn = (bindFn ? bindFn.call(llm, schemas, { tool_choice: 'required' }) : llmNonNull) as unknown as NonNullable<typeof llm>;
    const llmWithTools = (bindFn ? bindFn.call(llm, schemas) : llmNonNull) as unknown as NonNullable<typeof llm>;
    const invokeLlm = (msgs: Array<Record<string, unknown>>) => {
      const pending = llmWithTools.invoke(msgs as never) as Promise<unknown>;
      return Promise.race([
        pending,
        new Promise((_, rej) => setTimeout(() => rej(new Error(`LLM 调用超时（${LLM_TIMEOUT_MS / 1000}s）`)), LLM_TIMEOUT_MS)),
      ]);
    };
    const messages: Array<Record<string, unknown>> = [
      {
        role: 'system',
        content: buildSystemPrompt(s.role, s.permissionSummary ?? ''),
      },
      { role: 'human', content: s.input },
    ];

    for (let turn = 0; turn < turnLimit; turn++) {
      // 第一轮强制工具调用（required，规避 DeepSeek auto 模式反问用户），后续轮 auto（允许最终回答结束）
      let aiMsg: { content?: unknown; tool_calls?: Array<{ name?: string; args?: unknown }> };
      if (turn === 0 && bindFn) {
        aiMsg = (await Promise.race([
          llmFirstTurn.invoke(messages as never) as Promise<unknown>,
          new Promise((_, rej) => setTimeout(() => rej(new Error(`LLM 调用超时（${LLM_TIMEOUT_MS / 1000}s）`)), LLM_TIMEOUT_MS)),
        ])) as never;
      } else {
        aiMsg = (await invokeLlm(messages)) as never;
      }
      aiMsg = (aiMsg ?? { content: '' }) as { content?: unknown; tool_calls?: Array<{ name?: string; args?: unknown }> };
      const u = extractUsage(aiMsg);
      usageAcc = { inputTokens: usageAcc.inputTokens + u.inputTokens, outputTokens: usageAcc.outputTokens + u.outputTokens };
      const content = typeof aiMsg.content === 'string' ? aiMsg.content : '';
      const toolCallsRaw = (aiMsg.tool_calls ?? []) as Array<{ name?: string; args?: unknown }>;
      // 模型在发起工具调用前给出的思考/理由 → 作为思考事件展示（opencode 式推理过程）
      if (content.trim() && toolCallsRaw.length && s.onEvent) {
        await s.onEvent({ type: 'thinking', text: content.trim() });
      }
      if (!toolCallsRaw.length) {
        // 无工具调用 = 最终回答：流式输出（opencode 式逐 token 展示），并累积最终文本
        let finalText = content;
        if (s.onEvent) {
          const emit = s.onEvent;
          // 先尝试流式（真实 LLM 模式）；失败或超时则一次性推送
          try {
            let streamed = '';
            let buffer = '';
            // 缓冲聚合：每 24 字符或遇换行/句号 flush 一次，避免逐 token 碎片事件
            const flush = async () => {
              if (!buffer) return;
              await emit({ type: 'text_delta', delta: buffer });
              buffer = '';
            };
            const streamIter = (await Promise.race([
              llmWithTools.stream(messages as never) as Promise<AsyncIterable<unknown>>,
              new Promise((_, rej) => setTimeout(() => rej(new Error(`LLM 流式超时（${LLM_TIMEOUT_MS / 1000}s）`)), LLM_TIMEOUT_MS)),
            ])) as AsyncIterable<{ content?: unknown }>;
            for await (const chunk of streamIter) {
              const text = (chunk as { content?: unknown })?.content;
              if (typeof text === 'string' && text) {
                streamed += text;
                buffer += text;
                if (buffer.length >= 24 || /[。！？!?\n]$/.test(buffer)) await flush();
              }
            }
            await flush();
            if (streamed) finalText = streamed;
          } catch {
            // 流式不可用：回退一次性推送
            await emit({ type: 'text_delta', delta: content });
          }
        }
        if (s.onEvent) await s.onEvent({ type: 'usage', ...usageAcc });
        return { toolCalls, finalText, refs, needsHuman, usage: usageAcc };
      }
      // 学生数据类工具：studentId 缺失时自动补全为当前登录用户（Agent 应理解上下文，而非向用户索要 ID）
      const normalizeArgs = (name: string, args: Record<string, unknown>): Record<string, unknown> => {
        const STUDENT_SCOPED_TOOLS = ['run_diagnosis', 'get_latest_diagnosis', 'get_error_book', 'get_study_plan', 'get_weekly_report'];
        if (STUDENT_SCOPED_TOOLS.includes(name) && args.studentId === undefined) {
          return { ...args, studentId: s.userId };
        }
        return args;
      };
      for (const tc of toolCallsRaw) {
        const name = tc.name ?? '';
        const args = normalizeArgs(name, (tc.args ?? {}) as Record<string, unknown>);
        const callId = `call_${turn}_${name}`;
        if (s.onEvent) await s.onEvent({ type: 'tool_start', name, args });
        const rec = await registry.call(ctx, name, args, pipelineHooks);
        toolCalls.push(rec);
        if (s.onEvent) {
          await s.onEvent({ type: 'tool_end', name, result: rec.result, error: rec.error, durationMs: rec.durationMs });
        }
        // needsHuman 语义：仅当"最终仍未解决"才需要人工——错误被后续成功调用恢复时不算
        // （例如越权错误后模型自动改用正确身份重试成功）
        if (name === 'search_knowledge' && (rec.result as Array<{ ref: string }> | undefined)?.length) {
          (rec.result as Array<{ ref: string }>).forEach((c) => refs.push(c.ref));
        }
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [{ name, args, id: callId }],
        } as never);
        messages.push({
          role: 'tool',
          tool_call_id: callId,
          content: JSON.stringify(rec.result ?? { error: rec.error }).slice(0, 4000),
        } as never);
      }
      // needsHuman 语义：以"本轮最后一个工具是否失败"为准——
      // 错误被后续成功调用恢复（模型自愈）时不标记；最后仍失败则需人工介入
      if (toolCallsRaw.length) {
        const lastRound = toolCalls.slice(-toolCallsRaw.length);
        needsHuman = lastRound[lastRound.length - 1]?.error ? true : false;
      }
    }
    const finalText = `已达到最大执行轮数（${turnLimit}），部分流程未完成，请人工介入。`;
    if (s.onEvent) await s.onEvent({ type: 'usage', ...usageAcc });
    return { toolCalls, finalText, refs, needsHuman: true, usage: usageAcc };
  };

  const finalizeNode = async (s: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    let finalText = s.finalText;
    let refs = s.refs;
    if (refVerifier && s.refs.length) {
      try {
        const { validRefs, invalidRefs } = await refVerifier(s.refs);
        finalText = invalidRefs.length
          ? `${s.finalText}\n\n（引用校验：${invalidRefs.slice(0, 5).join('、')}${invalidRefs.length > 5 ? ' 等' : ''}未通过校验，已从交付引用中剔除）`
          : s.finalText;
        refs = validRefs;
      } catch {
        // 校验失败不阻断交付，保留原引用
      }
    }
    // I8：done 事件统一在 finalize 校验完成后发出（agentNode 不再发）
    if (s.onEvent) await s.onEvent({ type: 'done', finalText, refs, intent: s.intent });
    return { finalText, refs };
  };

  const g = new StateGraph(State)
    .addNode('intentNode', intentNode)
    .addNode('agent', agentNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'intentNode')
    .addEdge('intentNode', 'agent')
    .addEdge('agent', 'finalize')
    .addEdge('finalize', END);

  const compiled = checkpointer ? g.compile({ checkpointer }) : g.compile();
  return compiled;
}

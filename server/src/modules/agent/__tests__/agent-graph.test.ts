import { describe, expect, it, vi } from 'vitest';
import { buildAgentGraph, buildSystemPrompt, detectIntent } from '../agent-graph';
import { buildRegistry, type ToolBindings, type ToolRegistry, type ToolContext } from '../tool-registry';
import type { JwtUser } from '../../../common/decorators/current-user.decorator';

const ctxOf = (role: JwtUser['role'], id = 5): ToolContext => ({
  userId: id,
  role,
  user: { id, username: `u${id}`, role, jti: 'jti', scopeKey: String(id) },
});

const bindings: ToolBindings = {
  run_diagnosis: vi.fn(async (_ctx: ToolContext, _sid: number) => ({ overallMastery: 60, dims: [] })),
  task_list: vi.fn(async () => []),
  task_output: vi.fn(async () => ({ state: 'running' })),
  task_stop: vi.fn(async () => ({ stopped: true })),
  get_latest_diagnosis: vi.fn(async () => null),
  get_error_book: vi.fn(async () => [{ id: 1, errorType: '形近字混淆' }]),
  get_study_plan: vi.fn(async () => []),
  practice_questions: vi.fn(async () => []),
  submit_answer: vi.fn(async () => ({ isCorrect: true })),
  search_knowledge: vi.fn(async () => [{ ref: 'chunk:1', title: '草船借箭', content: '周瑜妒忌诸葛亮……' }]),
  socratic_tutor: vi.fn(async () => ({ stage: 'identify' })),
  generate_lesson_plan: vi.fn(async () => ({ id: 1, outline: '一、教学目标' })),
  generate_paper: vi.fn(async () => ({ id: 1 })),
  generate_document: vi.fn(async () => ({ valid: true, downloadUrl: '/api/v1/files/1/download' })),
  get_class_overview: vi.fn(async () => ({ total: 42 })),
  researcher_comment: vi.fn(async () => ({ score: 88 })),
  get_weekly_report: vi.fn(async () => ({})),
  get_region_overview: vi.fn(async () => ({ schools: 9 })),
  list_alerts: vi.fn(async () => []),
  get_teacher_profile: vi.fn(async () => ({})),
};
const registry: ToolRegistry = buildRegistry(bindings);

describe('detectIntent', () => {
  it('意图分类', () => {
    expect(detectIntent('帮我诊断学习薄弱点')).toBe('diagnose');
    expect(detectIntent('备一节语文课')).toBe('generate');
    expect(detectIntent('草船借箭讲了什么')).toBe('knowledge');
    expect(detectIntent('区域预警情况')).toBe('admin');
    expect(detectIntent('我的学习计划')).toBe('teach');
  });
});

describe('buildSystemPrompt', () => {
  it('注入角色权限边界摘要，模型可感知可调工具域', () => {
    const p = buildSystemPrompt('teacher', '可调用工具：generate_lesson_plan/generate_paper/generate_document/get_class_overview/researcher_comment/search_knowledge；敏感数据工具将触发审批。');
    expect(p).toContain('teacher');
    expect(p).toContain('generate_document');
    expect(p).toContain('审批');
  });
});

describe('buildAgentGraph (demo mode)', () => {
  it('诊断意图按规则执行工具并产出摘要', async () => {
    const events: string[] = [];
    const graph = buildAgentGraph({ llm: null, registry });
    const out = await graph.invoke({
      input: '帮我诊断学习薄弱点',
      userId: 5, role: 'student', intent: 'general',
      toolCalls: [], finalText: '', refs: [], needsHuman: false,
      onEvent: (ev) => { events.push(ev.type); return Promise.resolve(); },
    });
    expect(out.toolCalls.map((t) => t.tool)).toEqual(['run_diagnosis', 'get_error_book']);
    expect(out.needsHuman).toBe(false);
    expect(events).toContain('thinking');
    expect(events).toContain('tool_start');
    expect(events).toContain('tool_end');
    expect(events).toContain('done');
  });

  it('知识意图调用 search_knowledge', async () => {
    const graph = buildAgentGraph({ llm: null, registry });
    const out = await graph.invoke({
      input: '草船借箭讲了什么故事？',
      userId: 5, role: 'student', intent: 'general',
      toolCalls: [], finalText: '', refs: [], needsHuman: false, onEvent: undefined,
    });
    expect(out.toolCalls[0].tool).toBe('search_knowledge');
    expect(out.refs).toContain('chunk:1');
  });

  it('student 意图触发教师工具时被权限拦截并标记 needsHuman', async () => {
    const graph = buildAgentGraph({ llm: null, registry });
    const out = await graph.invoke({
      input: '帮我备课', userId: 5, role: 'student', intent: 'generate',
      toolCalls: [], finalText: '', refs: [], needsHuman: false, onEvent: undefined,
    });
    expect(out.toolCalls.some((t) => t.error === '无权限调用该工具')).toBe(true);
    expect(out.needsHuman).toBe(true);
  });

  it('generate 意图按备课流水线执行：并行检索+学情 → 教案 → 质检', async () => {
    const graph = buildAgentGraph({ llm: null, registry });
    const out = await graph.invoke({
      input: '帮我备课', userId: 5, role: 'teacher', intent: 'generate',
      toolCalls: [], finalText: '', refs: [], needsHuman: false, onEvent: undefined,
    });
    expect(out.toolCalls.map((t) => t.tool)).toEqual(['search_knowledge', 'get_class_overview', 'generate_lesson_plan', 'researcher_comment']);
    expect(out.refs).toContain('chunk:1');
    expect(out.needsHuman).toBe(false);
  });

  it('done 事件在 finalize 节点统一发出且携带最终文本', async () => {
    const events: Array<{ type: string; finalText?: string }> = [];
    const graph = buildAgentGraph({ llm: null, registry });
    await graph.invoke({
      input: '帮我诊断', userId: 5, role: 'student', intent: 'general',
      toolCalls: [], finalText: '', refs: [], needsHuman: false,
      onEvent: (ev) => { events.push(ev); return Promise.resolve(); },
    });
    const done = events.filter((e) => e.type === 'done');
    expect(done).toHaveLength(1);
    expect(done[0].finalText).toContain('演示模式');
  });
});

describe('buildAgentGraph (LLM mode)', () => {
  it('LLM 先调工具再给最终回答', async () => {
    const events: string[] = [];
    const llm = {
      invoke: vi
        .fn()
        .mockResolvedValueOnce({
          content: '',
          tool_calls: [{ name: 'run_diagnosis', args: { studentId: 5 } }],
          usage_metadata: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
        })
        .mockResolvedValueOnce({
          content: '诊断完成：整体掌握度 60%，薄弱点为形近字辨析。建议针对性练习。',
          tool_calls: [],
          usage_metadata: { input_tokens: 80, output_tokens: 40, total_tokens: 120 },
        }),
    } as any;
    const graph = buildAgentGraph({ llm, registry });
    const out = await graph.invoke({
      input: '诊断一下', userId: 5, role: 'student', intent: 'general',
      permissionSummary: '可调用工具：run_diagnosis/search_knowledge；当前为宽松模式，工具调用直接放行。',
      toolCalls: [], finalText: '', refs: [], needsHuman: false,
      onEvent: (ev) => { events.push(ev.type); return Promise.resolve(); },
    });
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0].tool).toBe('run_diagnosis');
    expect(out.finalText).toContain('形近字辨析');
    expect(llm.invoke).toHaveBeenCalledTimes(2);
    expect(events).toContain('usage');
    expect(out.usage).toEqual({ inputTokens: 180, outputTokens: 60 });
    // Task 2.4 接线：系统消息包含角色与权限边界段（与真实请求一致）
    const systemMsg = llm.invoke.mock.calls[0][0][0] as { content: string };
    expect(systemMsg.content).toContain('【当前权限边界】');
    expect(systemMsg.content).toContain('你的身份角色：student');
    expect(systemMsg.content).toContain('可调用工具：run_diagnosis/search_knowledge');
  });

  it('工具失败标记 needsHuman', async () => {
    const bind = { ...bindings, run_diagnosis: vi.fn(async () => { throw new Error('诊断服务不可用'); }) };
    const reg = buildRegistry(bind);
    const llm = {
      invoke: vi.fn().mockResolvedValueOnce({
        content: '', tool_calls: [{ name: 'run_diagnosis', args: { studentId: 5 } }],
      }),
    } as any;
    const graph = buildAgentGraph({ llm, registry: reg });
    const out = await graph.invoke({
      input: '诊断', userId: 5, role: 'student', intent: 'general',
      toolCalls: [], finalText: '', refs: [], needsHuman: false, onEvent: undefined,
    });
    expect(out.toolCalls[0].error).toContain('诊断服务不可用');
    expect(out.needsHuman).toBe(true);
  });
});

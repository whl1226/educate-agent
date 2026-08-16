import { describe, expect, it, vi } from 'vitest';
import { buildRegistry, type ToolBindings, type ToolContext } from '../tool-registry';
import { LESSON_PLAN_PIPELINE, renderArgs, runPipeline, type PipelineStep, type PipelineTemplate } from '../pipeline';

const ctx: ToolContext = { userId: 5, role: 'teacher', user: { id: 5, username: 'u5', role: 'teacher', jti: 'j', scopeKey: '5' }, runId: 1 };

function makeBindings() {
  const calls: string[] = [];
  const b = {
    search_knowledge: vi.fn(async () => [{ ref: 'chunk:1' }]),
    get_class_overview: vi.fn(async () => ({ total: 42 })),
    generate_lesson_plan: vi.fn(async () => ({ id: 1, title: '草船借箭教案' })),
    researcher_comment: vi.fn(async () => ({ score: 88 })),
  } as unknown as ToolBindings;
  return { b, calls };
}

describe('pipeline', () => {
  it('renderArgs 变量替换', () => {
    expect(renderArgs({ query: '${topic}', topK: 5 }, { topic: '草船借箭' })).toEqual({ query: '草船借箭', topK: 5 });
    expect(renderArgs({ classId: '${classId}' }, { classId: 1 })).toEqual({ classId: '1' });
  });

  it('renderArgs 缺失变量 fail-fast 抛错', () => {
    expect(() => renderArgs({ query: '${missing}' }, {})).toThrow('pipeline 变量未提供: missing');
  });

  it('备课流水线：并行检索+学情 → 教案 → 质检，引用回流', async () => {
    const { b } = makeBindings();
    const r = buildRegistry(b as ToolBindings);
    const events: string[] = [];
    const out = await runPipeline(r, ctx, LESSON_PLAN_PIPELINE, { subject: '语文', grade: '五年级', topic: '草船借箭', classId: 1, planSummary: '' }, (ev) => { events.push(ev.type); return Promise.resolve(); });
    expect(out.toolCalls.map((t) => t.tool)).toEqual(['search_knowledge', 'get_class_overview', 'generate_lesson_plan', 'researcher_comment']);
    expect(out.refs).toContain('chunk:1');
    expect(events).toContain('tool_start');
    expect(events).toContain('tool_end');
  });

  it('capture 机制：上一步结果 JSON 注入后续步骤变量', async () => {
    const { b } = makeBindings();
    const r = buildRegistry(b as ToolBindings);
    await runPipeline(r, ctx, LESSON_PLAN_PIPELINE, { subject: '语文', grade: '五年级', topic: '草船借箭', classId: 1, planSummary: '' });
    const src = (b.researcher_comment as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(src).toContain('草船借箭教案');
  });

  it('并行组输出按模板声明顺序排序（即使工具完成顺序颠倒）', async () => {
    const b = {
      search_knowledge: vi.fn(async () => { await new Promise((r) => setTimeout(r, 30)); return [{ ref: 'chunk:1' }]; }),
      get_class_overview: vi.fn(async () => ({ total: 42 })),
      generate_lesson_plan: vi.fn(async () => ({ id: 1, title: '草船借箭教案' })),
      researcher_comment: vi.fn(async () => ({ score: 88 })),
    } as unknown as ToolBindings;
    const r = buildRegistry(b);
    const events: string[] = [];
    const out = await runPipeline(r, ctx, LESSON_PLAN_PIPELINE, { subject: '语文', grade: '五年级', topic: '草船借箭', classId: 1, planSummary: '' }, (ev) => { events.push(ev.type); return Promise.resolve(); });
    expect(out.toolCalls.map((t) => t.tool)).toEqual(['search_knowledge', 'get_class_overview', 'generate_lesson_plan', 'researcher_comment']);
    expect(out.refs).toContain('chunk:1');
  });

  it('capture 截断安全：超长结果追加截断标记且截断边界不拆代理对', async () => {
    const b = {
      search_knowledge: vi.fn(async () => [{ ref: 'chunk:1' }]),
      get_class_overview: vi.fn(async () => ({ total: 42 })),
      generate_lesson_plan: vi.fn(async () => ({ id: 1, title: '教案📚'.repeat(1200) })),
      researcher_comment: vi.fn(async () => ({ score: 88 })),
    } as unknown as ToolBindings;
    const r = buildRegistry(b);
    await runPipeline(r, ctx, LESSON_PLAN_PIPELINE, { subject: '语文', grade: '五年级', topic: '草船借箭', classId: 1, planSummary: '' });
    const src = (b.researcher_comment as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(src.endsWith('...[truncated]')).toBe(true);
    const body = src.slice(0, -'...[truncated]'.length);
    expect(Array.from(body).length).toBeLessThanOrEqual(1500);
    const last = body.charCodeAt(body.length - 1);
    expect(last < 0xd800 || last > 0xdfff).toBe(true);
  });

  it('并行子代理事件不重复：tool_start/tool_end 各恰好一次（subEmitted 防重）', async () => {
    const { b } = makeBindings();
    const r = buildRegistry(b as ToolBindings);
    const events: Array<{ type: string; name?: string }> = [];
    await runPipeline(r, ctx, LESSON_PLAN_PIPELINE, { subject: '语文', grade: '五年级', topic: '草船借箭', classId: 1, planSummary: '' }, (ev) => { events.push(ev); return Promise.resolve(); });
    const starts = events.filter((e) => e.type === 'tool_start');
    const ends = events.filter((e) => e.type === 'tool_end');
    expect(starts).toHaveLength(4);
    expect(ends).toHaveLength(4);
    expect(starts.filter((e) => e.name === 'search_knowledge')).toHaveLength(1);
    expect(starts.filter((e) => e.name === 'get_class_overview')).toHaveLength(1);
  });

  it('并行步骤不支持 capture：fail-fast 抛错', async () => {
    const { b } = makeBindings();
    const r = buildRegistry(b as ToolBindings);
    const tpl: PipelineTemplate = {
      name: 'parallel_capture',
      description: '',
      steps: [
        { kind: 'parallel', label: 'p', steps: [{ kind: 'tool', tool: 'search_knowledge', args: { query: 'x' }, label: 's', capture: 'out' }] },
      ],
    };
    await expect(runPipeline(r, ctx, tpl, {})).rejects.toThrow('并行步骤不支持 capture: search_knowledge');
  });

  it('深度预算接线：嵌套 parallel 超限时最内层子代理被拒（工具不执行）', async () => {
    const b = { search_knowledge: vi.fn(async () => [{ ref: 'x' }]) } as unknown as ToolBindings;
    const r = buildRegistry(b);
    const leaf: PipelineStep = {
      kind: 'parallel', label: 'l3', steps: [{ kind: 'tool', tool: 'search_knowledge', args: { query: 'x' }, label: 'in' }],
    };
    const tpl: PipelineTemplate = {
      name: 'deep_nested',
      description: '',
      steps: [
        { kind: 'parallel', label: 'l1', steps: [{ kind: 'parallel', label: 'l2', steps: [leaf] }] },
      ],
    };
    const out = await runPipeline(r, ctx, tpl, {});
    expect(b.search_knowledge).not.toHaveBeenCalled();
    expect(out.toolCalls).toHaveLength(0);
  });
});

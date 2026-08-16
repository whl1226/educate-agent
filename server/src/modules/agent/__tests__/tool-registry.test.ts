import { describe, expect, it, vi } from 'vitest';
import { buildRegistry, ToolRegistry, type ToolBindings, type ToolCallRecord, type ToolContext } from '../tool-registry';
import type { JwtUser } from '../../../common/decorators/current-user.decorator';

const bindings: ToolBindings = {
  run_diagnosis: vi.fn(async () => ({ overallMastery: 60 })),
  task_list: vi.fn(async () => []),
  task_output: vi.fn(async () => ({ state: 'running' })),
  task_stop: vi.fn(async () => ({ stopped: true })),
  get_latest_diagnosis: vi.fn(async () => null),
  get_error_book: vi.fn(async () => []),
  get_study_plan: vi.fn(async () => []),
  practice_questions: vi.fn(async () => []),
  submit_answer: vi.fn(async () => ({ isCorrect: true })),
  search_knowledge: vi.fn(async () => []),
  socratic_tutor: vi.fn(async () => ({ stage: 'identify' })),
  generate_lesson_plan: vi.fn(async () => ({ id: 1 })),
  generate_paper: vi.fn(async () => ({ id: 1 })),
  generate_document: vi.fn(async () => ({ valid: true, downloadUrl: '/api/v1/files/1/download' })),
  get_class_overview: vi.fn(async () => ({ total: 42 })),
  researcher_comment: vi.fn(async () => ({ score: 88 })),
  get_weekly_report: vi.fn(async () => ({})),
  get_region_overview: vi.fn(async () => ({})),
  list_alerts: vi.fn(async () => []),
  get_teacher_profile: vi.fn(async () => ({})),
};

/** 构造带真实用户的上下文（角色与 ID 一致） */
const ctxOf = (role: JwtUser['role'], id = 1): ToolContext => ({
  userId: id,
  role,
  user: { id, username: `u${id}`, role, jti: 'jti', scopeKey: String(id) },
});

describe('ToolRegistry', () => {
  it('注册 20 个工具', () => {
    const r = buildRegistry(bindings);
    expect(r.list()).toHaveLength(20);
    expect(r.get('run_diagnosis')).toBeDefined();
    expect(r.get('search_knowledge')).toBeDefined();
    expect(r.get('generate_document')).toBeDefined();
  });

  it('call 转发参数并返回轨迹记录', async () => {
    const r = buildRegistry(bindings);
    const rec: ToolCallRecord = await r.call(ctxOf('student', 5), 'run_diagnosis', { studentId: 5 });
    expect(rec.result).toEqual({ overallMastery: 60 });
    expect(rec.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('未知工具与异常工具返回 error', async () => {
    const r = buildRegistry(bindings);
    expect((await r.call(ctxOf('student'), 'no_such', {})).error).toContain('未知工具');
    const bad = new ToolRegistry();
    bad.register({ name: 'boom', description: 'd', inputSchema: { type: 'object' }, execute: async () => { throw new Error('挂了'); } });
    const rec = await bad.call(ctxOf('student'), 'boom', {});
    expect(rec.error).toContain('挂了');
  });

  it('角色不足时 call 返回权限 error（不执行底层 binding）', async () => {
    const r = buildRegistry(bindings);
    const rec = await r.call(ctxOf('student'), 'generate_lesson_plan', { subject: '语文', grade: '五年级', topic: '草船借箭' });
    expect(rec.error).toBe('无权限调用该工具');
    expect(rec.durationMs).toBe(0);
    expect(bindings.generate_lesson_plan).not.toHaveBeenCalled();
  });

  it('student 调教师/管理工具被拦截，调学生工具放行', async () => {
    const r = buildRegistry(bindings);
    expect((await r.call(ctxOf('student'), 'generate_paper', { subject: '数学', grade: '五年级', title: 't' })).error).toBe('无权限调用该工具');
    expect((await r.call(ctxOf('student'), 'generate_document', { format: 'docx', content_md: '---\ntitle: t\nformat: docx\n---\n内容' })).error).toBe('无权限调用该工具');
    expect((await r.call(ctxOf('student'), 'get_class_overview', { classId: 1 })).error).toBe('无权限调用该工具');
    expect((await r.call(ctxOf('student'), 'get_region_overview', {})).error).toBe('无权限调用该工具');
    expect((await r.call(ctxOf('student'), 'list_alerts', {})).error).toBe('无权限调用该工具');
    expect((await r.call(ctxOf('student'), 'get_teacher_profile', { teacherId: 1 })).error).toBe('无权限调用该工具');
    expect((await r.call(ctxOf('student'), 'run_diagnosis', { studentId: 1 })).error).toBeUndefined();
  });

  it('teacher 调教师工具放行，调 admin 工具被拦截', async () => {
    const r = buildRegistry(bindings);
    expect((await r.call(ctxOf('teacher'), 'generate_lesson_plan', { subject: '语文', grade: '五年级', topic: '草船借箭' })).error).toBeUndefined();
    expect((await r.call(ctxOf('teacher'), 'get_region_overview', {})).error).toBe('无权限调用该工具');
    expect((await r.call(ctxOf('teacher'), 'list_alerts', {})).error).toBe('无权限调用该工具');
    expect((await r.call(ctxOf('teacher'), 'get_teacher_profile', { teacherId: 1 })).error).toBe('无权限调用该工具');
  });

  it('预览模式（preview=true）下非 admin 角色可调 admin 工具（跨角色浏览体验）', async () => {
    const r = buildRegistry(bindings);
    const ctx = { ...ctxOf('teacher'), preview: true };
    expect((await r.call(ctx, 'get_region_overview', {})).error).toBeUndefined();
    expect((await r.call(ctx, 'list_alerts', {})).error).toBeUndefined();
    expect((await r.call(ctx, 'get_teacher_profile', { teacherId: 1 })).error).toBeUndefined();
    expect(bindings.get_region_overview).toHaveBeenCalled();
  });

  it('预览模式下学生调 admin 工具同样放行（预览语义，数据范围仍受业务校验）', async () => {
    const r = buildRegistry(bindings);
    const ctx = { ...ctxOf('student'), preview: true };
    expect((await r.call(ctx, 'list_alerts', {})).error).toBeUndefined();
  });

  it('admin 可调全部工具', async () => {
    const r = buildRegistry(bindings);
    expect((await r.call(ctxOf('admin'), 'generate_lesson_plan', { subject: '语文', grade: '五年级', topic: '草船借箭' })).error).toBeUndefined();
    expect((await r.call(ctxOf('admin'), 'get_region_overview', {})).error).toBeUndefined();
    expect((await r.call(ctxOf('admin'), 'list_alerts', {})).error).toBeUndefined();
    expect((await r.call(ctxOf('admin'), 'get_teacher_profile', { teacherId: 1 })).error).toBeUndefined();
  });

  it('toFunctionSchemas 输出 OpenAI 兼容结构', () => {
    const r = buildRegistry(bindings);
    const schemas = r.toFunctionSchemas();
    expect(schemas[0]).toMatchObject({ type: 'function', function: { name: 'run_diagnosis' } });
  });
});

describe('tool pipeline (DSH 五段流水线)', () => {
  it('preExecute deny → 不执行工具，返回拒绝原因', async () => {
    const r = new ToolRegistry().register({
      name: 'probe', description: 'x', inputSchema: {}, execute: async () => 'ok',
    });
    const rec = await r.call(ctxOf('teacher'), 'probe', {}, {
      preExecute: () => ({ kind: 'deny', reason: '策略链拒绝' }),
    });
    expect(rec.error).toContain('策略链拒绝');
    expect(rec.result).toBeUndefined();
  });

  it('preExecute ask 且无审批处理器 → fail-closed 拒绝', async () => {
    const r = new ToolRegistry().register({
      name: 'probe', description: 'x', inputSchema: {}, execute: async () => 'ok',
    });
    const rec = await r.call(ctxOf('teacher'), 'probe', {}, {
      preExecute: () => ({ kind: 'ask', reason: '敏感数据' }),
    });
    expect(rec.error).toContain('fail-closed');
  });

  it('guard 单调否决：只能 deny 不能放行', async () => {
    const r = new ToolRegistry().register({
      name: 'probe', description: 'x', inputSchema: {}, execute: async () => 'ok',
    });
    const rec = await r.call(ctxOf('teacher'), 'probe', {}, {
      guard: () => ({ kind: 'deny', reason: 'guard 拦截' }),
    });
    expect(rec.error).toContain('guard 拦截');
  });

  it('ask + 审批处理器 allowed → 正常执行', async () => {
    const r = new ToolRegistry().register({
      name: 'probe', description: 'x', inputSchema: {}, execute: async () => 'ok',
    });
    r.setApprovalHandler(async () => 'allowed');
    const rec = await r.call(ctxOf('teacher'), 'probe', {}, {
      preExecute: () => ({ kind: 'ask', reason: '需确认' }),
    });
    expect(rec.result).toBe('ok');
  });

  it('ask + 审批处理器 denied → 返回审批被拒绝', async () => {
    const r = new ToolRegistry().register({
      name: 'probe', description: 'x', inputSchema: {}, execute: async () => 'ok',
    });
    r.setApprovalHandler(async () => 'denied');
    const rec = await r.call(ctxOf('teacher'), 'probe', {}, {
      preExecute: () => ({ kind: 'ask', reason: '需确认' }),
    });
    expect(rec.error).toContain('审批被拒绝');
    expect(rec.result).toBeUndefined();
  });

  it('审批处理器抛异常 → fail-closed 拒绝（不穿透 call）', async () => {
    const r = new ToolRegistry().register({
      name: 'probe', description: 'x', inputSchema: {}, execute: async () => 'ok',
    });
    r.setApprovalHandler(async () => { throw new Error('DB 挂了'); });
    const rec = await r.call(ctxOf('teacher'), 'probe', {}, {
      preExecute: () => ({ kind: 'ask', reason: '需确认' }),
    });
    expect(rec.error).toContain('fail-closed');
    expect(rec.result).toBeUndefined();
  });

  it('preExecute deny 后 execute 未被调用', async () => {
    const executed = vi.fn(async () => 'ok');
    const r = new ToolRegistry().register({
      name: 'probe', description: 'x', inputSchema: {}, execute: executed,
    });
    const rec = await r.call(ctxOf('teacher'), 'probe', {}, {
      preExecute: () => ({ kind: 'deny', reason: '策略链拒绝' }),
    });
    expect(rec.error).toContain('策略链拒绝');
    expect(executed).not.toHaveBeenCalled();
  });
});

describe('task 三件套工具', () => {
  const b: ToolBindings = {
    ...bindings,
    task_list: vi.fn(async () => []),
    task_output: vi.fn(async () => ({ state: 'running' })),
    task_stop: vi.fn(async () => ({ stopped: true })),
  };
  const r = buildRegistry(b);

  it('三件套已注册且 schema 完整', () => {
    expect(r.get('task_list')).toBeDefined();
    expect(r.get('task_output')).toBeDefined();
    expect(r.get('task_stop')).toBeDefined();
    const schema = r.toFunctionSchemas().find((s) => s.function.name === 'task_stop');
    expect((schema?.function.parameters as { required?: string[] }).required).toContain('taskId');
  });

  it('task_list 无角色限制但按 runId 隔离（ctx 透传）', async () => {
    const ctx = ctxOf('student');
    await r.call(ctx, 'task_list', {});
    expect(b.task_list).toHaveBeenCalledWith(ctx, undefined);
  });
});

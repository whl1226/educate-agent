import { describe, expect, it, vi } from 'vitest';
import { TeacherService } from '../teacher.service';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { LessonPlan } from '../../../db/entities/teacher.entities';

function stubRepo() {
  return {
    find: vi.fn(),
    findOne: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    increment: vi.fn(),
  } as any;
}

function makeService() {
  const plans = stubRepo();
  const svc = new TeacherService(
    { chat: vi.fn(), isDemo: true } as any,
    { assertClassTeacher: vi.fn(), classStudents: vi.fn(), myClasses: vi.fn() } as any,
    { generateDocument: vi.fn() } as any,
    plans,
    stubRepo(), stubRepo(), stubRepo(), stubRepo(), stubRepo(),
    stubRepo(), stubRepo(), stubRepo(), stubRepo(), stubRepo(),
    stubRepo(), stubRepo(), stubRepo(), stubRepo(), stubRepo(),
    stubRepo(), stubRepo(), stubRepo(), stubRepo(), stubRepo(),
    stubRepo(),
  );
  return { svc, plans };
}

const USER = { id: 7, role: 'teacher', username: 'w', jti: 'j', scopeKey: '7' } as any;
const ADMIN = { id: 1, role: 'admin', username: 'a', jti: 'j', scopeKey: '1' } as any;

function makePlan(overrides: Partial<LessonPlan> = {}): LessonPlan {
  return {
    id: 1,
    teacherId: 7,
    subject: '语文',
    grade: '五年级',
    bookVersion: '人教版',
    topic: '草船借箭',
    periodCount: 2,
    duration: 40,
    adaptation: null,
    supplementary: null,
    content: '{"goals":["知识与能力：…"],"process":[{"stage":"情境导入"}]}',
    outline: '一、教材与学情分析',
    sourceRefs: '[{"title":"教材·人教版","ref":"textbook"}]',
    status: 'active',
    runId: 42,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  } as LessonPlan;
}

describe('TeacherService.lessonPlanDetail', () => {
  it('查到且归属本人 → 返回含 content 的完整实体', async () => {
    const { svc, plans } = makeService();
    plans.findOne.mockResolvedValue(makePlan());
    const plan = await svc.lessonPlanDetail(USER, 1);
    expect(plan).toMatchObject({ id: 1, teacherId: 7, topic: '草船借箭', runId: 42 });
    expect(plan.content).toContain('"goals"');
    expect(plans.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('归属他人（非 admin）→ 抛 SCOPE_FORBIDDEN', async () => {
    const { svc, plans } = makeService();
    plans.findOne.mockResolvedValue(makePlan({ teacherId: 99 }));
    await expect(svc.lessonPlanDetail(USER, 1)).rejects.toMatchObject({ response: { code: ErrorCodes.SCOPE_FORBIDDEN } });
  });

  it('不存在 → 抛 NOT_FOUND', async () => {
    const { svc, plans } = makeService();
    plans.findOne.mockResolvedValue(null);
    await expect(svc.lessonPlanDetail(USER, 404)).rejects.toMatchObject({ response: { code: ErrorCodes.NOT_FOUND } });
  });

  it('admin 访问他人教案 → 放行（越权仅约束非 admin）', async () => {
    const { svc, plans } = makeService();
    plans.findOne.mockResolvedValue(makePlan({ teacherId: 8 }));
    const plan = await svc.lessonPlanDetail({ id: 9, role: 'admin', username: 'a', jti: 'j', scopeKey: '9' } as any, 1);
    expect(plan.id).toBe(1);
    expect(plan.content).toContain('"goals"');
  });
});

describe('TeacherService.generateLessonPlan', () => {
  it('第三参数 runId 透传到落库对象；不传时为 null', async () => {
    const { svc, plans } = makeService();
    plans.create.mockImplementation((e: any) => e);
    const saved: any[] = [];
    plans.save.mockImplementation(async (e: any) => {
      saved.push(e);
      return { id: 1, ...e };
    });
    const input = { subject: '语文', grade: '五年级', topic: '草船借箭' };
    await svc.generateLessonPlan(USER, input, 42);
    await svc.generateLessonPlan(USER, input);
    expect(saved).toHaveLength(2);
    expect(saved[0].runId).toBe(42);
    expect(saved[1].runId).toBeNull();
  });
});

describe('TeacherService.listLessonPlans', () => {
  it('返回条目带 runId 字段透传', async () => {
    const { svc, plans } = makeService();
    plans.find.mockResolvedValue([
      makePlan(),
      makePlan({ id: 2, topic: '少年闰土', runId: null }),
    ]);
    const list = await svc.listLessonPlans(USER);
    expect(list).toEqual([
      { id: 1, subject: '语文', grade: '五年级', topic: '草船借箭', createdAt: expect.any(Date), sourceRefs: [{ title: '教材·人教版', ref: 'textbook' }], runId: 42 },
      { id: 2, subject: '语文', grade: '五年级', topic: '少年闰土', createdAt: expect.any(Date), sourceRefs: [{ title: '教材·人教版', ref: 'textbook' }], runId: null },
    ]);
    expect(plans.find).toHaveBeenCalled();
  });
});

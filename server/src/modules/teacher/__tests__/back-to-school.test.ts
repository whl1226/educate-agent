import { describe, expect, it, vi } from 'vitest';
import { TeacherService } from '../teacher.service';
import { ErrorCodes } from '../../../common/exceptions/error-codes';

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
  const templates = stubRepo();
  const svc = new TeacherService(
    { chat: vi.fn(), isDemo: true } as any,
    { assertClassTeacher: vi.fn(), classStudents: vi.fn(), myClasses: vi.fn() } as any,
    { generateDocument: vi.fn() } as any,
    stubRepo(), stubRepo(), stubRepo(), stubRepo(), stubRepo(),
    stubRepo(), stubRepo(), stubRepo(), stubRepo(), stubRepo(),
    stubRepo(), stubRepo(), stubRepo(), stubRepo(), stubRepo(),
    stubRepo(), stubRepo(), stubRepo(), templates,
    stubRepo(), stubRepo(), stubRepo(),
  );
  return { svc, templates };
}

const USER = { id: 7, role: 'teacher', username: 'w', jti: 'j', scopeKey: '7' } as any;

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 3,
    type: 'lesson_plan',
    name: '五年级语文·精读课文教案模板',
    content: '一、教学目标\n二、教学重难点\n三、教学过程',
    license: '自建',
    ...overrides,
  };
}

describe('TeacherService.backToSchoolPackage', () => {
  it('返回 items 带 id/name/license/preview 且 content 为模板全文', async () => {
    const { svc, templates } = makeService();
    templates.find.mockResolvedValue([
      makeTemplate(),
      makeTemplate({ id: 4, type: 'lessonware', name: '课件结构模板（10 页标准）', content: '封面→学习目标→结束页' }),
      makeTemplate({ id: 5, type: 'parent_meeting', name: '超长模板', content: '甲'.repeat(200) }),
    ]);
    const pkg = await svc.backToSchoolPackage();
    expect(pkg.items).toHaveLength(3);
    const first = pkg.items[0];
    expect(first.id).toBe(3);
    expect(first.name).toBe('五年级语文·精读课文教案模板');
    expect(first.type).toBe('lesson_plan');
    expect(first.license).toBe('自建');
    expect(first.content).toBe('一、教学目标\n二、教学重难点\n三、教学过程');
    expect(first.preview).toBe('一、教学目标\n二、教学重难点\n三、教学过程');
    const long = pkg.items[2];
    expect(long.preview).toHaveLength(120);
    expect(long.preview).toBe('甲'.repeat(120));
    expect(templates.find).toHaveBeenCalledTimes(1);
  });
});

describe('TeacherService.updateBackToSchoolItem', () => {
  it('合法 content → 保存新内容并返回 { ok: true }', async () => {
    const { svc, templates } = makeService();
    templates.findOne.mockResolvedValue(makeTemplate());
    const saved: any[] = [];
    templates.save.mockImplementation(async (e: any) => {
      saved.push(e);
      return e;
    });
    const r = await svc.updateBackToSchoolItem(USER, 3, '新的模板内容\n第二行');
    expect(r).toEqual({ ok: true });
    expect(templates.findOne).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe(3);
    expect(saved[0].content).toBe('新的模板内容\n第二行');
  });

  it('超长 content → 截断到 20000 字符', async () => {
    const { svc, templates } = makeService();
    templates.findOne.mockResolvedValue(makeTemplate());
    const saved: any[] = [];
    templates.save.mockImplementation(async (e: any) => {
      saved.push(e);
      return e;
    });
    const long = '甲'.repeat(30000);
    await svc.updateBackToSchoolItem(USER, 3, long);
    expect(saved[0].content.length).toBe(20000);
  });

  it('空 content → 抛 VALIDATE_ERROR 且不查库', async () => {
    const { svc, templates } = makeService();
    await expect(svc.updateBackToSchoolItem(USER, 3, '   ')).rejects.toMatchObject({
      response: { code: ErrorCodes.VALIDATE_ERROR },
    });
    expect(templates.findOne).not.toHaveBeenCalled();
  });

  it('模板不存在 → 抛 NOT_FOUND', async () => {
    const { svc, templates } = makeService();
    templates.findOne.mockResolvedValue(null);
    await expect(svc.updateBackToSchoolItem(USER, 404, '内容')).rejects.toMatchObject({
      response: { code: ErrorCodes.NOT_FOUND },
    });
    expect(templates.save).not.toHaveBeenCalled();
  });
});
import { describe, expect, it, vi } from 'vitest';
import { TeacherService } from '../teacher.service';
import { SpeechDoc } from '../../../db/entities/teacher.entities';

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
  const docs = stubRepo();
  const svc = new TeacherService(
    { chat: vi.fn(), isDemo: true } as any,
    { assertClassTeacher: vi.fn(), classStudents: vi.fn(), myClasses: vi.fn() } as any,
    { generateDocument: vi.fn() } as any,
    stubRepo(),
    stubRepo(),
    docs,
    stubRepo(), stubRepo(), stubRepo(), stubRepo(), stubRepo(),
    stubRepo(), stubRepo(), stubRepo(), stubRepo(), stubRepo(),
    stubRepo(), stubRepo(), stubRepo(), stubRepo(), stubRepo(),
    stubRepo(), stubRepo(), stubRepo(), stubRepo(),
  );
  return { svc, docs };
}

const USER = { id: 7, role: 'teacher', username: 'w', jti: 'j', scopeKey: '7' } as any;

function makeDoc(overrides: Partial<SpeechDoc> = {}): SpeechDoc {
  return {
    id: 1,
    teacherId: 7,
    docType: '家长会',
    theme: '期中家长会发言稿',
    duration: 15,
    audience: '家长',
    keyPoints: '学习习惯',
    content: '尊敬的各位家长：大家好！……',
    runId: 42,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  } as SpeechDoc;
}

describe('TeacherService.listSpeechDocs', () => {
  it('透传 runId 且保留既有字段；无 runId 时兜底为 null', async () => {
    const { svc, docs } = makeService();
    docs.find.mockResolvedValue([
      makeDoc(),
      makeDoc({ id: 2, theme: '开学家长会发言稿', runId: null }),
    ]);
    const list = await svc.listSpeechDocs(USER);
    expect(list).toEqual([
      {
        id: 1,
        docType: '家长会',
        theme: '期中家长会发言稿',
        duration: 15,
        audience: '家长',
        keyPoints: '学习习惯',
        content: '尊敬的各位家长：大家好！……',
        createdAt: expect.any(Date),
        runId: 42,
      },
      {
        id: 2,
        docType: '家长会',
        theme: '开学家长会发言稿',
        duration: 15,
        audience: '家长',
        keyPoints: '学习习惯',
        content: '尊敬的各位家长：大家好！……',
        createdAt: expect.any(Date),
        runId: null,
      },
    ]);
  });

  it('docType 过滤透传；查询限定本人 + 倒序 + 上限', async () => {
    const { svc, docs } = makeService();
    docs.find.mockResolvedValue([]);
    await svc.listSpeechDocs(USER, '家长会');
    expect(docs.find).toHaveBeenCalledWith({
      where: { teacherId: 7, docType: '家长会' },
      order: { id: 'DESC' },
      take: 50,
    });
  });
});

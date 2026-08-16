import { describe, expect, it, vi } from 'vitest';
import { TeacherService } from '../teacher.service';
import { ErrorCodes } from '../../../common/exceptions/error-codes';
import { Resource } from '../../../db/entities/teacher.entities';

function stubRepo() {
  return {
    find: vi.fn(),
    findOne: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    increment: vi.fn(),
    createQueryBuilder: vi.fn(),
  } as any;
}

/** 链式 QueryBuilder 桩：where/andWhere/orderBy 均返回自身，getMany 由用例控制 */
function stubQb() {
  const qb: any = {
    where: vi.fn(),
    andWhere: vi.fn(),
    orderBy: vi.fn(),
    getMany: vi.fn(),
  };
  qb.where.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  qb.orderBy.mockReturnValue(qb);
  return qb;
}

/** 按 TeacherService 构造器注入顺序补齐 25 个仓库参数；resources=第 9 位，fileRecords=第 25 位 */
function makeService() {
  const resources = stubRepo();
  const fileRecords = stubRepo();
  const svc = new TeacherService(
    { chat: vi.fn(), isDemo: true } as any,
    { assertClassTeacher: vi.fn(), classStudents: vi.fn(), myClasses: vi.fn() } as any,
    { generateDocument: vi.fn() } as any,
    stubRepo(), // 4 plans
    stubRepo(), stubRepo(), stubRepo(), stubRepo(), resources, // 5-9
    stubRepo(), stubRepo(), stubRepo(), stubRepo(), stubRepo(), // 10-14
    stubRepo(), stubRepo(), stubRepo(), stubRepo(), stubRepo(), // 15-19
    stubRepo(), stubRepo(), stubRepo(), stubRepo(), stubRepo(), // 20-24
    fileRecords, // 25
  );
  return { svc, resources, fileRecords };
}

const USER = { id: 7, role: 'teacher', username: 'w', jti: 'j', scopeKey: '7' } as any;

function makeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: 1,
    teacherId: 7,
    type: '教案',
    title: '用字母表示数',
    description: null,
    license: 'CC BY',
    fileId: null,
    downloadCount: 0,
    usageCount: 0,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  } as Resource;
}

describe('TeacherService.listResources', () => {
  it('license 筛选：可见性 base where 含本人 + 开放授权，且追加 license 条件', async () => {
    const { svc, resources } = makeService();
    const qb = stubQb();
    qb.getMany.mockResolvedValue([makeResource()]);
    resources.createQueryBuilder.mockReturnValue(qb);

    const list = await svc.listResources(USER, { license: 'CC BY' });

    expect(list).toHaveLength(1);
    expect(resources.createQueryBuilder).toHaveBeenCalledWith('r');
    expect(qb.where).toHaveBeenCalledWith('r.teacherId = :uid OR r.license IN (:...open)', {
      uid: 7,
      open: ['公开领域', 'CC BY', '共享'],
    });
    expect(qb.andWhere).toHaveBeenCalledWith('r.license = :lic', { lic: 'CC BY' });
    expect(qb.orderBy).toHaveBeenCalledWith('r.createdAt', 'DESC');
  });

  it('q 搜索 → 标题/描述 LIKE 过滤', async () => {
    const { svc, resources } = makeService();
    const qb = stubQb();
    qb.getMany.mockResolvedValue([]);
    resources.createQueryBuilder.mockReturnValue(qb);

    await svc.listResources(USER, { q: '分数' });

    expect(qb.andWhere).toHaveBeenCalledWith('(r.title LIKE :q OR r.description LIKE :q)', { q: '%分数%' });
  });

  it('type 筛选 → 追加 type 条件；不在白名单的 license 不追加', async () => {
    const { svc, resources } = makeService();
    const qb = stubQb();
    qb.getMany.mockResolvedValue([]);
    resources.createQueryBuilder.mockReturnValue(qb);

    await svc.listResources(USER, { type: '视频', license: '盗版' });

    expect(qb.andWhere).toHaveBeenCalledWith('r.type = :type', { type: '视频' });
    expect(qb.andWhere).not.toHaveBeenCalledWith('r.license = :lic', { lic: '盗版' });
  });
});

describe('TeacherService.createResource', () => {
  it('非法 license → 抛 VALIDATE_ERROR', async () => {
    const { svc } = makeService();
    await expect(svc.createResource(USER, { title: 'x', type: '课件', license: '盗版' })).rejects.toMatchObject({
      response: { code: ErrorCodes.VALIDATE_ERROR },
    });
  });

  it('空标题 → 抛 VALIDATE_ERROR', async () => {
    const { svc } = makeService();
    await expect(svc.createResource(USER, { title: '  ', type: '课件', license: '自建' })).rejects.toMatchObject({
      response: { code: ErrorCodes.VALIDATE_ERROR },
    });
  });

  it('合法 license → create 归属 teacherId 并返回保存结果', async () => {
    const { svc, resources } = makeService();
    resources.create.mockImplementation((e: any) => e);
    resources.save.mockResolvedValue({ id: 9 });

    const r = await svc.createResource(USER, { title: '微课：分数基本性质', type: '微课', license: '共享', description: 'd' });

    expect(r).toEqual({ id: 9 });
    expect(resources.create).toHaveBeenCalledWith(
      expect.objectContaining({ teacherId: 7, title: '微课：分数基本性质', type: '微课', license: '共享', description: 'd', fileId: null }),
    );
  });

  it('未填 license 时默认自建（在白名单内）', async () => {
    const { svc, resources } = makeService();
    resources.create.mockImplementation((e: any) => e);
    resources.save.mockResolvedValue({ id: 3 });

    await svc.createResource(USER, { title: '默认授权', type: '教案' });

    expect(resources.create).toHaveBeenCalledWith(expect.objectContaining({ license: '自建' }));
  });

  it('fileId 归属他人（非 admin）→ 抛 SCOPE_FORBIDDEN', async () => {
    const { svc, fileRecords } = makeService();
    fileRecords.findOne.mockResolvedValue({ id: 5, uploaderId: 99 });

    await expect(svc.createResource(USER, { title: 'x', type: '课件', license: '自建', fileId: 5 })).rejects.toMatchObject({
      response: { code: ErrorCodes.SCOPE_FORBIDDEN },
    });
  });

  it('fileId 不存在 → 抛 NOT_FOUND', async () => {
    const { svc, fileRecords } = makeService();
    fileRecords.findOne.mockResolvedValue(null);

    await expect(svc.createResource(USER, { title: 'x', type: '课件', license: '自建', fileId: 404 })).rejects.toMatchObject({
      response: { code: ErrorCodes.NOT_FOUND },
    });
  });
});
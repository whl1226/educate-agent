import { describe, expect, it, vi } from 'vitest';
import { OfficeService } from '../office.service';

function makeService() {
  const save = vi.fn(async (e: any) => ({ id: 99, ...e }));
  const repo = { save, create: (e: any) => e } as any;
  return { svc: new OfficeService(repo), save };
}

const USER = { id: 7, role: 'teacher', username: 'w', jti: 'j', scopeKey: '7' } as any;

describe('OfficeService.generateDocument', () => {
  it('校验失败返回 issues 而非抛错（Agent 自愈依据）', async () => {
    const { svc } = makeService();
    const r = await svc.generateDocument(USER, { format: 'docx', content_md: '# 无 YAML 头' });
    expect(r.valid).toBe(false);
    expect(r.issues!.length).toBeGreaterThan(0);
    expect(r.issues![0]).toHaveProperty('fix');
  });

  it('合法内容生成文件并登记', async () => {
    const { svc, save } = makeService();
    const r = await svc.generateDocument(USER, {
      format: 'docx',
      content_md: '---\ntitle: 教案\nformat: docx\n---\n# 目标\n\n正文。',
    });
    expect(r.valid).toBe(true);
    expect(r.downloadUrl).toMatch(/\/api\/v1\/files\/\d+\/download/);
    expect(r.bytes).toBeGreaterThan(1000);
    expect(save).toHaveBeenCalled();
  });
});

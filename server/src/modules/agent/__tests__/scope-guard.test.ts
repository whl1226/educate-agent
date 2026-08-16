import { describe, expect, it } from 'vitest';
import { assertSelfScope } from '../agent.service';
import type { ToolContext } from '../tool-registry';
import type { JwtUser } from '../../../common/decorators/current-user.decorator';

const ctxOf = (id: number, role: JwtUser['role'] = 'student'): ToolContext => ({
  userId: id,
  role,
  user: { id, username: `u${id}`, role, jti: 'jti', scopeKey: String(id) },
});

describe('assertSelfScope (C1 水平越权防线)', () => {
  it('studentId 与登录用户一致时放行', () => {
    expect(() => assertSelfScope(ctxOf(5), 5)).not.toThrow();
  });

  it('studentId 指向他人时抛 SCOPE_FORBIDDEN（LLM 伪造参数被拒）', () => {
    expect(() => assertSelfScope(ctxOf(5), 6)).toThrow(/无权访问该学生数据/);
  });

  it('studentId 缺失（0/NaN/undefined）一律拒绝', () => {
    expect(() => assertSelfScope(ctxOf(5), 0)).toThrow(/无权访问该学生数据/);
    expect(() => assertSelfScope(ctxOf(5), Number.NaN)).toThrow(/无权访问该学生数据/);
    expect(() => assertSelfScope(ctxOf(5), undefined as never)).toThrow(/无权访问该学生数据/);
  });

  it('管理员查自己数据也受同一规则约束（防越权先于角色判断）', () => {
    expect(() => assertSelfScope(ctxOf(1, 'admin'), 2)).toThrow(/无权访问该学生数据/);
  });
});

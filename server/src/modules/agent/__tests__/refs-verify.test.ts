import { describe, expect, it, vi } from 'vitest';
import { verifyRefsAndFlag } from '../refs-verify';

const retriever = {
  verifyRefs: vi.fn(async (refs: string[]) =>
    refs.map((ref) => ({ ref, valid: ref === 'chunk:1' })),
  ),
};

describe('verifyRefsAndFlag', () => {
  it('剔除无效引用并标记', async () => {
    const out = await verifyRefsAndFlag(retriever as any, ['chunk:1', 'chunk:999']);
    expect(out.validRefs).toEqual(['chunk:1']);
    expect(out.invalidRefs).toEqual(['chunk:999']);
  });
});

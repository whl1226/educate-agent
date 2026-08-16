import { describe, expect, it, vi } from 'vitest';
import { HybridRetriever } from '../hybrid-retriever';
import { HashEmbedding, cosine, l2Normalize } from '../embedding';

describe('embedding utils', () => {
  it('cosine：相同向量=1，正交=0', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it('hash embedding 确定性', async () => {
    const e = new HashEmbedding();
    const a = await e.embed('草船借箭');
    const b = await e.embed('草船借箭');
    expect(a).toEqual(b);
    expect(a).toHaveLength(64);
  });
});

function makeChunksRepo(chunks: Array<{ id: number; embedding: string }>) {
  const withFields = (c: { id: number; embedding: string }) => ({
    id: c.id, title: 't', chapter: null, content: 'c', source: null, embedding: c.embedding,
  });
  return {
    manager: { query: vi.fn(async () => chunks.slice(0, 3).map((c) => ({ id: c.id, bm: -5 - c.id }))) },
    find: vi.fn(async (opts?: any) => {
      if (opts?.select) return chunks.map((c) => ({ id: c.id, embedding: c.embedding }));
      const ids = opts?.where;
      if (Array.isArray(ids)) return chunks.filter((c) => ids.some((w) => w.id === c.id)).map(withFields);
      if (ids?.knowledgePointId) return chunks.filter((c) => [10].includes(c.id)).map(withFields);
      return chunks.map(withFields);
    }),
  } as unknown as any;
}

describe('HybridRetriever', () => {
  it('RRF 融合返回带 ref 片段', async () => {
    const chunks = [
      { id: 1, embedding: JSON.stringify(new HashEmbedding().embed('周瑜妒忌诸葛亮')) },
      { id: 2, embedding: JSON.stringify(new HashEmbedding().embed('祖父的园子自由')) },
    ];
    const kps = { find: vi.fn(async () => [{ id: 10, name: '概括主要内容', description: '' }]) };
    const r = new HybridRetriever(makeChunksRepo(chunks), kps as any, new HashEmbedding());
    const out = await r.retrieve('草船借箭主要内容', 3);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].ref).toMatch(/^chunk:\d+$/);
  });

  it('空查询返回空数组', async () => {
    const r = new HybridRetriever(makeChunksRepo([]), { find: vi.fn(async () => []) } as any, new HashEmbedding());
    expect(await r.retrieve('  ')).toEqual([]);
  });

  it('verifyRefs 只放行真实 chunk', async () => {
    const chunks = [{ id: 1, embedding: '[]' }];
    const kps = { find: vi.fn(async () => []) };
    const r = new HybridRetriever(makeChunksRepo(chunks), kps as any, new HashEmbedding());
    const out = await r.verifyRefs(['chunk:1', 'chunk:999', 'rule:socratic']);
    expect(out).toEqual([
      { ref: 'chunk:1', valid: true },
      { ref: 'chunk:999', valid: false },
      { ref: 'rule:socratic', valid: true },
    ]);
  });
});

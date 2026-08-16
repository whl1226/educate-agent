import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { KnowledgeChunk, KnowledgePoint } from '../../db/entities/knowledge.entities';
import { cosine, l2Normalize, type EmbeddingProvider } from './embedding';

export interface RetrievedChunk {
  id: number;
  title: string;
  chapter: string | null;
  content: string;
  source: string | null;
  score: number;
  ref: string;
}

@Injectable()
export class HybridRetriever {
  private readonly logger = new Logger(HybridRetriever.name);

  constructor(
    @InjectRepository(KnowledgeChunk) private readonly chunks: Repository<KnowledgeChunk>,
    @InjectRepository(KnowledgePoint) private readonly kps: Repository<KnowledgePoint>,
    @Inject('EMBEDDING_PROVIDER') private readonly embedding: EmbeddingProvider,
  ) {}

  /** 倒排：查询词 → chunk 命中数（BM25 近似：词频 + IDF 常量简化） */
  private async bm25Candidates(words: string[], limit: number): Promise<Array<{ id: number; score: number }>> {
    try {
      const q = words.map((w) => `"${w}"`).join(' OR ');
      const rows = await this.chunks.manager.query(
        `SELECT rowid AS id, bm25(knowledge_chunks_fts) AS bm
         FROM knowledge_chunks_fts WHERE knowledge_chunks_fts MATCH ? ORDER BY bm LIMIT ?`,
        [q, limit],
      );
      return (rows as Array<{ id: number; bm: number }>).map((r) => ({ id: r.id, score: -r.bm }));
    } catch {
      this.logger.warn('FTS5 不可用，BM25 通道跳过');
      return [];
    }
  }

  /** 向量通道：全量余弦（数据量 < 10k 时暴力检索可接受且可复现） */
  private async vectorCandidates(queryVec: number[], limit: number): Promise<Array<{ id: number; score: number }>> {
    const all = await this.chunks.find({ select: ['id', 'embedding'] });
    const qn = l2Normalize(queryVec);
    const scored: Array<{ id: number; score: number }> = [];
    for (const c of all) {
      if (!c.embedding) continue;
      try {
        const v = l2Normalize(JSON.parse(c.embedding) as number[]);
        scored.push({ id: c.id, score: cosine(qn, v) });
      } catch { /* 跳过坏向量 */ }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /**
   * 混合检索：BM25 + 向量 双路召回 → RRF 融合 → 图谱命中加权 → 截断。
   * RRF: score = Σ 1/(k + rank)，k=60。
   */
  async retrieve(query: string, topK = 5): Promise<RetrievedChunk[]> {
    const words = query.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').split(/\s+/).filter((w) => w.length >= 2).slice(0, 6);
    if (!words.length) return [];

    const queryVec = await this.embedding.embed(query);
    const [bm25Hits, vecHits] = await Promise.all([
      this.bm25Candidates(words, 10),
      this.vectorCandidates(queryVec, 10),
    ]);

    // RRF 融合
    const rrf = new Map<number, number>();
    for (const [rank, h] of bm25Hits.entries()) rrf.set(h.id, (rrf.get(h.id) ?? 0) + 1 / (60 + rank + 1));
    for (const [rank, h] of vecHits.entries()) rrf.set(h.id, (rrf.get(h.id) ?? 0) + 1 / (60 + rank + 1));

    // 图谱命中加权（查询词命中知识点名 → +0.15）
    const kps = await this.kps.find();
    const hitKpIds = new Set<number>();
    for (const kp of kps) {
      if (words.some((w) => (kp.name || '').includes(w) || (kp.description || '').includes(w))) hitKpIds.add(kp.id);
    }
    let boostFor = new Set<number>();
    if (hitKpIds.size) {
      const boosted = await this.chunks.find({ where: { knowledgePointId: In([...hitKpIds].slice(0, 10)) } });
      boostFor = new Set(boosted.map((c) => c.id));
    }

    const ids = [...rrf.keys()];
    if (!ids.length) return [];
    const chunks = await this.chunks.find({ where: ids.map((id) => ({ id })) });
    const ranked = chunks
      .map((c) => ({
        id: c.id, title: c.title, chapter: c.chapter, content: c.content.slice(0, 500),
        source: c.source, score: (rrf.get(c.id) ?? 0) + (boostFor.has(c.id) ? 0.15 : 0), ref: `chunk:${c.id}`,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    return ranked;
  }

  /** 引用校验：给定 refs，返回真实存在于检索源的子集（防幻觉） */
  async verifyRefs(refs: string[]): Promise<Array<{ ref: string; valid: boolean }>> {
    const ids = refs
      .filter((r) => r.startsWith('chunk:'))
      .map((r) => Number(r.slice(6)))
      .filter((n) => Number.isInteger(n));
    if (!ids.length) return refs.map((r) => ({ ref: r, valid: false }));
    const found = await this.chunks.find({ where: ids.map((id) => ({ id })) });
    const foundIds = new Set(found.map((c) => c.id));
    return refs.map((r) => ({ ref: r, valid: r.startsWith('chunk:') ? foundIds.has(Number(r.slice(6))) : true }));
  }
}

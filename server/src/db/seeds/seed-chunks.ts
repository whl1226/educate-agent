/**
 * 知识块种子：从 textbook_contents 分块生成 knowledge_chunks（含 embedding 向量 + FTS5 索引）。
 * 用法：node -e "require('./dist/db/seeds/seed-chunks.js')" 或经 ts-node
 * 说明：embedding 使用确定性 HashEmbedding（64 维 0/1 特征向量），无外部 Key 可复现；
 *       接入真实 embedding（EMBEDDING_PROVIDER=openai-compatible + key）后自动升级。
 */
import { createConnection, getConnection } from 'typeorm';
import { KnowledgeChunk, TextbookContent, KnowledgePoint } from '../entities/knowledge.entities';
import { HashEmbedding } from '../../modules/knowledge/embedding';
import { loadEnv } from '../../config/env.loader';

loadEnv();

/** 按标点/换行切句，句长 >12 字保留（过滤过短碎片） */
function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, '。')
    .split(/[。！？!?；;]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

async function seed() {
  const dbPath = process.env.DB_ABS || './data/xiangya.db';
  const conn = await createConnection({
    type: 'better-sqlite3',
    database: dbPath,
    entities: [KnowledgeChunk, TextbookContent, KnowledgePoint],
    synchronize: true,
  });
  try {
    const chunkRepo = conn.getRepository(KnowledgeChunk);
    const existing = await chunkRepo.count();
    if (existing > 0) {
      console.log(`[seed-chunks] knowledge_chunks 已有 ${existing} 条，跳过`);
      return;
    }
    const textbooks = await conn.getRepository(TextbookContent).find();
    const kps = await conn.getRepository(KnowledgePoint).find();
    const embedding = new HashEmbedding();
    const chunks: KnowledgeChunk[] = [];
    for (const tb of textbooks) {
      const sentences = splitSentences(tb.content);
      // 标题也作为一块（检索入口）
      const blocks = [tb.title, ...sentences];
      for (let i = 0; i < blocks.length; i++) {
        const vec = await embedding.embed(blocks[i]);
        chunks.push(
          chunkRepo.create({
            textbookId: tb.id,
            knowledgePointId: null,
            title: i === 0 ? tb.title : `${tb.title}·要点${i}`,
            content: blocks[i],
            chapter: tb.chapter ?? null,
            embedding: JSON.stringify(vec),
            source: tb.source ?? null,
          }),
        );
      }
    }
    await chunkRepo.save(chunks);
    console.log(`[seed-chunks] 生成 ${chunks.length} 个知识块（${textbooks.length} 篇课文分块 + 向量化）`);

    // FTS5 索引（供 BM25 粗排通道）
    try {
      await conn.query(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(title, content, content='knowledge_chunks', content_rowid='id')`);
      await conn.query(`INSERT INTO knowledge_chunks_fts(rowid, title, content) SELECT id, title, content FROM knowledge_chunks`);
      await conn.query(`
        CREATE TRIGGER IF NOT EXISTS chunks_fts_insert AFTER INSERT ON knowledge_chunks BEGIN
          INSERT INTO knowledge_chunks_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
        END`);
      console.log('[seed-chunks] FTS5: knowledge_chunks_fts 已建立');
    } catch (e) {
      console.warn('[seed-chunks] FTS5 不可用（跳过 BM25 通道，仅向量检索）:', (e as Error).message);
    }
  } finally {
    await conn.close();
  }
}

seed().catch((e) => {
  console.error('[seed-chunks] 失败:', e);
  process.exit(1);
});

export interface EmbeddingProvider {
  readonly name: string;
  /** 文本 → 向量（长度由模型决定，降级模式固定 64 维） */
  embed(text: string): Promise<number[]>;
}

/** OpenAI 兼容 embedding（通义 text-embedding-v3 / OpenAI 等），需 EMBEDDING_API_KEY */
export class OpenAiEmbedding implements EmbeddingProvider {
  readonly name = 'openai-compatible';
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: text.slice(0, 8000) }),
    });
    if (!res.ok) throw new Error(`embedding API ${res.status}`);
    const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    const vec = json.data?.[0]?.embedding;
    if (!vec) throw new Error('embedding 结果为空');
    return vec;
  }
}

/** 确定性降级：字符哈希特征向量（64 维 0/1），无 Key 可跑、可复现 */
export class HashEmbedding implements EmbeddingProvider {
  readonly name = 'hash-fallback';
  readonly dim = 64;

  embed(text: string): Promise<number[]> {
    const vec = new Array(this.dim).fill(0);
    let seed = 0;
    for (const ch of text) {
      seed = (seed * 31 + ch.codePointAt(0)!) >>> 0;
      vec[seed % this.dim] = 1;
      // 二元组特征增强
      if (ch.codePointAt(0)! > 0x4e00) vec[(seed >>> 3) % this.dim] = 1;
    }
    return Promise.resolve(vec);
  }
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export function l2Normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

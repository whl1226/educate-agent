import type { HybridRetriever } from '../knowledge/hybrid-retriever';

export async function verifyRefsAndFlag(
  retriever: HybridRetriever,
  refs: string[],
): Promise<{ validRefs: string[]; invalidRefs: string[] }> {
  if (!refs.length) return { validRefs: [], invalidRefs: [] };
  const result = await retriever.verifyRefs([...new Set(refs)]);
  const validRefs = result.filter((r) => r.valid).map((r) => r.ref);
  const invalidRefs = result.filter((r) => !r.valid).map((r) => r.ref);
  return { validRefs, invalidRefs };
}

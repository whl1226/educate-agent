export interface BktParams { pL0: number; pT: number; pG: number; pS: number; }
export interface BktObs { correct: boolean; daysSinceLast: number; }
export interface BktResult { mastery: number; confidence: number; evidenceCount: number; }

export const DEFAULT_PARAMS: BktParams = { pL0: 0.15, pT: 0.35, pG: 0.25, pS: 0.15 };

export function forget(prob: number, days: number, pL0: number, rate = 0.05): number {
  if (days <= 0) return prob;
  const w = Math.exp(-rate * days);
  return prob * w + pL0 * (1 - w);
}

/** BKT 前向滤波：预测(遗忘+学习转移) → 观测更新 */
export function bktFilter(obs: BktObs[], params: BktParams = DEFAULT_PARAMS): BktResult {
  let L = params.pL0;
  for (const o of obs) {
    L = forget(L, o.daysSinceLast, params.pL0);
    const predicted = L + (1 - L) * params.pT;
    if (o.correct) {
      const denom = predicted * (1 - params.pS) + (1 - predicted) * params.pG;
      L = (predicted * (1 - params.pS)) / (denom || 1e-9);
    } else {
      const denom = predicted * params.pS + (1 - predicted) * (1 - params.pG);
      L = (predicted * params.pS) / (denom || 1e-9);
    }
  }
  const variance = L * (1 - L);
  return { mastery: round3(L), confidence: round3(Math.max(0, Math.min(1, 1 - 4 * variance))), evidenceCount: obs.length };
}

/** EM 在线拟合（作答 ≥15 条时调用） */
export function fitByEM(obs: BktObs[], init: BktParams = DEFAULT_PARAMS, rounds = 20): BktParams {
  let p = { ...init };
  for (let r = 0; r < rounds; r++) {
    let L = p.pL0;
    const ls: number[] = [L];
    for (const o of obs) {
      L = forget(L, o.daysSinceLast, p.pL0);
      const predicted = L + (1 - L) * p.pT;
      const denom = predicted * (1 - p.pS) + (1 - predicted) * p.pG;
      L = o.correct ? (predicted * (1 - p.pS)) / (denom || 1e-9) : (predicted * p.pS) / ((predicted * p.pS + (1 - predicted) * (1 - p.pG)) || 1e-9);
      ls.push(L);
    }
    const n = Math.max(obs.length, 1);
    const correctCount = obs.filter((o) => o.correct).length;
    const avgL = ls.reduce((s, x) => s + x, 0) / ls.length;
    p = {
      pL0: clamp(avgL, 0.05, 0.6),
      pT: clamp(ls.filter((x) => x > 0.5).length / n, 0.05, 0.6),
      pG: clamp(correctCount / n - 0.1, 0.05, 0.4),
      pS: clamp(1 - correctCount / n - 0.1, 0.05, 0.4),
    };
  }
  return { pL0: round3(p.pL0), pT: round3(p.pT), pG: round3(p.pG), pS: round3(p.pS) };
}

function clamp(x: number, min: number, max: number): number { return Math.min(max, Math.max(min, x)); }
function round3(x: number): number { return Math.round(x * 1000) / 1000; }

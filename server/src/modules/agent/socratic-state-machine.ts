export type SocraticStage = 'read' | 'identify' | 'relate' | 'solve' | 'verify';

export const SOCRATIC_STAGES: SocraticStage[] = ['read', 'identify', 'relate', 'solve', 'verify'];

export interface SocraticState {
  stage: SocraticStage;
  consecutiveStall: number;
  problem: string;
  progress: boolean;
}

export interface SocraticTransition {
  state: SocraticState;
  instruction: string;
  blockedAnswer?: boolean;
  escalate?: boolean;
}

export function createSocraticState(problem: string): SocraticState {
  return { stage: 'read', consecutiveStall: 0, problem, progress: false };
}

export const STAGE_INSTRUCTIONS: Record<SocraticStage, string> = {
  read: '学生刚看到题目。引导他用自己的话说出题目讲了什么、已知条件有哪些。只提问，不给答案。',
  identify: '引导他把已知条件逐条列出来，并说出要求解的目标。每步只问一个问题。',
  relate: '引导他思考条件与目标的关系，提示相关知识点名称（如"分数乘法""多音字"），让他自己建立联系。',
  solve: '引导他说出解题第一步并动手尝试。可以给步骤提示，但绝不直接写出完整答案。',
  verify: '引导他把结果代回原题检查，并总结解题思路。',
};

export function detectFullAnswer(text: string): boolean {
  const clean = text.replace(/\s+/g, '');
  if (/(=\s*[-+]?\d+(\.\d+)?|(答案是|结果是|得到|答案|结果|答)[:：]?\s*[-+]?\d+(\.\d+)?)/.test(clean)) return true;
  if (/^(答案|选|应该选)[:：]?\s*[A-Ea-e]$/.test(clean.trim())) return true;
  if (clean.length > 40 && !clean.includes('？') && !clean.includes('?') && !clean.includes('你')) return true;
  return false;
}

export function hasProgress(studentReply: string): boolean {
  const s = studentReply.trim();
  if (!s || s.length < 2) return false;
  return /\d|已知|条件是|因为|所以|先|第一步|我觉得|答案/.test(s);
}

export function transition(state: SocraticState, studentReply: string): SocraticTransition {
  const advanced = hasProgress(studentReply);
  let stage = state.stage;
  let consecutiveStall = state.consecutiveStall;

  if (advanced) {
    consecutiveStall = 0;
    const idx = SOCRATIC_STAGES.indexOf(stage);
    stage = idx < SOCRATIC_STAGES.length - 1 ? SOCRATIC_STAGES[idx + 1] : stage;
  } else {
    consecutiveStall += 1;
    if (consecutiveStall >= 2) {
      const idx = SOCRATIC_STAGES.indexOf(stage);
      stage = idx > 0 ? SOCRATIC_STAGES[idx - 1] : stage;
    }
  }

  return {
    state: { ...state, stage, consecutiveStall, progress: advanced },
    instruction: STAGE_INSTRUCTIONS[stage],
    escalate: consecutiveStall >= 4,
  };
}

export interface ZpdNode {
  id: number; name: string; parentId: number | null;
  mastery: number; errorCount: number; difficulty: number;
}
export interface ZpdPlanStep {
  knowledgePointId: number;
  stepType: 'review' | 'practice' | 'advance';
  title: string;
  questionCount: number;
}

/** 最近发展区：mastery∈[0.3,0.7] 且父链全部 >=0.6；错题优先→难度低优先 */
export function planZPD(nodes: ZpdNode[], maxSteps = 6): ZpdPlanStep[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ready = nodes.filter((n) => {
    if (n.mastery < 0.3 || n.mastery > 0.7) return false;
    let cur: ZpdNode | undefined = n;
    while (cur?.parentId != null) {
      cur = byId.get(cur.parentId);
      if (!cur || cur.mastery < 0.6) return false;
    }
    return true;
  });
  ready.sort((a, b) => b.errorCount - a.errorCount || a.difficulty - b.difficulty || a.id - b.id);
  const steps: ZpdPlanStep[] = [];
  for (const n of ready.slice(0, Math.ceil(maxSteps / 3))) {
    steps.push({ knowledgePointId: n.id, stepType: 'review', title: `复习：${n.name}`, questionCount: 3 });
    steps.push({ knowledgePointId: n.id, stepType: 'practice', title: `练习：${n.name}`, questionCount: 5 });
    steps.push({ knowledgePointId: n.id, stepType: 'advance', title: `进阶：${n.name}`, questionCount: 2 });
  }
  return steps.slice(0, maxSteps);
}

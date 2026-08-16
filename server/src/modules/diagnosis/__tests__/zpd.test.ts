import { describe, expect, it } from 'vitest';
import { planZPD, type ZpdNode } from '../zpd-planner';

const nodes: ZpdNode[] = [
  { id: 1, name: '识字与写字', parentId: null, mastery: 0.9, errorCount: 0, difficulty: 1 },
  { id: 2, name: '易错多音字', parentId: 1, mastery: 0.4, errorCount: 3, difficulty: 2 },
  { id: 3, name: '形近字辨析', parentId: 1, mastery: 0.55, errorCount: 5, difficulty: 3 },
  { id: 4, name: '阅读与理解', parentId: null, mastery: 0.5, errorCount: 1, difficulty: 2 },
  { id: 5, name: '概括主要内容', parentId: 4, mastery: 0.2, errorCount: 2, difficulty: 3 },
  { id: 6, name: '写作表达', parentId: null, mastery: 0.8, errorCount: 0, difficulty: 4 },
];

describe('planZPD', () => {
  it('只选最近发展区且排除已掌握/前置不足', () => {
    const kpIds = planZPD(nodes).map((s) => s.knowledgePointId);
    expect(kpIds).toContain(2);
    expect(kpIds).toContain(3);
    expect(kpIds).not.toContain(1);
    expect(kpIds).not.toContain(5);
    expect(kpIds).not.toContain(6);
  });
  it('错题多优先，三步型输出', () => {
    const plan = planZPD(nodes, 6);
    expect(plan[0].knowledgePointId).toBe(3);
    expect(plan.map((s) => s.stepType)).toEqual(['review', 'practice', 'advance', 'review', 'practice', 'advance']);
  });
});

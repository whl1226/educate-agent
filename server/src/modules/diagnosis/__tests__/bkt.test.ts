import { describe, expect, it } from 'vitest';
import { bktFilter, fitByEM, forget, DEFAULT_PARAMS } from '../bkt';

describe('bktFilter', () => {
  it('全对序列掌握度单调上升', () => {
    const obs = Array.from({ length: 10 }, () => ({ correct: true, daysSinceLast: 1 }));
    let prev = 0;
    for (let i = 1; i <= obs.length; i++) {
      const r = bktFilter(obs.slice(0, i), DEFAULT_PARAMS);
      expect(r.mastery).toBeGreaterThanOrEqual(prev);
      prev = r.mastery;
    }
    expect(bktFilter(obs).mastery).toBeGreaterThan(0.8);
  });
  it('全错序列掌握度低位', () => {
    const obs = Array.from({ length: 10 }, () => ({ correct: false, daysSinceLast: 1 }));
    expect(bktFilter(obs).mastery).toBeLessThan(0.3);
  });
  it('遗忘衰减与确定性（可复现）', () => {
    const a = bktFilter([{ correct: true, daysSinceLast: 1 }, { correct: true, daysSinceLast: 1 }]);
    const b = bktFilter([{ correct: true, daysSinceLast: 30 }, { correct: true, daysSinceLast: 30 }]);
    expect(b.mastery).toBeLessThan(a.mastery);
    const obs = [{ correct: true, daysSinceLast: 1 }, { correct: false, daysSinceLast: 2 }];
    expect(bktFilter(obs)).toEqual(bktFilter(obs));
  });
});
describe('forget', () => {
  it('间隔 0 不衰减；长间隔趋近先验', () => {
    expect(forget(0.8, 0, 0.15)).toBe(0.8);
    expect(forget(0.8, 1000, 0.15)).toBeLessThan(0.3);
  });
});
describe('fitByEM', () => {
  it('参数范围合法', () => {
    const obs = Array.from({ length: 30 }, () => ({ correct: true, daysSinceLast: 1 }));
    const p = fitByEM(obs);
    expect(p.pL0).toBeGreaterThanOrEqual(0.05);
    expect(p.pL0).toBeLessThanOrEqual(0.6);
  });
});

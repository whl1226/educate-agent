import { describe, expect, it } from 'vitest';
import { createSocraticState, transition, detectFullAnswer, hasProgress, SOCRATIC_STAGES } from '../socratic-state-machine';

describe('detectFullAnswer', () => {
  it('拦截直接给答案', () => {
    expect(detectFullAnswer('答案：25')).toBe(true);
    expect(detectFullAnswer('结果是 48')).toBe(true);
    expect(detectFullAnswer('选 B')).toBe(true);
  });
  it('引导式提问放行', () => {
    expect(detectFullAnswer('你先说说题目里有哪些条件？')).toBe(false);
  });
});

describe('hasProgress', () => {
  it('有实质推进', () => {
    expect(hasProgress('已知小明有 3 个苹果')).toBe(true);
    expect(hasProgress('嗯')).toBe(false);
  });
});

describe('transition', () => {
  it('推进时前进阶段', () => {
    let s = createSocraticState('1+1=?');
    s = transition(s, '已知条件是 1 和 1').state;
    expect(s.stage).toBe('identify');
  });
  it('卡住 2 轮回退阶段', () => {
    let s = createSocraticState('x+3=5');
    s = transition(s, '不知道').state;
    s = transition(s, '不知道').state;
    expect(SOCRATIC_STAGES.indexOf(s.stage)).toBeLessThanOrEqual(SOCRATIC_STAGES.indexOf('read'));
  });
  it('长期无进展转人工', () => {
    let s = createSocraticState('x+3=5');
    for (let i = 0; i < 6; i++) {
      const t = transition(s, '不知道');
      s = t.state;
      if (t.escalate) { expect(t.escalate).toBe(true); return; }
    }
    throw new Error('未触发转人工');
  });
});

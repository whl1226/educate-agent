import { describe, expect, it } from 'vitest';
import { ApprovalService } from '../approval';

function makeSvc() {
  const saved: Array<Record<string, unknown>> = [];
  const repo = {
    save: (e: unknown) => {
      saved.push(e as Record<string, unknown>);
      return Promise.resolve(e);
    },
    create: (o: Record<string, unknown>) => o,
  };
  return { svc: new ApprovalService(repo as never), saved };
}

describe('ApprovalService', () => {
  it('默认策略 never：request 直接 denied（审计对仍写入）', async () => {
    const { svc, saved } = makeSvc();
    const out = await svc.request({ runId: 1, userId: 5, toolName: 'get_weekly_report', callId: 'c1' });
    expect(out).toBe('denied');
    expect(saved.length).toBe(2);
    expect(saved[0].action).toBe('agent.approval.asked');
    expect(saved[1].action).toBe('agent.approval.decided');
  });

  it('policy=ask 且无 UI 应答者 → denied_unavailable（fail-closed）', async () => {
    const { svc } = makeSvc();
    svc.setPolicy('get_weekly_report', 'ask');
    const out = await svc.request({ runId: 1, userId: 5, toolName: 'get_weekly_report', callId: 'c2' });
    expect(out).toBe('denied_unavailable');
  });

  it('session-scope 批准后同 run 同工具免审（Kimi permissionRules）', async () => {
    const { svc } = makeSvc();
    svc.setPolicy('generate_document', 'ask');
    svc.grantSessionScope(9, 'generate_document');
    const out = await svc.request({ runId: 9, userId: 5, toolName: 'generate_document', callId: 'c3' });
    expect(out).toBe('allowed');
    const other = await svc.request({ runId: 10, userId: 5, toolName: 'generate_document', callId: 'c4' });
    expect(other).toBe('denied_unavailable');
  });

  it('policyOf 默认 never，可覆盖', () => {
    const { svc } = makeSvc();
    expect(svc.policyOf('any_tool')).toBe('never');
    svc.setPolicy('any_tool', 'ask');
    expect(svc.policyOf('any_tool')).toBe('ask');
  });

  it('endRun 清理该 run 的 session-scope（runId 隔离，不残留跨 run）', async () => {
    const { svc } = makeSvc();
    svc.setPolicy('generate_document', 'ask');
    svc.grantSessionScope(9, 'generate_document');
    expect(await svc.request({ runId: 9, userId: 5, toolName: 'generate_document', callId: 'c5' })).toBe('allowed');
    svc.endRun(9);
    expect(await svc.request({ runId: 9, userId: 5, toolName: 'generate_document', callId: 'c6' })).toBe('denied_unavailable');
  });
});

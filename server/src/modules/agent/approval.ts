import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../db/entities/system.entities';

export type ApprovalPolicy = 'ask' | 'never';
export type ApprovalOutcome = 'allowed' | 'denied' | 'denied_unavailable';

export interface ApprovalRequest {
  runId: number;
  userId: number;
  toolName: string;
  callId: string;
  reason?: string;
}

/**
 * 审批服务（DSH user-approval seam + Kimi permissionRules 融合）：
 * - 策略：ask（询问，无应答者 fail-closed）/ never（确定性拒绝，无人值守安全）；
 * - session-scope：批准一次，本 run 内同工具免审；
 * - 审计对：approval.asked ↔ approval.decided 成对写 audit_logs（log-only，模型只看到工具结果）。
 */
@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);
  private policyByTool = new Map<string, ApprovalPolicy>();
  private sessionScopes = new Map<number, Set<string>>();

  constructor(@InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>) {}

  setPolicy(toolName: string, policy: ApprovalPolicy): this {
    this.policyByTool.set(toolName, policy);
    return this;
  }

  policyOf(toolName: string): ApprovalPolicy {
    return this.policyByTool.get(toolName) ?? 'never';
  }

  grantSessionScope(runId: number, toolName: string): void {
    let set = this.sessionScopes.get(runId);
    if (!set) {
      set = new Set<string>();
      this.sessionScopes.set(runId, set);
    }
    set.add(toolName);
  }

  hasSessionScope(runId: number, toolName: string): boolean {
    return this.sessionScopes.get(runId)?.has(toolName) ?? false;
  }

  /** run 结束清理该 run 的批准集合，防止 session-scope 跨 run 残留 */
  endRun(runId: number): void {
    this.sessionScopes.delete(runId);
  }

  async request(req: ApprovalRequest): Promise<ApprovalOutcome> {
    const policy = this.policyOf(req.toolName);
    if (policy === 'never') {
      // 确定性拒绝同样保留审计对：被拒工具名+调用方留痕（测试契约：审计对仍写入）
      await this.writeAudit(req.userId, 'agent.approval.asked', req);
      await this.writeAudit(req.userId, 'agent.approval.decided', req, 'denied');
      return 'denied';
    }
    if (this.hasSessionScope(req.runId, req.toolName)) return 'allowed';
    await this.writeAudit(req.userId, 'agent.approval.asked', req);
    const outcome: ApprovalOutcome = 'denied_unavailable';
    await this.writeAudit(req.userId, 'agent.approval.decided', req, outcome);
    return outcome;
  }

  private async writeAudit(userId: number, action: string, req: ApprovalRequest, outcome?: string): Promise<void> {
    await this.logs
      .save(
        this.logs.create({
          userId,
          action,
          module: 'agent',
          targetType: 'tool',
          targetId: req.toolName,
          detail: JSON.stringify({ runId: req.runId, callId: req.callId, reason: req.reason?.slice(0, 200), outcome }),
        }),
      )
      .catch((e) => this.logger.warn(`审计写入失败: ${(e as Error).message}`));
  }
}

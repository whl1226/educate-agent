import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  Alert, AlertDisposal, AlertSignal, ResearchActivity, SchoolResourceStat,
  SuperviseTask, TeacherProfile, TeacherStat,
} from '../../db/entities/admin.entities';
import { School } from '../../db/entities/org.entities';
import { User } from '../../db/entities/auth.entities';
import { AnswerRecord } from '../../db/entities/behavior.entities';
import { JwtUser } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { AIService } from '../ai/ai.service';
import { AuditService } from '../audit/audit.service';
import { demoRegionTrends } from '../ai/demo-content';

@Injectable()
export class AdminService {
  constructor(
    private readonly ai: AIService,
    private readonly audit: AuditService,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    @InjectRepository(AlertSignal) private readonly signals: Repository<AlertSignal>,
    @InjectRepository(AlertDisposal) private readonly disposals: Repository<AlertDisposal>,
    @InjectRepository(SuperviseTask) private readonly tasks: Repository<SuperviseTask>,
    @InjectRepository(TeacherProfile) private readonly profiles: Repository<TeacherProfile>,
    @InjectRepository(TeacherStat) private readonly tstats: Repository<TeacherStat>,
    @InjectRepository(SchoolResourceStat) private readonly rstats: Repository<SchoolResourceStat>,
    @InjectRepository(ResearchActivity) private readonly ractivities: Repository<ResearchActivity>,
    @InjectRepository(School) private readonly orgs: Repository<School>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AnswerRecord) private readonly answers: Repository<AnswerRecord>,
  ) {}

  // ================= A1 区域看板 =================

  async regionOverview() {
    const orgCount = await this.orgs.count();
    const teacherCount = await this.users.count({ where: { role: 'teacher' } });
    const studentCount = await this.users.count({ where: { role: 'student' } });
    const week = new Date(Date.now() - 7 * 86_400_000);
    const activeStudents = await this.answers
      .createQueryBuilder('a')
      .select('COUNT(DISTINCT a.studentId)', 'cnt')
      .where('a.answeredAt > :week', { week })
      .getRawOne<{ cnt: number }>();
    const trends = demoRegionTrends(12);
    return {
      stats: {
        schools: orgCount,
        teachers: teacherCount,
        students: studentCount,
        activeStudents: Number(activeStudents?.cnt ?? 0),
        utilizationRate: Math.min(98, Math.round((Number(activeStudents?.cnt ?? 0) / Math.max(studentCount, 1)) * 100)),
      },
      trends,
      aiUsage: { totalTokens: 0, model: 'demo' },
    };
  }

  // ================= A2 师资台账 =================

  async teacherLedger(schoolId?: number) {
    const where: Record<string, unknown> = {};
    if (schoolId) where.schoolId = schoolId;
    const stats = await this.tstats.find({ where, take: 200 });
    const teacherIds = stats.map((s) => s.teacherId);
    const users = teacherIds.length
      ? await this.users.find({
          where: { id: In(teacherIds) },
          select: ['id', 'displayName', 'username'],
        })
      : [];
    const subjects = ['语文', '数学', '英语', '科学', '体育', '音乐', '美术'];
    return {
      summary: subjects.map((subject) => ({
        subject,
        count: stats.filter((s) => s.subject === subject).length,
        backbone: stats.filter((s) => s.subject === subject && s.isBackbone).length,
      })),
      teachers: stats.map((s) => {
        const u = users.find((x) => x.id === s.teacherId);
        return {
          id: s.id,
          name: u?.displayName ?? `教师#${s.teacherId}`,
          subject: s.subject,
          ageGroup: s.ageGroup,
          education: s.education,
          isBackbone: !!s.isBackbone,
          retireYear: s.retireYear,
        };
      }),
    };
  }

  // ================= A3/A4 预警 =================

  async listAlerts(status?: string, type?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.alertType = type;
    const rows = await this.alerts.find({ where, order: { id: 'DESC' }, take: 100 });
    return rows.map((a) => ({
      id: a.id,
      alertType: a.alertType,
      severity: a.severity,
      title: a.title,
      description: a.description,
      riskScore: a.riskScore,
      status: a.status,
      createdAt: a.createdAt,
      studentId: a.studentId,
      schoolId: a.schoolId,
    }));
  }

  async alertDetail(id: number) {
    const alert = await this.alerts.findOne({ where: { id } });
    if (!alert) throw new BizException(ErrorCodes.NOT_FOUND);
    const signals = await this.signals.find({ where: { alertId: id } });
    const disposals = await this.disposals.find({ where: { alertId: id }, order: { id: 'ASC' } });
    return {
      ...alert,
      signals: signals.map((s) => ({ signalType: s.signalType, value: s.value, evidence: s.evidence })),
      disposals: disposals.map((d) => ({ step: d.step, action: d.action, operatorId: d.operatorId, note: d.note, createdAt: d.createdAt })),
    };
  }

  async resolveAlert(user: JwtUser, id: number, input: { action: string; note?: string }) {
    const alert = await this.alerts.findOne({ where: { id } });
    if (!alert) throw new BizException(ErrorCodes.NOT_FOUND);
    // 已处置的预警不可重复处置
    if (alert.status === 'resolved') throw new BizException(ErrorCodes.CONFLICT, '该预警已处置');
    await this.alerts.update(id, { status: 'resolved', resolvedAt: new Date() });
    const steps = await this.disposals.count({ where: { alertId: id } });
    await this.disposals.save(
      this.disposals.create({
        alertId: id,
        step: steps + 1,
        action: input.action,
        operatorId: user.id,
        note: input.note ?? null,
      }),
    );
    return { ok: true, status: 'resolved' };
  }

  // ================= A5 督导任务 =================

  async superviseTasks(status?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    const rows = await this.tasks.find({ where, order: { id: 'DESC' }, take: 100 });
    return rows.map((t) => ({
      id: t.id,
      taskNo: t.taskNo,
      title: t.title,
      source: t.source,
      owner: t.owner,
      status: t.status,
      deadline: t.deadline,
      archivedAt: t.archivedAt,
    }));
  }

  async createTask(user: JwtUser, input: { title: string; owner?: string; deadline?: string }) {
    if (!input.title) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'title 必填');
    let deadline: Date | null = null;
    if (input.deadline) {
      const parsed = new Date(input.deadline);
      if (Number.isNaN(parsed.getTime())) {
        throw new BizException(ErrorCodes.VALIDATE_ERROR, 'deadline 格式不合法');
      }
      deadline = parsed;
    }
    // 编号用时间戳低位 + 随机段，避免并发重复或软删后编号复用
    const taskNo = `XJ-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const task = await this.tasks.save(
      this.tasks.create({
        taskNo,
        title: input.title,
        source: 'manual',
        owner: input.owner ?? null,
        status: 'todo',
        deadline,
        archivedAt: null,
      }),
    );
    await this.audit.log(user.id, `创建督导任务 ${task.taskNo}「${task.title}」`, 'admin', 'supervise', String(task.id));
    return { id: task.id, taskNo: task.taskNo };
  }

  async updateTask(user: JwtUser, id: number, input: { status?: string; owner?: string }) {
    const task = await this.tasks.findOne({ where: { id } });
    if (!task) throw new BizException(ErrorCodes.NOT_FOUND);
    await this.tasks.update(id, {
      status: input.status ?? task.status,
      owner: input.owner ?? task.owner,
      archivedAt: input.status === 'archived' ? new Date() : task.archivedAt,
    });
    if (input.status) await this.audit.log(user.id, `督导任务 ${task.taskNo} 状态 → ${input.status}`, 'admin', 'supervise', String(task.id));
    return { ok: true };
  }

  // ================= A6 教师画像 =================

  async teacherPortraits() {
    const profiles = await this.profiles.find({ take: 200 });
    const ids = profiles.map((p) => p.teacherId);
    const users = ids.length
      ? await this.users.find({
          where: { id: In(ids) },
          select: ['id', 'displayName', 'username'],
        })
      : [];
    return profiles.map((p) => {
      const u = users.find((x) => x.id === p.teacherId);
      return {
        id: p.id,
        name: u?.displayName ?? `教师#${p.teacherId}`,
        metrics: JSON.parse(p.metrics),
        tags: p.tags ? JSON.parse(p.tags) : [],
        suggestions: p.suggestions,
      };
    });
  }

  /** 单个教师画像（Agent 工具 get_teacher_profile 用，基于 teacher_profiles 包装） */
  async teacherProfile(teacherId: number) {
    const profile = await this.profiles.findOne({ where: { teacherId } });
    if (!profile) throw new BizException(ErrorCodes.NOT_FOUND, '教师画像不存在');
    const u = await this.users.findOne({ where: { id: teacherId }, select: ['id', 'displayName', 'username'] });
    return {
      id: profile.id,
      teacherId,
      name: u?.displayName ?? `教师#${teacherId}`,
      metrics: JSON.parse(profile.metrics),
      tags: profile.tags ? JSON.parse(profile.tags) : [],
      suggestions: profile.suggestions,
    };
  }

  // ================= A7 城乡资源均衡 =================

  async resourceBalance() {
    const rows = await this.rstats.find({ take: 200 });
    const orgs = await this.orgs.find();
    const names = new Map(orgs.map((o) => [o.id, o.name]));
    const withName = rows.map((r) => ({ ...r, schoolName: names.get(r.schoolId) ?? `学校#${r.schoolId}` }));
    const periodAvg = (key: 'teacherRatio' | 'booksPerStudent' | 'bandwidth') => {
      const vals = rows.map((r) => r[key]).filter((v): v is number => v != null);
      return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : 0;
    };
    // 城乡差距：均值相对最优水平的缺口（0 = 无差距，越大差距越大）
    const periodGap = (key: 'teacherRatio' | 'booksPerStudent' | 'bandwidth') => {
      const vals = rows.map((r) => r[key]).filter((v): v is number => v != null);
      if (!vals.length) return 0;
      const max = Math.max(...vals);
      if (max <= 0) return 0;
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      return Math.max(0, Math.round((1 - avg / max) * 100) / 100);
    };
    return {
      rows: withName.map((r) => ({
        schoolId: r.schoolId,
        schoolName: r.schoolName,
        period: r.period,
        mediaCount: r.mediaCount,
        teacherRatio: r.teacherRatio,
        booksPerStudent: r.booksPerStudent,
        budgetLevel: r.budgetLevel,
        bandwidth: r.bandwidth,
      })),
      avg: {
        teacherRatio: periodAvg('teacherRatio'),
        booksPerStudent: periodAvg('booksPerStudent'),
        bandwidth: periodAvg('bandwidth'),
      },
      gap: {
        teacherRatio: periodGap('teacherRatio'),
        books: periodGap('booksPerStudent'),
        bandwidth: periodGap('bandwidth'),
      },
    };
  }

  // ================= 教研活动 =================

  async listActivities(status?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    const rows = await this.ractivities.find({ where, order: { id: 'DESC' }, take: 100 });
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      rangeType: a.rangeType,
      rangeDesc: a.rangeDesc,
      whenDesc: a.whenDesc,
      status: a.status,
      participants: a.participants,
      resultCount: a.resultCount,
      creatorId: a.creatorId,
    }));
  }

  // ================= AI 生成 =================

  async aiGenerate(user: JwtUser, feature: string, input: { topic?: string; data?: string }) {
    const result = await this.ai.chat(
      `你是乡镇教育管理助手，为功能「${feature}」生成简洁可行的方案，300 字以内。`,
      input.data || input.topic || '无输入',
    );
    await this.audit.log(user.id, `AI 生成：${feature}`, 'admin', 'ai', null);
    return { text: result.text, model: result.model };
  }

  // ================= 审计日志 =================

  async auditLogs(
    page = '1',
    pageSize = '20',
    userId?: string,
    action?: string,
    module?: string,
  ) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
    return this.audit.list({
      page: p,
      pageSize: ps,
      userId: userId ? Number(userId) : undefined,
      action,
      module,
    });
  }
}
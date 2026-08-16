import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { And, In, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import {
  FamilyCourse, FamilyCourseProgress, VoiceMessage, WeeklyReport,
} from '../../db/entities/parent.entities';
import { AnswerRecord, Checkin } from '../../db/entities/behavior.entities';
import { JwtUser } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { AIService } from '../ai/ai.service';
import { demoTips } from '../ai/demo-content';
import { OrgService } from '../org/org.service';

@Injectable()
export class ParentService {
  constructor(
    private readonly ai: AIService,
    private readonly org: OrgService,
    @InjectRepository(WeeklyReport) private readonly reports: Repository<WeeklyReport>,
    @InjectRepository(VoiceMessage) private readonly voices: Repository<VoiceMessage>,
    @InjectRepository(FamilyCourse) private readonly courses: Repository<FamilyCourse>,
    @InjectRepository(FamilyCourseProgress) private readonly progresses: Repository<FamilyCourseProgress>,
    @InjectRepository(AnswerRecord) private readonly answers: Repository<AnswerRecord>,
    @InjectRepository(Checkin) private readonly checkins: Repository<Checkin>,
  ) {}

  /** 家长关联的孩子（带班级/教师名） */
  private async childrenOf(user: JwtUser) {
    return this.org.childrenWithTeacher(user.id);
  }

  // ================= P1 脱敏学情周报 =================

  async weeklyReport(user: JwtUser, weekNo?: number) {
    const week = weekNo || this.currentWeekNo();
    const children = (await this.childrenOf(user)).filter((c) => c.studentId != null);
    const result: unknown[] = [];
    for (const child of children) {
      const sid = child.studentId as number;
      let report = await this.reports.findOne({ where: { studentId: sid, weekNo: week } });
      if (!report) report = await this.composeReport(sid, week);
      result.push({
        studentId: sid,
        studentName: child.studentName,
        className: child.className,
        teacherName: child.teacherName,
        weekNo: week,
        totalScore: report.totalScore,
        prevScore: report.prevScore,
        authNote: report.authNote || `数据血缘：依据本周 ${this.countAnswers(sid, week)} 次作答 · 已获家长授权`,
        teacherNote: report.teacherNote,
        masteries: JSON.parse(report.masteries || '[]'),
        footprints: JSON.parse(report.footprints || '[]'),
        status: report.status,
      });
    }
    return { weekNo: week, reports: result };
  }

  /** 指定学生的本周周报（Agent 工具 get_weekly_report 用，带绑定校验） */
  async weeklyReportFor(user: JwtUser, studentId: number) {
    const children = (await this.childrenOf(user)).filter((c) => c.studentId != null);
    const child = children.find((c) => c.studentId === studentId);
    if (!child) throw new BizException(ErrorCodes.SCOPE_FORBIDDEN, '未绑定该学生');
    const week = this.currentWeekNo();
    let report = await this.reports.findOne({ where: { studentId, weekNo: week } });
    if (!report) report = await this.composeReport(studentId, week);
    return {
      weekNo: week,
      studentId,
      studentName: child.studentName,
      className: child.className,
      teacherName: child.teacherName,
      totalScore: report.totalScore,
      prevScore: report.prevScore,
      authNote: report.authNote || `数据血缘：依据本周 ${await this.countAnswers(studentId, week)} 次作答 · 已获家长授权`,
      teacherNote: report.teacherNote,
      masteries: JSON.parse(report.masteries || '[]'),
      footprints: JSON.parse(report.footprints || '[]'),
      status: report.status,
    };
  }

  private currentWeekNo() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    // 统一按"周一为周首"计算（与 weekStart 一致），避免周日作答被漏算/错算
    const dayOffset = (start.getDay() + 6) % 7;
    const firstMonday = new Date(start);
    firstMonday.setDate(1 - dayOffset);
    return Math.floor((now.getTime() - firstMonday.getTime()) / (7 * 86_400_000)) + 1;
  }

  private async countAnswers(studentId: number, weekNo: number) {
    const weekStart = this.weekStart(weekNo);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
    // 半开区间 [start, end)：本周一 00:00 起，下周一 00:00 止，避免相邻两周重复/漏算
    return this.answers.count({ where: { studentId, answeredAt: And(MoreThanOrEqual(weekStart), LessThan(weekEnd)) } });
  }

  private weekStart(weekNo: number) {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const dayOffset = (start.getDay() + 6) % 7;
    const firstMonday = new Date(start);
    firstMonday.setDate(start.getDate() + (dayOffset ? 7 - dayOffset : 0));
    return new Date(firstMonday.getTime() + (weekNo - 1) * 7 * 86_400_000);
  }

  private async composeReport(studentId: number, weekNo: number) {
    const weekStart = this.weekStart(weekNo);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
    const records = await this.answers.find({ where: { studentId, answeredAt: And(MoreThanOrEqual(weekStart), LessThan(weekEnd)) } });
    const checkins = await this.checkins.count({ where: { studentId, checkinDate: And(MoreThanOrEqual(dateKey(weekStart)), LessThan(dateKey(weekEnd))) } });
    const prev = await this.reports.findOne({ where: { studentId, weekNo: weekNo - 1 } });
    const bySubject = new Map<string, { total: number; correct: number }>();
    for (const r of records) {
      const item = bySubject.get(r.subject) || { total: 0, correct: 0 };
      item.total++;
      if (r.isCorrect) item.correct++;
      bySubject.set(r.subject, item);
    }
    const masteries = [...bySubject.entries()].map(([subject, v]) => ({
      subject,
      mastery: Math.round((v.correct / Math.max(v.total, 1)) * 100),
      answerCount: v.total,
    }));
    const totalScore = Math.round(masteries.reduce((s, m) => s + m.mastery, 0) / Math.max(masteries.length, 1));
    const footprints = [
      { date: dateKey(weekEnd), event: `本周完成 ${records.length} 次练习`, type: 'study' },
      { date: dateKey(weekEnd), event: `连续打卡 ${checkins} 天`, type: 'habit' },
    ];
    const report = await this.reports.save(
      this.reports.create({
        studentId,
        weekNo,
        totalScore,
        prevScore: prev?.totalScore ?? null,
        authNote: `数据血缘：依据本周 ${records.length} 次作答 · 已获家长授权`,
        teacherNote: null,
        masteries: JSON.stringify(masteries),
        footprints: JSON.stringify(footprints),
        status: 'published',
      }),
    );
    return report;
  }

  // ================= P2 语音留言（家长→班主任） =================

  async sendVoice(user: JwtUser, input: { text?: string; durationSec?: number; audioFileId?: number; teacherUserId?: number; target?: string }) {
    const text = input.text?.trim();
    let toUserId: number;
    let direction = 'parent';
    let promptNote = '家长留言';
    if (user.role === 'student') {
      const parents = await this.org.parentsOf(user.id);
      if (!parents.length) throw new BizException(ErrorCodes.SCOPE_FORBIDDEN, '未绑定家长');
      toUserId = parents[0].id;
      direction = 'student';
      promptNote = '孩子留言';
    } else {
      const children = await this.childrenOf(user);
      if (!children.length) throw new BizException(ErrorCodes.SCOPE_FORBIDDEN, '无绑定孩子');
      if (input.target === 'student' && children[0].studentId != null) {
        toUserId = children[0].studentId;
      } else {
        // 只能发给绑定孩子的班主任（teacherUserId 客户端提交值仅作白名单内选择，不可指向任意用户）
        const validTeachers = [...new Set(children.map((c) => c.teacherUserId).filter((x): x is number => x != null))];
        if (!validTeachers.length) throw new BizException(ErrorCodes.NOT_FOUND, '班主任未配置');
        const requested = input.teacherUserId;
        toUserId = requested && validTeachers.includes(requested) ? requested : validTeachers[0];
      }
    }
    const message = await this.voices.save(
      this.voices.create({
        fromUserId: user.id,
        toUserId,
        direction,
        durationSec: input.durationSec ?? 0,
        text: text || null,
        audioFileId: input.audioFileId ?? null,
        readAt: null,
      }),
    );
    const aiReply = await this.ai.chat(
      '你是家校沟通助手的回执生成器，为留言生成简洁、有温度的确认回执，100 字以内。',
      text ? `${promptNote}：${text}` : `${promptNote}：发送了一条语音留言`,
    );
    return { id: message.id, ack: aiReply.text, model: aiReply.model };
  }

  async myMessages(user: JwtUser) {
    const sent = await this.voices.find({ where: { fromUserId: user.id }, order: { id: 'DESC' }, take: 50 });
    let received: VoiceMessage[] = [];
    if (user.role === 'student') {
      received = await this.voices.find({ where: { toUserId: user.id }, order: { id: 'DESC' }, take: 50 });
    } else {
      const childList = await this.childrenOf(user);
      const peerIds = [
        ...new Set(
          [
            ...childList.map((c) => c.teacherUserId),
            ...childList.map((c) => c.studentId),
          ].filter((x): x is number => x != null),
        ),
      ];
      received = peerIds.length
        ? await this.voices.find({ where: { toUserId: user.id, fromUserId: In(peerIds) }, order: { id: 'DESC' }, take: 50 })
        : [];
    }
    return {
      sent: sent.map((m) => ({ id: m.id, text: m.text, durationSec: m.durationSec, createdAt: m.createdAt, read: !!m.readAt })),
      received: received.map((m) => ({ id: m.id, text: m.text, durationSec: m.durationSec, createdAt: m.createdAt })),
    };
  }

  // ================= P4 育儿话术 =================

  async tips(user: JwtUser, input: { scene?: string; context?: string }) {
    const child = (await this.childrenOf(user))[0];
    const scene = input.scene ?? 'default';
    const text = demoTips(scene);
    return {
      scene,
      text,
      forChild: child ? child.studentName : '',
    };
  }

  // ================= P5 亲子共学课程 =================

  async listCourses(user: JwtUser) {
    const courses = await this.courses.find({ order: { id: 'ASC' } });
    const progressed = await this.progresses.find({ where: { parentId: user.id } });
    return courses.map((c) => {
      const prog = progressed.find((p) => p.courseId === c.id);
      return {
        id: c.id,
        title: c.title,
        weekday: c.weekday,
        durationMin: c.durationMin,
        content: JSON.parse(c.content || '[]'),
        status: prog?.status ?? 'todo',
        learnedAt: prog?.learnedAt ?? null,
      };
    });
  }

  async completeCourse(user: JwtUser, courseId: number) {
    const course = await this.courses.findOne({ where: { id: courseId } });
    if (!course) throw new BizException(ErrorCodes.NOT_FOUND);
    let prog = await this.progresses.findOne({ where: { parentId: user.id, courseId } });
    if (!prog) {
      prog = await this.progresses.save(
        this.progresses.create({ parentId: user.id, courseId, status: 'done', learnedAt: new Date() }),
      );
    } else {
      await this.progresses.update(prog.id, { status: 'done', learnedAt: new Date() });
    }
    return { ok: true, courseId };
  }

  // ================= P3 大字版入口（服务直达） =================

  async bigModeServices() {
    return [
      { key: 'courses', name: '亲子课程', icon: 'book', path: '/parent.html#serve' },
      { key: 'voice', name: '语音留言', icon: 'microphone', path: '/parent.html#voice' },
      { key: 'report', name: '学情周报', icon: 'chart-line-up', path: '/parent.html#weekly' },
      { key: 'call', name: '联系班主任', icon: 'phone', path: '/parent.html#voice' },
      { key: 'tips', name: '育儿话术', icon: 'lightbulb', path: '/parent.html#tips' },
    ];
  }
}

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}
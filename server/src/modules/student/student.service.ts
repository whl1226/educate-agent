import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, MoreThan, Repository } from 'typeorm';
import {
  AiConversation, AiMessage, Badge, Book, CodeProgress, ReadingPracticeRecord,
  ReadingProgress, VoicePracticeRecord,
} from '../../db/entities/student.entities';
import {
  AnswerRecord, Checkin, HomeworkAssignment, HomeworkSubmission,
} from '../../db/entities/behavior.entities';
import {
  DiagnosisRecord, ErrorBook, InterestProfile, MasterySnapshot, PlanStep, StudyPlan,
} from '../../db/entities/diagnosis.entities';
import { KnowledgePoint, Question, TextbookContent } from '../../db/entities/knowledge.entities';
import { Notification, SystemConfig } from '../../db/entities/system.entities';
import { JwtUser } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { AIService } from '../ai/ai.service';
import { demoCodeRun } from '../ai/demo-content';
import { bktFilter, DEFAULT_PARAMS, fitByEM, type BktObs } from '../diagnosis/bkt';
import { planZPD, type ZpdNode } from '../diagnosis/zpd-planner';
import { createSocraticState, detectFullAnswer, transition, type SocraticState } from '../agent/socratic-state-machine';

@Injectable()
export class StudentService {
  constructor(
    private readonly ai: AIService,
    @InjectRepository(AiConversation) private readonly convs: Repository<AiConversation>,
    @InjectRepository(AiMessage) private readonly msgs: Repository<AiMessage>,
    @InjectRepository(AnswerRecord) private readonly answers: Repository<AnswerRecord>,
    @InjectRepository(DiagnosisRecord) private readonly diags: Repository<DiagnosisRecord>,
    @InjectRepository(MasterySnapshot) private readonly snapshots: Repository<MasterySnapshot>,
    @InjectRepository(ErrorBook) private readonly errors: Repository<ErrorBook>,
    @InjectRepository(StudyPlan) private readonly plans: Repository<StudyPlan>,
    @InjectRepository(PlanStep) private readonly steps: Repository<PlanStep>,
    @InjectRepository(Checkin) private readonly checkins: Repository<Checkin>,
    @InjectRepository(VoicePracticeRecord) private readonly voices: Repository<VoicePracticeRecord>,
    @InjectRepository(ReadingPracticeRecord) private readonly readings: Repository<ReadingPracticeRecord>,
    @InjectRepository(Book) private readonly books: Repository<Book>,
    @InjectRepository(ReadingProgress) private readonly rprogs: Repository<ReadingProgress>,
    @InjectRepository(CodeProgress) private readonly codes: Repository<CodeProgress>,
    @InjectRepository(Badge) private readonly badges: Repository<Badge>,
    @InjectRepository(InterestProfile) private readonly profiles: Repository<InterestProfile>,
    @InjectRepository(Question) private readonly questions: Repository<Question>,
    @InjectRepository(KnowledgePoint) private readonly kps: Repository<KnowledgePoint>,
    @InjectRepository(TextbookContent) private readonly textbooks: Repository<TextbookContent>,
    @InjectRepository(HomeworkAssignment) private readonly hw: Repository<HomeworkAssignment>,
    @InjectRepository(HomeworkSubmission) private readonly subs: Repository<HomeworkSubmission>,
    @InjectRepository(Notification) private readonly notes: Repository<Notification>,
    @InjectRepository(SystemConfig) private readonly cfgs: Repository<SystemConfig>,
  ) {}

  // ================= S1 苏格拉底辅导 =================

  async createTutorSession(user: JwtUser) {
    const conv = await this.convs.save(
      this.convs.create({ userId: user.id, type: 'tutor', title: '苏格拉底辅导', status: 'active' }),
    );
    return { id: conv.id, type: 'tutor' };
  }

  async tutorMessage(user: JwtUser, convId: number, input: { content: string }) {
    const conv = await this.convs.findOne({ where: { id: convId, userId: user.id, type: 'tutor' } });
    if (!conv) throw new BizException(ErrorCodes.NOT_FOUND);
    const userMsg = await this.msgs.save(
      this.msgs.create({ conversationId: conv.id, role: 'user', content: input.content, model: null, kind: 'normal' }),
    );
    const result = await this.ai.chat(
      '你是苏格拉底式辅导老师。规则：绝不给最终答案，只通过三步提问引导，必要时提示知识点出处。',
      `__SOCRATIC__${input.content}`,
    );
    const reply = await this.msgs.save(
      this.msgs.create({
        conversationId: conv.id,
        role: 'assistant',
        content: result.text,
        refs: JSON.stringify([{ title: '教材·五年级·苏格拉底辅导规则', ref: 'rule' }]),
        model: result.model,
        kind: 'normal',
      }),
    );
    return { user: { id: userMsg.id, content: userMsg.content }, reply: { id: reply.id, content: reply.content, refs: JSON.parse(reply.refs!) } };
  }

  // ================= S4 知识问答（RAG + 引用） =================

  async createQaSession(user: JwtUser) {
    const conv = await this.convs.save(
      this.convs.create({ userId: user.id, type: 'qa', title: '知识问答', status: 'active' }),
    );
    return { id: conv.id, type: 'qa' };
  }

  async qaMessage(user: JwtUser, convId: number, input: { content: string }) {
    const conv = await this.convs.findOne({ where: { id: convId, userId: user.id, type: 'qa' } });
    if (!conv) throw new BizException(ErrorCodes.NOT_FOUND);
    const refs = await this.searchTextbook(input.content);
    const result = await this.ai.chat(
      '你是基于教材的知识问答助手，回答必须与教材内容一致，并在末尾标注出处（标题+章节）。',
      `__QA__${input.content}\n参考教材内容：${refs.map((r) => r.content).join('；').slice(0, 800)}`,
    );
    const reply = await this.msgs.save(
      this.msgs.create({
        conversationId: conv.id,
        role: 'assistant',
        content: result.text,
        refs: JSON.stringify(refs.map((r) => ({ title: r.title, ref: r.ref }))),
        model: result.model,
        kind: 'normal',
      }),
    );
    await this.msgs.save(
      this.msgs.create({ conversationId: conv.id, role: 'user', content: input.content, kind: 'normal' }),
    );
    return {
      reply: { id: reply.id, content: reply.content, refs: JSON.parse(reply.refs!) },
    };
  }

  private async searchTextbook(keyword: string) {
    const words = keyword.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').split(/\s+/).filter((w) => w.length >= 2).slice(0, 5);
    if (!words.length) return [];
    try {
      const q = words.map((w) => `"${w}"`).join(' OR ');
      const rows = await this.textbooks.manager.query(
        `SELECT rowid AS id, title, content FROM textbook_contents_fts WHERE textbook_contents_fts MATCH ? LIMIT 3`,
        [q],
      );
      return (rows as Array<{ id: number; title: string; content: string }>).map((r) => ({
        title: r.title,
        content: r.content.slice(0, 200),
        ref: `textbook:${r.id}`,
      }));
    } catch {
      const like = `%${words[0]}%`;
      const rows = await this.textbooks.find({ where: [{ title: Like(like) }, { content: Like(like) }], take: 3 });
      return rows.map((r) => ({ title: r.title, content: r.content.slice(0, 200), ref: `textbook:${r.id}` }));
    }
  }

  // ================= 作答提交（D6 唯一行为源） =================

  async submitAnswer(user: JwtUser, input: { questionId: number; answer: string; durationSec?: number; paperId?: number; source?: string }) {
    const q = await this.questions.findOne({ where: { id: input.questionId } });
    if (!q) throw new BizException(ErrorCodes.NOT_FOUND, '题目不存在');
    // paperId 若提供则必须是真实存在的作业布置，防止随意挂靠污染统计
    if (input.paperId != null) {
      const hw = await this.hw.findOne({ where: { id: input.paperId } });
      if (!hw) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'paperId 不存在');
    }
    const correct = this.checkAnswer(q, input.answer);
    const record = await this.answers.save(
      this.answers.create({
        studentId: user.id,
        questionId: q.id,
        paperId: input.paperId ?? null,
        subject: q.subject,
        knowledgePointId: q.knowledgePointId,
        answer: input.answer,
        isCorrect: correct ? 1 : 0,
        durationSec: input.durationSec ?? 0,
        source: input.source || 'practice',
        answeredAt: new Date(),
      }),
    );
    if (!correct) {
      await this.addToErrorBook(user.id, q, input.answer);
    }
    return { id: record.id, isCorrect: correct, points: correct ? 5 : 0 };
  }

  private checkAnswer(q: Question, answer: string): boolean {
    // 归一化：去空白、小写、全角转半角、去常见标点（含中英文与选项前缀点）
    const norm = (s: string) =>
      s
        .trim()
        .replace(/\s+/g, '')
        .toLowerCase()
        .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
        .replace(/[，。、；：！？·「」『』“”‘’（）《》〈〉〔〕【】,.;:!?'"()[\]{}<>~`_-]/g, '')
        .replace(/^[a-e]\./i, '');
    return norm(q.answer) === norm(answer);
  }

  // ================= S6 练习取题（不泄露答案） =================

  async practiceQuestions(user: JwtUser, knowledgePointId?: number, count = 3, subject?: string) {
    void user;
    const where: Record<string, unknown> = { grade: '五年级' };
    if (knowledgePointId) where.knowledgePointId = knowledgePointId;
    if (subject) where.subject = subject;
    const qs = await this.questions.find({ where, order: { id: 'ASC' }, take: Math.min(Math.max(count, 1), 10) });
    return qs.map((q) => ({
      id: q.id,
      stem: q.stem,
      options: q.options ? JSON.parse(q.options) : null,
      type: q.type,
      subject: q.subject,
      knowledgePointId: q.knowledgePointId,
      difficulty: q.difficulty,
    }));
  }

  private async addToErrorBook(studentId: number, q: Question, wrongAnswer: string) {
    const existing = await this.errors.findOne({ where: { studentId, questionId: q.id } });
    if (existing) {
      await this.errors.update(existing.id, { wrongAnswer });
      return;
    }
    await this.errors.save(
      this.errors.create({
        studentId,
        questionId: q.id,
        errorType: '知识点不牢',
        wrongAnswer,
        reviewCount: 0,
        mastered: 0,
      }),
    );
  }

  // ================= S3 认知诊断 =================

  async runDiagnosis(user: JwtUser) {
    const records = await this.answers.find({ where: { studentId: user.id }, order: { answeredAt: 'ASC' } });
    // 同一道题重复提交只取最近一次作答，防止刷分扭曲掌握度
    const byQuestion = new Map<number, (typeof records)[number]>();
    for (const r of records) byQuestion.set(r.questionId, r);
    const unique = [...byQuestion.values()];
    // 按知识点分组构造 BKT 观测序列（已按时间升序，daysSinceLast 取相邻作答间隔）
    const byKp = new Map<number, { obs: BktObs[]; lastAt: number }>();
    for (const r of unique) {
      const item = byKp.get(r.knowledgePointId) ?? { obs: [], lastAt: 0 };
      item.obs.push({
        correct: !!r.isCorrect,
        daysSinceLast: item.lastAt ? Math.max(0, Math.round((r.answeredAt.getTime() - item.lastAt) / 86_400_000)) : 0,
      });
      item.lastAt = r.answeredAt.getTime();
      byKp.set(r.knowledgePointId, item);
    }
    const kpRows = await this.kps.find();
    const dims = [...byKp.entries()].map(([kpId, item]) => {
      const kp = kpRows.find((k) => k.id === kpId);
      const useEm = item.obs.length >= 15;
      const params = useEm ? fitByEM(item.obs) : DEFAULT_PARAMS;
      const r = bktFilter(item.obs, params);
      return {
        knowledgePointId: kpId,
        name: kp?.name ?? `知识点#${kpId}`,
        mastery: Math.round(r.mastery * 100),
        confidence: r.confidence,
        evidenceCount: r.evidenceCount,
        paramSource: useEm ? 'em' : 'default',
      };
    });
    const overall = dims.length ? Math.round(dims.reduce((s, d) => s + d.mastery, 0) / dims.length) : 0;
    const confidence = dims.length ? Math.round((dims.reduce((s, d) => s + d.confidence, 0) / dims.length) * 1000) / 1000 : 0.5;
    const now = new Date();
    const diag = await this.diags.save(
      this.diags.create({
        studentId: user.id,
        trigger: 'manual',
        answerCount: unique.length,
        overallMastery: overall,
        confidence,
        summary: dims.length
          ? `本次诊断基于 ${unique.length} 道题的去重作答，整体掌握度 ${overall}%。薄弱点：${dims.filter((d) => d.mastery < 60).map((d) => d.name).slice(0, 3).join('、') || '暂无'}。`
          : '暂无作答数据，完成练习后再进行诊断。',
        computedAt: now,
      }),
    );
    await this.snapshots.save(
      dims.map((d) =>
        this.snapshots.create({
          studentId: user.id,
          knowledgePointId: d.knowledgePointId,
          mastery: d.mastery / 100,
          confidence: d.confidence,
          errorType: d.mastery < 60 ? '掌握不足' : null,
          evidenceCount: d.evidenceCount,
          computedAt: now,
        }),
      ),
    );
    return { id: diag.id, overallMastery: overall, dims, summary: diag.summary, confidence: diag.confidence, computedAt: now };
  }

  async latestDiagnosis(user: JwtUser) {
    const diag = await this.diags.findOne({ where: { studentId: user.id }, order: { id: 'DESC' } });
    if (!diag) return null;
    const snapshots = await this.snapshots.find({ where: { studentId: user.id } });
    const kps = await this.kps.find();
    const latest = new Map<number, MasterySnapshot>();
    for (const s of snapshots) {
      const prev = latest.get(s.knowledgePointId);
      if (!prev || s.computedAt.getTime() > prev.computedAt.getTime()) latest.set(s.knowledgePointId, s);
    }
    const dims = [...latest.values()]
      .map((s) => {
        const kp = kps.find((k) => k.id === s.knowledgePointId);
        return {
          knowledgePointId: s.knowledgePointId,
          name: kp?.name ?? `知识点#${s.knowledgePointId}`,
          mastery: Math.round(s.mastery * 100),
          confidence: s.confidence,
          evidenceCount: s.evidenceCount,
        };
      })
      .sort((a, b) => a.mastery - b.mastery);
    return { id: diag.id, overallMastery: diag.overallMastery, confidence: diag.confidence, summary: diag.summary, dims, computedAt: diag.computedAt };
  }

  // ================= S5 错题本 =================

  async errorBook(user: JwtUser) {
    const rows = await this.errors.find({ where: { studentId: user.id }, order: { id: 'DESC' }, take: 100 });
    const qs = rows.length ? await this.questions.find({ where: { id: In(rows.map((r) => r.questionId)) } }) : [];
    return rows.map((r) => {
      const q = qs.find((x) => x.id === r.questionId);
      return {
        id: r.id,
        questionId: r.questionId,
        stem: q?.stem,
        answer: q?.answer,
        analysis: q?.analysis,
        errorType: r.errorType,
        wrongAnswer: r.wrongAnswer,
        reviewCount: r.reviewCount,
        mastered: !!r.mastered,
      };
    });
  }

  async reviewError(user: JwtUser, id: number, input: { mastered?: boolean }) {
    const row = await this.errors.findOne({ where: { id, studentId: user.id } });
    if (!row) throw new BizException(ErrorCodes.NOT_FOUND);
    // mastered 显式写入布尔值（允许取消"已掌握"标记）
    await this.errors.update(id, {
      reviewCount: row.reviewCount + 1,
      mastered: input.mastered ? 1 : 0,
      lastReviewedAt: new Date(),
    });
    return { ok: true };
  }

  async errorReviewPlan(user: JwtUser) {
    const rows = await this.errors.find({ where: { studentId: user.id, mastered: 0 }, order: { id: 'ASC' }, take: 20 });
    return rows.map((r, i) => ({
      errorId: r.id,
      order: i + 1,
      day: `第 ${Math.floor(i / 3) + 1} 天`,
      task: `复习错题 #${r.id}（${r.errorType}）并重做`,
    }));
  }

  // ================= S6 学习计划 =================

  async studyPlan(user: JwtUser) {
    const plans = await this.plans.find({ where: { studentId: user.id, status: 'active' }, order: { id: 'DESC' } });
    const withSteps = await Promise.all(
      plans.map(async (p) => ({
        id: p.id,
        title: p.title,
        weekNo: p.weekNo,
        progress: p.progress,
        steps: (await this.steps.find({ where: { planId: p.id }, order: { id: 'ASC' } })).map((s) => ({
          id: s.id,
          title: s.title,
          stepType: s.stepType,
          status: s.status,
          mastery: s.mastery,
          progress: s.completedQuestionCount / Math.max(s.questionCount, 1),
        })),
      })),
    );
    return withSteps;
  }

  async generatePlan(user: JwtUser, input: { title?: string; weekNo?: number }) {
    // 归档旧的有效计划，保证同一时间只有一个 active 计划
    await this.plans.update({ studentId: user.id, status: 'active' }, { status: 'archived' });
    const snapshots = await this.snapshots.find({ where: { studentId: user.id } });
    const kps = await this.kps.find({ where: { subject: '语文', grade: '五年级' } });
    // 取每个知识点最近一次掌握度快照
    const latest = new Map<number, MasterySnapshot>();
    for (const s of snapshots) {
      const prev = latest.get(s.knowledgePointId);
      if (!prev || s.computedAt.getTime() > prev.computedAt.getTime()) latest.set(s.knowledgePointId, s);
    }
    // 错题按题目关联知识点统计（error_book 无 knowledge_point_id，需 join question）
    const errors = await this.errors.find({ where: { studentId: user.id, mastered: 0 } });
    const errQs = errors.length ? await this.questions.find({ where: { id: In(errors.map((e) => e.questionId)) } }) : [];
    const errorCount = new Map<number, number>();
    for (const e of errors) {
      const q = errQs.find((x) => x.id === e.questionId);
      if (q) errorCount.set(q.knowledgePointId, (errorCount.get(q.knowledgePointId) ?? 0) + 1);
    }
    const nodes: ZpdNode[] = kps.map((kp) => ({
      id: kp.id,
      name: kp.name,
      parentId: kp.parentId,
      mastery: latest.get(kp.id)?.mastery ?? 0.5,
      errorCount: errorCount.get(kp.id) ?? 0,
      difficulty: 3,
    }));
    const planSteps = planZPD(nodes, 6);
    if (!planSteps.length && kps.length) {
      // 无发展区节点：直接复习最弱知识点
      const weak = [...kps].sort((a, b) => (latest.get(a.id)?.mastery ?? 1) - (latest.get(b.id)?.mastery ?? 1))[0];
      planSteps.push({ knowledgePointId: weak.id, stepType: 'review', title: `复习：${weak.name}`, questionCount: 3 });
    }
    const plan = await this.plans.save(
      this.plans.create({
        studentId: user.id,
        title: input.title || `第${input.weekNo || 1}周学习计划`,
        weekNo: input.weekNo || 1,
        progress: 0,
        status: 'active',
      }),
    );
    await this.steps.save(
      planSteps.map((s, i) =>
        this.steps.create({
          planId: plan.id,
          knowledgePointId: s.knowledgePointId,
          stepType: s.stepType,
          title: s.title,
          status: i === 0 ? 'active' : 'wait',
          mastery: null,
          questionCount: s.questionCount,
          completedQuestionCount: 0,
        }),
      ),
    );
    return { id: plan.id, title: plan.title, stepCount: planSteps.length };
  }

  async answerPlanStep(user: JwtUser, stepId: number, input: { correct: boolean }) {
    const step = await this.steps.findOne({ where: { id: stepId } });
    if (!step) throw new BizException(ErrorCodes.NOT_FOUND);
    const plan = await this.plans.findOne({ where: { id: step.planId, studentId: user.id } });
    if (!plan) throw new BizException(ErrorCodes.SCOPE_FORBIDDEN);
    const done = Math.min(step.completedQuestionCount + 1, step.questionCount);
    // mastery 钳制在 0~1，防止 questionCount 较大时超过 100%
    const mastery = input.correct ? Math.min(1, 0.6 + done * 0.1) : Math.max(0.2, (step.mastery ?? 0.5) - 0.1);
    await this.steps.update(step.id, { completedQuestionCount: done, mastery });
    if (done >= step.questionCount) {
      await this.steps.update(step.id, { status: 'done' });
      // 解锁下一步
      const all = await this.steps.find({ where: { planId: plan.id }, order: { id: 'ASC' } });
      const doneIndex = all.findIndex((s) => s.id === step.id);
      const next = all[doneIndex + 1];
      if (next && next.status === 'wait') {
        await this.steps.update(next.id, { status: 'active' });
      }
      const doneCount = all.filter((s) => s.status === 'done' || s.id === step.id).length;
      await this.plans.update(plan.id, { progress: Math.round((doneCount / all.length) * 100) });
    }
    return { ok: true, progress: Math.min(1, done / step.questionCount) };
  }

  // ================= S7 打卡 =================

  /** 本地时区日期键（YYYY-MM-DD），避免 UTC 日期导致本地 0~8 点打卡错位 */
  private dateKey(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** 连续打卡天数：从今天（或昨天）往前数连续的天数 */
  private async calcStreak(studentId: number): Promise<number> {
    const rows = await this.checkins.find({ where: { studentId }, order: { checkinDate: 'DESC' }, take: 400 });
    const set = new Set(rows.map((r) => r.checkinDate));
    const d = new Date();
    if (!set.has(this.dateKey(d))) d.setDate(d.getDate() - 1);
    let streak = 0;
    while (set.has(this.dateKey(d))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  async checkin(user: JwtUser, input: { note?: string }) {
    const today = this.dateKey();
    const exists = await this.checkins.findOne({ where: { studentId: user.id, checkinDate: today } });
    if (exists) throw new BizException(ErrorCodes.CONFLICT, '今天已打卡');
    const row = await this.checkins.save(
      this.checkins.create({ studentId: user.id, checkinDate: today, points: 10, note: input.note ?? null }),
    );
    const streak = await this.calcStreak(user.id);
    if (streak >= 7) {
      const hasBadge = await this.badges.findOne({ where: { studentId: user.id, code: 'streak7' } });
      if (!hasBadge) {
        await this.badges.save(this.badges.create({ studentId: user.id, code: 'streak7', name: '连续打卡 7 天' }));
      }
    }
    return { id: row.id, points: row.points, streak };
  }

  async checkinMonth(user: JwtUser, month: string) {
    const key = /^\d{4}-\d{2}$/.test(month) ? month : this.dateKey().slice(0, 7);
    const rows = await this.checkins.find({ where: { studentId: user.id, checkinDate: Like(`${key}%`) }, order: { checkinDate: 'ASC' } });
    const totalPoints = rows.reduce((s, r) => s + r.points, 0);
    return { days: rows.map((r) => r.checkinDate), count: rows.length, totalPoints };
  }

  // ================= S8 英语听说 =================

  async voicePractice(user: JwtUser, input: { sentence: string; score?: number; fluency?: number; accuracy?: number }) {
    // 评分引擎未接入（演示模式）：分数一律由服务端生成，不信任客户端自报值（防刷分）
    const score = Math.round(60 + Math.random() * 35);
    const fluency = Math.round(60 + Math.random() * 30);
    const accuracy = Math.round(60 + Math.random() * 30);
    const row = await this.voices.save(
      this.voices.create({
        studentId: user.id,
        sentence: input.sentence,
        score,
        fluency,
        accuracy,
        practicedAt: new Date(),
      }),
    );
    return { id: row.id, score: row.score, fluency: row.fluency, accuracy: row.accuracy };
  }

  async voiceScore(user: JwtUser) {
    const rows = await this.voices.find({ where: { studentId: user.id }, order: { id: 'DESC' }, take: 20 });
    const avg = (k: keyof VoicePracticeRecord) =>
      rows.length ? Math.round(rows.reduce((s, r) => s + (r[k] as number || 0), 0) / rows.length) : 0;
    return { count: rows.length, avgScore: avg('score'), avgFluency: avg('fluency'), avgAccuracy: avg('accuracy'), latest: rows[0] ?? null };
  }

  // ================= S9 语文朗读 =================

  async readingPractice(user: JwtUser, input: { poem: string; score?: number; weakSyllables?: string[] }) {
    // 评分引擎未接入：分数由服务端生成，忽略客户端自报值（防刷分）
    const score = Math.round(70 + Math.random() * 25);
    const row = await this.readings.save(
      this.readings.create({
        studentId: user.id,
        poem: input.poem,
        score,
        weakSyllables: input.weakSyllables ? JSON.stringify(input.weakSyllables) : null,
        practicedAt: new Date(),
      }),
    );
    return { id: row.id, score: row.score };
  }

  async readingScore(user: JwtUser) {
    const rows = await this.readings.find({ where: { studentId: user.id }, order: { id: 'DESC' }, take: 20 });
    return {
      count: rows.length,
      avgScore: rows.length ? Math.round(rows.reduce((s, r) => s + (r.score ?? 0), 0) / rows.length) : 0,
      latest: rows[0] ?? null,
    };
  }

  // ================= S10 分级阅读 =================

  async listBooks(grade?: string) {
    const where: Record<string, unknown> = {};
    if (grade) where.grade = grade;
    return (await this.books.find({ where, take: 100 })).map((b) => ({
      id: b.id, title: b.title, level: b.level, grade: b.grade, chapters: b.chapters, excerpt: b.excerpt,
    }));
  }

  async bookDetail(user: JwtUser, id: number) {
    const book = await this.books.findOne({ where: { id } });
    if (!book) throw new BizException(ErrorCodes.NOT_FOUND);
    const progress = await this.rprogs.findOne({ where: { studentId: user.id, bookId: id } });
    return { ...book, content: JSON.parse(book.content), progress: progress ?? null };
  }

  async readingProgress(user: JwtUser, input: { bookId: number; chapter?: number; minutes?: number }) {
    const book = await this.books.findOne({ where: { id: input.bookId } });
    if (!book) throw new BizException(ErrorCodes.NOT_FOUND);
    let prog = await this.rprogs.findOne({ where: { studentId: user.id, bookId: input.bookId } });
    if (!prog) {
      prog = await this.rprogs.save(
        this.rprogs.create({ studentId: user.id, bookId: input.bookId, chapter: 0, status: 'reading', minutes: 0, points: 0 }),
      );
    }
    const prevFinished = prog.status === 'finished';
    const minutes = (prog.minutes || 0) + Math.max(0, input.minutes ?? 0);
    const chapter = Math.min(input.chapter ?? prog.chapter + 1, book.chapters);
    const done = chapter >= book.chapters;
    // 完成奖励仅首次发放：已读完的书重复上报不再累计积分
    const points = (prog.points || 0) + (input.minutes ? Math.floor(Math.max(0, input.minutes) / 5) : 0) + (done && !prevFinished ? 20 : 0);
    await this.rprogs.update(prog.id, { minutes, chapter, status: done ? 'finished' : 'reading', points });
    if (done && !prevFinished) {
      const hasBadge = await this.badges.findOne({ where: { studentId: user.id, code: `book_${book.id}` } });
      if (!hasBadge) {
        await this.badges.save(this.badges.create({ studentId: user.id, code: `book_${book.id}`, name: `读完《${book.title}》` })).catch(() => undefined);
      }
    }
    return { chapter, minutes, points, finished: done };
  }

  async readingQuiz(user: JwtUser, input: { bookId: number; answers: number[] }) {
    const book = await this.books.findOne({ where: { id: input.bookId } });
    if (!book) throw new BizException(ErrorCodes.NOT_FOUND);
    const quiz = book.quiz ? (JSON.parse(book.quiz) as Array<{ q: string; answer: number }>) : [];
    if (!quiz.length) return { total: 0, correct: 0, passed: false, message: '本书暂无读后问答' };
    const correct = quiz.filter((item, i) => item.answer === input.answers[i]).length;
    return { total: quiz.length, correct, passed: correct >= Math.ceil(quiz.length / 2) };
  }

  // ================= S11 心理轻提醒（不诊断） =================

  async lightReminder(user: JwtUser) {
    const week = new Date(Date.now() - 7 * 86_400_000);
    const count = await this.answers.count({ where: { studentId: user.id, answeredAt: MoreThan(week) } });
    const notes = await this.notes.find({ where: { userId: user.id, type: 'care' }, order: { id: 'DESC' }, take: 3 });
    const gentle = count < 3;
    return {
      triggered: gentle,
      title: gentle ? '近一周作答较少，别忘了每天动动手哦' : '状态不错，继续保持',
      advice: gentle ? '可以找一道喜欢的题练练手，或者和老师说说最近的感受。' : '保持节奏，劳逸结合。',
      careNotes: notes.map((n) => ({ title: n.title, content: n.content, createdAt: n.createdAt })),
    };
  }

  // ================= S12 编程启蒙 =================

  async codeTasks(user: JwtUser) {
    const prog = await this.codes.findOne({ where: { studentId: user.id } });
    const tasks = [
      { id: 1, name: '直线前进', desc: '让角色走 3 步到达终点' },
      { id: 2, name: '转弯寻宝', desc: '前进 2 步，左转，再前进 3 步' },
      { id: 3, name: '重复的力量', desc: '用"重复"指令走回字形' },
    ];
    return { tasks, current: prog ? { level: prog.level, taskId: prog.taskId, stars: prog.stars } : { level: 1, taskId: 1, stars: 0 } };
  }

  async codeRun(user: JwtUser, input: { script: string; taskId?: number }) {
    const result = demoCodeRun(input.script);
    if (result.passed) {
      let prog = await this.codes.findOne({ where: { studentId: user.id } });
      if (!prog) {
        prog = await this.codes.save(
          this.codes.create({ studentId: user.id, level: 1, taskId: 1, status: 'active', stars: 0 }),
        );
      }
      await this.codes.update(prog.id, { stars: Math.min(3, prog.stars + 1), taskId: input.taskId ?? prog.taskId, status: 'active' });
    }
    return result;
  }

  // ================= S13 苏格拉底状态机（无状态 turn） =================

  /**
   * 苏格拉底辅导一轮：默认从 createSocraticState(problem) 起走一次 transition；
   * 传入上轮返回的 state 则从该阶段续走（I7：状态机有状态，不再每轮从 read 起步）。
   */
  async socraticTurn(problem: string, studentReply: string, state?: SocraticState) {
    const s = state ?? createSocraticState(problem);
    const t = transition(s, studentReply);
    // 调 AI 生成引导语（demo 模式规则话术）
    const result = await this.ai.chat(
      `你是苏格拉底式辅导老师。规则：绝不给最终答案。\n${t.instruction}\n【问题】${problem}`,
      studentReply,
    );
    let text = result.text;
    if (detectFullAnswer(text)) {
      text = `我们先不急着下结论。你先说说：${problem} 里有哪些已知条件？它们之间可能有什么关系？`;
    }
    return {
      stage: t.state.stage,
      text,
      escalate: t.escalate,
      refs: [{ title: `辅导阶段：${t.state.stage}`, ref: `socratic:${t.state.stage}` }],
      state: t.state,
    };
  }

  // ================= 首页聚合 =================

  async home(user: JwtUser) {
    const today = this.dateKey();
    const [checkinToday, streak, badges, plan, hws, monthPoints, weekAnswers] = await Promise.all([
      this.checkins.findOne({ where: { studentId: user.id, checkinDate: today } }),
      this.calcStreak(user.id),
      this.badges.find({ where: { studentId: user.id }, take: 20 }),
      this.plans.findOne({ where: { studentId: user.id, status: 'active' }, order: { id: 'DESC' } }),
      this.subs.find({ where: { studentId: user.id, status: 'pending' }, take: 10 }),
      this.checkins
        .find({ where: { studentId: user.id, checkinDate: Like(`${today.slice(0, 7)}%`) } })
        .then((rows) => rows.reduce((s, r) => s + r.points, 0)),
      this.answers.count({ where: { studentId: user.id, answeredAt: MoreThan(new Date(Date.now() - 7 * 86_400_000)) } }),
    ]);
    const assignments = hws.length
      ? await this.hw.find({ where: { id: In(hws.map((h) => h.assignmentId)) } })
      : [];
    const mastery = await this.latestDiagnosis(user);
    return {
      greeting: new Date().getHours() < 12 ? '早上好' : new Date().getHours() < 18 ? '下午好' : '晚上好',
      checkin: { today: !!checkinToday, streak },
      badges: badges.map((b) => ({ code: b.code, name: b.name })),
      plan: plan ? { id: plan.id, title: plan.title, progress: plan.progress } : null,
      homework: assignments.map((a) => ({ id: a.id, title: a.title, subject: a.subject, deadline: a.deadline })),
      mastery: mastery ? { overall: mastery.overallMastery, summary: mastery.summary } : null,
      stats: { points: monthPoints, answersThisWeek: weekAnswers, streak },
    };
  }

  // ================= 兴趣画像 =================

  async interestProfile(user: JwtUser, input: { interests: string[]; dimension1?: string; dimension2?: string }) {
    // 钳制数量与单项长度，防止超大 JSON 写入
    const interests = (Array.isArray(input.interests) ? input.interests : [])
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.slice(0, 50))
      .slice(0, 20);
    const existing = await this.profiles.findOne({ where: { studentId: user.id } });
    const data = {
      studentId: user.id,
      interests: JSON.stringify(interests),
      dimension1: input.dimension1 ?? null,
      dimension2: input.dimension2 ?? null,
      rec_cards: JSON.stringify(interests.slice(0, 3).map((i) => ({ interest: i, rec: `推荐「${i}」启蒙小任务，每天 15 分钟` }))),
    };
    if (existing) {
      await this.profiles.update(existing.id, data);
    } else {
      await this.profiles.save(this.profiles.create(data));
    }
    return { interests: input.interests, rec_cards: JSON.parse(data.rec_cards) };
  }
}
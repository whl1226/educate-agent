import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { LessonPlan, MicroLesson, Resource, SkillReport, SpeechDoc, TeachingReview, CollabGroup, CollabPlan, CollabFeed } from '../../db/entities/teacher.entities';
import { KnowledgeBaseEntry, Question, Template, TextbookContent } from '../../db/entities/knowledge.entities';
import { GradingItem, GradingTask, HomeworkAssignment, HomeworkSubmission, PaperQuestion, QuestionPaper } from '../../db/entities/behavior.entities';
import { AnswerRecord } from '../../db/entities/behavior.entities';
import { ClassEntity, School, Student } from '../../db/entities/org.entities';
import { FileRecord } from '../../db/entities/system.entities';
import { AIService } from '../ai/ai.service';
import {
  demoLessonPlan, demoMicroScript, demoOcrToLesson, demoPaper, demoResearcher,
  demoSkillReport, demoTips, demoTitleOrganize, demoSpeech,
} from '../ai/demo-content';
import { JwtUser } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { OrgService } from '../org/org.service';
import { OfficeService } from '../office/office.service';

@Injectable()
export class TeacherService {
  constructor(
    private readonly ai: AIService,
    private readonly org: OrgService,
    private readonly office: OfficeService,
    @InjectRepository(LessonPlan) private readonly plans: Repository<LessonPlan>,
    @InjectRepository(MicroLesson) private readonly micros: Repository<MicroLesson>,
    @InjectRepository(SpeechDoc) private readonly docs: Repository<SpeechDoc>,
    @InjectRepository(TeachingReview) private readonly reviews: Repository<TeachingReview>,
    @InjectRepository(SkillReport) private readonly skills: Repository<SkillReport>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(CollabGroup) private readonly groups: Repository<CollabGroup>,
    @InjectRepository(CollabPlan) private readonly cplans: Repository<CollabPlan>,
    @InjectRepository(CollabFeed) private readonly feeds: Repository<CollabFeed>,
    @InjectRepository(QuestionPaper) private readonly papers: Repository<QuestionPaper>,
    @InjectRepository(PaperQuestion) private readonly paperQuestions: Repository<PaperQuestion>,
    @InjectRepository(Question) private readonly questions: Repository<Question>,
    @InjectRepository(HomeworkAssignment) private readonly hw: Repository<HomeworkAssignment>,
    @InjectRepository(HomeworkSubmission) private readonly subs: Repository<HomeworkSubmission>,
    @InjectRepository(GradingTask) private readonly gtasks: Repository<GradingTask>,
    @InjectRepository(GradingItem) private readonly gitems: Repository<GradingItem>,
    @InjectRepository(AnswerRecord) private readonly answers: Repository<AnswerRecord>,
    @InjectRepository(KnowledgeBaseEntry) private readonly kbe: Repository<KnowledgeBaseEntry>,
    @InjectRepository(Template) private readonly templates: Repository<Template>,
    @InjectRepository(TextbookContent) private readonly textbooks: Repository<TextbookContent>,
    @InjectRepository(School) private readonly schools: Repository<School>,
    @InjectRepository(FileRecord) private readonly fileRecords: Repository<FileRecord>,
  ) {}

  // ================= T1 一键备课 =================

  /** 教案生成系统提示词：对齐新课标与教学设计规范，产出可直接上课的完整教案 */
  private readonly LESSON_SYSTEM_PROMPT =
    '你是深耕乡村小学的一线骨干教师与教研员，精通《义务教育课程标准（2022 年版）》与统编教材。' +
    '请为乡村小学教师撰写一份结构完整、可直接进课堂使用的优质教案。' +
    '硬性要求：' +
    '1) 教学目标按"知识与能力/过程与方法/情感态度价值观"三维表述，动词具体可测，不得使用"认识并理解"这类空泛表达；' +
    '2) 教学过程分环节（情境导入/初读感知/精读探究/巩固运用/总结作业），每个环节须同时给出【教师活动】【学生活动】【设计意图】，时间安排相加等于总课时；' +
    '3) 设计 2-3 个有梯度的问题链，体现"教学评一致性"，预设学生典型回答与教师回应策略；' +
    '4) 板书设计用字符画呈现结构化板书；' +
    '5) 分层作业 A(基础)/B(提升)/C(拓展) 各 1-2 项，任务具体可操作；' +
    '6) 教学反思须给出 3 个维度（目标达成/参与度/教学机智）的复盘框架。' +
    '7) 输出必须是合法 JSON（不要输出任何 JSON 以外的文字、不要用 Markdown 代码块包裹），结构为：' +
    '{"analysis":{"text":"教材分析","students":"学情分析"},"goals":["..."],"keyPoints":["..."],"teachingMethods":["..."],"resources":["..."],"process":[{"stage":"...","minutes":10,"teacher":"...","student":"...","intent":"..."}],"board":"...","homework":[{"layer":"A","desc":"..."}],"reflection":"..."}。';

  async generateLessonPlan(user: JwtUser, input: { subject: string; grade: string; topic: string; periodCount?: number; duration?: number; bookVersion?: string; adaptation?: string; supplementary?: string }, runId?: number) {
    const data = await this.buildLessonPlanContent(input);
    const plan = await this.plans.save(
      this.plans.create({
        teacherId: user.id,
        runId: runId ?? null,
        subject: input.subject,
        grade: input.grade,
        bookVersion: input.bookVersion ?? null,
        topic: input.topic,
        periodCount: input.periodCount || 1,
        duration: input.duration || 40,
        adaptation: input.adaptation ?? null,
        supplementary: input.supplementary ?? null,
        content: data.content,
        outline: data.outline,
        sourceRefs: data.sourceRefs,
      }),
    );
    return { id: plan.id, ...data, topic: input.topic };
  }

  /** 教案内容：优先真实 LLM（带强提示词），无 Key/失败/非法 JSON 时降级规则引擎 */
  private async buildLessonPlanContent(input: { subject: string; grade: string; topic: string; periodCount?: number; duration?: number; bookVersion?: string; supplementary?: string }) {
    if (!this.ai.isDemo) {
      const prompt =
        `学科：${input.subject}\n年级：${input.grade}\n课题：《${input.topic}》\n` +
        `教材版本：${input.bookVersion || '人教版'}\n课时：${input.periodCount || 1} 课时，每课时 ${input.duration || 40} 分钟\n` +
        (input.supplementary ? `教师补充要求：${input.supplementary}\n` : '') +
        '请严格按照系统提示词的 JSON 结构输出完整教案。';
      // 一次修正重试：LLM 偶发在 JSON 前后附加说明文字导致解析失败，重试时强制"只输出 JSON"
      for (const attempt of [0, 1]) {
        try {
          const r = await this.ai.chat(this.LESSON_SYSTEM_PROMPT + (attempt === 1 ? '\n【再次提醒】输出必须是纯 JSON，不要包含任何解释性文字或 Markdown 代码块。' : ''), prompt);
          const json = this.parseJsonLoose(r.text);
          if (json && Array.isArray(json.goals) && Array.isArray(json.process)) {
            return {
              content: JSON.stringify(json),
              outline:
                '一、教材与学情分析\n二、教学目标\n三、教学重难点\n四、教学方法与资源\n五、教学过程（分环节：教师/学生活动/设计意图）\n六、板书设计\n七、分层作业\n八、教学反思',
              sourceRefs: JSON.stringify([
                { title: `教材·${input.bookVersion || '人教版'}·${input.grade}${input.subject}《${input.topic}》`, ref: 'textbook' },
                { title: 'AI 生成教案·' + r.model, ref: 'ai:lesson_plan' },
              ]),
            };
          }
        } catch {
          /* LLM 失败静默降级规则引擎 */
        }
      }
    }
    return demoLessonPlan({ ...input, periodCount: input.periodCount || 1, duration: input.duration || 40 });
  }

  /** 宽松 JSON 提取：容忍 ```json 包裹与前后缀文本 */
  private parseJsonLoose(s: string): any {
    if (!s) return null;
    let t = s.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    const brace = t.indexOf('{');
    const endBrace = t.lastIndexOf('}');
    if (brace >= 0 && endBrace > brace) t = t.slice(brace, endBrace + 1);
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }

  async listLessonPlans(user: JwtUser) {
    const list = await this.plans.find({ where: { teacherId: user.id }, order: { id: 'DESC' }, take: 50 });
    return list.map((p) => ({
      id: p.id,
      subject: p.subject,
      grade: p.grade,
      topic: p.topic,
      createdAt: p.createdAt,
      runId: p.runId ?? null,
      sourceRefs: p.sourceRefs ? JSON.parse(p.sourceRefs) : [],
    }));
  }

  /** 教案详情（含正文，供历史教案展示） */
  async lessonPlanDetail(user: JwtUser, id: number) {
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) throw new BizException(ErrorCodes.NOT_FOUND);
    if (user.role !== 'admin' && plan.teacherId !== user.id) throw new BizException(ErrorCodes.SCOPE_FORBIDDEN);
    return plan;
  }

  async deleteLessonPlan(user: JwtUser, id: number) {
    const plan = await this.plans.findOne({ where: { id, teacherId: user.id } });
    if (!plan) throw new BizException(ErrorCodes.NOT_FOUND);
    await this.plans.softDelete(id);
    return { ok: true };
  }

  // ================= T2 组卷 / 分层作业 =================

  async generatePaper(user: JwtUser, input: { subject: string; grade: string; title: string; layerMode?: string; knowledgePointIds?: number[]; questionCount?: number }) {
    const data = demoPaper({
      subject: input.subject,
      grade: input.grade,
      title: input.title,
      layerMode: input.layerMode || 'uniform',
      knowledgePointIds: input.knowledgePointIds || [],
      questionCount: Math.min(Math.max(input.questionCount || 6, 2), 30),
    });
    const paper = await this.papers.save(
      this.papers.create({
        teacherId: user.id,
        subject: input.subject,
        grade: input.grade,
        title: input.title,
        layerMode: input.layerMode || 'uniform',
        analysisEnabled: 1,
        status: 'draft',
      }),
    );
    const savedQs: Array<{ id: number; layer: string; score: number }> = [];
    const library = await this.questions.find({ where: { subject: input.subject, grade: input.grade, status: 'active' }, take: 200 });
    for (let i = 0; i < data.questions.length; i++) {
      const dq = data.questions[i];
      let q = library[i % library.length];
      if (!q) {
        q = await this.questions.save(
          this.questions.create({
            subject: input.subject,
            grade: input.grade,
            knowledgePointId: 1,
            type: 'choice',
            difficulty: 3,
            stem: dq.stem,
            options: dq.options ? JSON.stringify(dq.options) : null,
            answer: dq.answer,
            analysis: dq.analysis,
            source: 'AI 组卷·演示',
            status: 'active',
          }),
        );
      }
      savedQs.push({ id: q.id, layer: dq.layer, score: dq.score });
    }
    await this.paperQuestions.save(
      savedQs.map((q, i) =>
        this.paperQuestions.create({ paperId: paper.id, questionId: q.id, seq: i, layer: q.layer, score: q.score }),
      ),
    );
    // 返回内容必须与落库题目一致（避免前端展示题干与判分答案错配）
    const finalQs = await this.questions.find({ where: { id: In(savedQs.map((s) => s.id)) } });
    return {
      id: paper.id,
      sections: data.sections,
      questions: finalQs.map((q, i) => ({
        stem: q.stem,
        options: q.options ? JSON.parse(q.options) : null,
        answer: q.answer,
        analysis: q.analysis,
        layer: savedQs[i]?.layer ?? 'A',
        score: savedQs[i]?.score ?? 5,
      })),
      questionIds: savedQs.map((q) => q.id),
    };
  }

  async listPapers(user: JwtUser) {
    return this.papers.find({ where: { teacherId: user.id }, order: { id: 'DESC' }, take: 50 });
  }

  async patchPaper(user: JwtUser, id: number, patch: { title?: string; status?: string }) {
    const paper = await this.papers.findOne({ where: { id, teacherId: user.id } });
    if (!paper) throw new BizException(ErrorCodes.NOT_FOUND);
    if (patch.status && !['draft', 'published', 'archived'].includes(patch.status)) {
      throw new BizException(ErrorCodes.VALIDATE_ERROR, 'status 仅支持 draft/published/archived');
    }
    await this.papers.update(id, patch);
    return { ok: true };
  }

  async deletePaper(user: JwtUser, id: number) {
    const paper = await this.papers.findOne({ where: { id, teacherId: user.id } });
    if (!paper) throw new BizException(ErrorCodes.NOT_FOUND);
    await this.paperQuestions.softDelete({ paperId: id });
    await this.papers.softDelete(id);
    return { ok: true };
  }

  async deployPaper(user: JwtUser, id: number, input: { classId: number; deadline?: string }) {
    const paper = await this.papers.findOne({ where: { id, teacherId: user.id } });
    if (!paper) throw new BizException(ErrorCodes.NOT_FOUND);
    // 越权防护：教师只能向自己任教的班级布置作业
    await this.org.assertClassTeacher(user, input.classId);
    // 同一试卷重复下发拦截
    const duplicated = await this.hw.findOne({ where: { teacherId: user.id, paperId: paper.id, status: 'assigned' } });
    if (duplicated) throw new BizException(ErrorCodes.CONFLICT, '该试卷已布置过，请勿重复下发');
    let deadline: Date | null = null;
    if (input.deadline) {
      const parsed = new Date(input.deadline);
      if (Number.isNaN(parsed.getTime())) throw new BizException(ErrorCodes.VALIDATE_ERROR, 'deadline 格式不合法');
      deadline = parsed;
    }
    const assignment = await this.hw.save(
      this.hw.create({
        teacherId: user.id,
        classId: input.classId,
        paperId: paper.id,
        title: paper.title,
        subject: paper.subject,
        deadline,
        status: 'assigned',
      }),
    );
    const students = await this.org.classStudents(input.classId, 1, 500);
    await this.subs.save(
      students.list.map((s) =>
        this.subs.create({ assignmentId: assignment.id, studentId: s.id, status: 'pending', submittedAt: null }),
      ),
    );
    const task = await this.gtasks.save(
      this.gtasks.create({
        teacherId: user.id,
        classId: input.classId,
        title: paper.title,
        subject: paper.subject,
        taskType: 'objective',
        aiStatus: 'pending',
      }),
    );
    return { assignmentId: assignment.id, gradingTaskId: task.id, assigned: students.total };
  }

  async exportPaper(user: JwtUser, id: number) {
    const paper = await this.papers.findOne({ where: { id, teacherId: user.id } });
    if (!paper) throw new BizException(ErrorCodes.NOT_FOUND);
    const pqs = await this.paperQuestions.find({ where: { paperId: id }, order: { seq: 'ASC' } });
    const qs = await this.questions.find({ where: { id: In(pqs.map((p) => p.questionId)) } });
    const lines = [`《${paper.title}》（${paper.grade}${paper.subject}）`, ''];
    for (const pq of pqs) {
      const q = qs.find((x) => x.id === pq.questionId);
      if (!q) continue;
      lines.push(`${pq.seq + 1}. ${q.stem}`);
      if (pq.layer) {
        lines.push(`【${pq.layer} 层】`);
      }
      if (q.options) {
        try {
          const opts = JSON.parse(q.options) as string[];
          lines.push(opts.map((o, i) => `${i + 1}. ${o}`).join('\n'));
        } catch {
          lines.push(q.options);
        }
      }
      lines.push(`（参考答案：${q.answer}，${pq.score} 分）`, '');
    }
    return { filename: `${paper.title}.doc.txt`, content: lines.join('\n') };
  }

  /** 试卷导出为 Word/PDF：组装 Markdown → office 渲染 → 下载链接（复用 generate_document 全链路） */
  async downloadPaper(user: JwtUser, id: number, format: 'docx' | 'pdf') {
    const paper = await this.papers.findOne({ where: { id, teacherId: user.id } });
    if (!paper) throw new BizException(ErrorCodes.NOT_FOUND);
    const pqs = await this.paperQuestions.find({ where: { paperId: id }, order: { seq: 'ASC' } });
    const qs = await this.questions.find({ where: { id: In(pqs.map((p) => p.questionId)) } });
    const layerLabel: Record<string, string> = { A: 'A 层', B: 'B 层', C: 'C 层' };
    const sections: string[] = [];
    for (const pq of pqs) {
      const q = qs.find((x) => x.id === pq.questionId);
      if (!q) continue;
      const layer = layerLabel[pq.layer ?? ''] ?? '';
      sections.push(`${pq.seq + 1}. ${q.stem}${layer ? `　[${layer}]` : ''}`);
      if (q.options) {
        try {
          const opts = JSON.parse(q.options) as string[];
          sections.push(opts.map((o, i) => `${i + 1}. ${o}`).join('\n'));
        } catch {
          sections.push(q.options);
        }
      }
      sections.push(`**参考答案**：${q.answer}（${pq.score} 分）`, '');
    }
    const contentMd = [
      '---',
      `title: ${paper.title}`,
      `format: ${format}`,
      'theme: default',
      '---',
      '',
      `# ${paper.title}`,
      '',
      `**${paper.grade} ${paper.subject}** · 分层模式：${paper.layerMode === 'layered' ? 'A/B/C 分层' : paper.layerMode || '统一'} · 共 ${pqs.length} 题`,
      '',
      ...sections,
      '---',
      '说明：本卷由乡芽智能体一键组卷生成，含参考答案与解析，可直接打印使用。',
    ].join('\n');
    const out = await this.office.generateDocument(user, { format, content_md: contentMd, title: paper.title, theme: 'default' });
    if (!out.valid) {
      return { error: '文档校验失败', issues: out.issues };
    }
    return out;
  }

  // ================= T3 一键批改 =================

  async gradingPending(user: JwtUser) {
    const tasks = await this.gtasks.find({ where: { teacherId: user.id }, order: { id: 'DESC' }, take: 50 });
    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      subject: t.subject,
      aiStatus: t.aiStatus,
      taskType: t.taskType,
      createdAt: t.createdAt,
      stats: t.stats ? JSON.parse(t.stats) : null,
    }));
  }

  async gradingResult(user: JwtUser, taskId: number) {
    const task = await this.gtasks.findOne({ where: { id: taskId, teacherId: user.id } });
    if (!task) throw new BizException(ErrorCodes.NOT_FOUND);
    const items = await this.gitems.find({ where: { taskId } });
    if (!items.length) {
      // 无批改明细时不伪造统计（避免把无关作答算进本任务）
      return { taskId, total: 0, autoGraded: 0, needReview: 0, classAvg: 0, items: [], message: '暂无批改明细，请先生成批改结果' };
    }
    const stats = task.stats ? JSON.parse(task.stats) : { total: items.length, autoGraded: items.filter((i) => i.aiScore !== null).length, needReview: items.filter((i) => i.needsReview).length, classAvg: 0 };
    return { taskId, ...stats, items: items.map((i) => ({ id: i.id, questionId: i.questionId, aiScore: i.aiScore, aiCorrect: i.aiCorrect, needsReview: !!i.needsReview, reviewStatus: i.reviewStatus, teacherComment: i.teacherComment })) };
  }

  async confirmGrading(user: JwtUser, taskId: number) {
    const task = await this.gtasks.findOne({ where: { id: taskId, teacherId: user.id } });
    if (!task) throw new BizException(ErrorCodes.NOT_FOUND);
    if (task.aiStatus === 'confirmed') throw new BizException(ErrorCodes.CONFLICT, '该任务已确认，请勿重复操作');
    await this.gtasks.update(taskId, { aiStatus: 'confirmed' });
    return { ok: true };
  }

  async essayComment(user: JwtUser, taskId: number, input: { submissionId?: number; comment: string }) {
    const task = await this.gtasks.findOne({ where: { id: taskId, teacherId: user.id } });
    if (!task) throw new BizException(ErrorCodes.NOT_FOUND);
    const item = await this.gitems.findOne({ where: { taskId, submissionId: input.submissionId ?? IsNull() } });
    if (!item) throw new BizException(ErrorCodes.NOT_FOUND, '未找到待点评的批改明细');
    await this.gitems.update(item.id, { teacherComment: input.comment, reviewStatus: 'reviewed' });
    return { ok: true };
  }

  // ================= T5 AI 教研员 =================

  async researcher(user: JwtUser, reviewType: string, input: { sourceContent?: string }) {
    const data = demoResearcher(reviewType, input.sourceContent || '');
    const review = await this.reviews.save(
      this.reviews.create({
        teacherId: user.id,
        reviewType,
        sourceContent: input.sourceContent ?? null,
        score: data.score ?? null,
        content: data.content,
        adopted: 0,
      }),
    );
    return { id: review.id, ...data };
  }

  async adoptReview(user: JwtUser, id: number) {
    const review = await this.reviews.findOne({ where: { id, teacherId: user.id } });
    if (!review) throw new BizException(ErrorCodes.NOT_FOUND);
    await this.reviews.update(id, { adopted: 1 });
    return { ok: true };
  }

  // ================= T9/T10 发言稿 / 开学包 =================

  async generateSpeech(user: JwtUser, input: { docType: string; theme: string; audience?: string; keyPoints?: string; duration?: number }) {
    const content = demoSpeech(input.docType, input.theme, input.audience || '家长', input.keyPoints);
    const doc = await this.docs.save(
      this.docs.create({
        teacherId: user.id,
        docType: input.docType,
        theme: input.theme,
        audience: input.audience ?? null,
        keyPoints: input.keyPoints ?? null,
        duration: input.duration || 15,
        content,
      }),
    );
    return { id: doc.id, content, docType: input.docType, theme: input.theme };
  }

  async listSpeechDocs(user: JwtUser, docType?: string) {
    const where: Record<string, unknown> = { teacherId: user.id };
    if (docType) where.docType = docType;
    const list = await this.docs.find({ where, order: { id: 'DESC' }, take: 50 });
    return list.map((d) => ({
      id: d.id,
      docType: d.docType,
      theme: d.theme,
      duration: d.duration,
      audience: d.audience,
      keyPoints: d.keyPoints,
      content: d.content,
      createdAt: d.createdAt,
      runId: d.runId ?? null,
    }));
  }

  async backToSchoolPackage() {
    const templates = await this.templates.find({ where: { type: In(['lesson_plan', 'lessonware', 'parent_meeting']) } });
    return {
      items: templates.map((t) => ({ id: t.id, name: t.name, type: t.type, license: t.license, preview: t.content.slice(0, 120), content: t.content })),
    };
  }

  async updateBackToSchoolItem(_user: JwtUser, id: number, content: string) {
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new BizException(ErrorCodes.VALIDATE_ERROR, 'content 必填');
    }
    const tpl = await this.templates.findOne({ where: { id } });
    if (!tpl) throw new BizException(ErrorCodes.NOT_FOUND);
    tpl.content = content.slice(0, 20000);
    await this.templates.save(tpl);
    return { ok: true };
  }

  async knowledgeBase(category?: string, scene?: string) {
    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (scene) where.scene = scene;
    return this.kbe.find({ where, order: { id: 'ASC' }, take: 100 });
  }

  // ================= T12 基本功 =================

  async selfAssessment() {
    return [
      { key: '教学设计', score: 82 },
      { key: '课堂实施', score: 75 },
      { key: '作业设计', score: 70 },
      { key: '技术融合', score: 60 },
      { key: '班级管理', score: 80 },
      { key: '家校沟通', score: 72 },
    ];
  }

  async skillReport(user: JwtUser, input: { self: Record<string, number> }) {
    const data = demoSkillReport(input.self);
    const report = await this.skills.save(
      this.skills.create({
        teacherId: user.id,
        selfAssessment: JSON.stringify(input.self),
        radar: data.radar,
        plan: data.plan,
        archives: null,
      }),
    );
    return { id: report.id, radar: JSON.parse(data.radar), plan: JSON.parse(data.plan) };
  }

  // ================= T13 职称材料 =================

  async organizeTitle(_user: JwtUser, input: { items: string[] }) {
    return demoTitleOrganize(input.items);
  }

  // ================= T14 微课 =================

  async generateMicro(user: JwtUser, input: { topic: string; style?: string; format?: string; duration?: number; teleprompter?: boolean }) {
    const data = demoMicroScript(input.topic, input.style || '讲解型', input.duration || 8);
    const micro = await this.micros.save(
      this.micros.create({
        teacherId: user.id,
        topic: input.topic,
        duration: input.duration || 8,
        style: input.style ?? null,
        format: input.format ?? null,
        teleprompter: input.teleprompter === false ? 0 : 1,
        content: data.content,
      }),
    );
    return { id: micro.id, ...data, topic: input.topic };
  }

  // ================= T6 资源库 =================

  /** 授权范围白名单：仅允许四类，其余一律拒绝（对外仅输出脱敏错误，不泄露细节） */
  private readonly LICENSE_WHITELIST = ['自建', '共享', '公开领域', 'CC BY'];

  /**
   * 资源可见性：本人资源全可见，他人资源仅开放授权（公开领域 / CC BY / 共享）可见，
   * 「自建」仅本人可见。支持 license / type / 标题描述关键词筛选。
   */
  async listResources(user: JwtUser, query: { license?: string; q?: string; type?: string } = {}) {
    const qb = this.resources
      .createQueryBuilder('r')
      .where('r.teacherId = :uid OR r.license IN (:...open)', {
        uid: user.id,
        open: ['公开领域', 'CC BY', '共享'],
      });
    if (query.license && this.LICENSE_WHITELIST.includes(query.license)) {
      qb.andWhere('r.license = :lic', { lic: query.license });
    }
    if (query.type) qb.andWhere('r.type = :type', { type: query.type });
    if (query.q) qb.andWhere('(r.title LIKE :q OR r.description LIKE :q)', { q: `%${query.q}%` });
    return qb.orderBy('r.createdAt', 'DESC').getMany();
  }

  async createResource(user: JwtUser, input: { type?: string; title: string; description?: string; license?: string; fileId?: number }) {
    const license = input.license || '自建';
    if (!this.LICENSE_WHITELIST.includes(license)) {
      throw new BizException(ErrorCodes.VALIDATE_ERROR, '授权范围非法');
    }
    if (!input.title || !input.title.trim()) {
      throw new BizException(ErrorCodes.VALIDATE_ERROR, 'title 必填');
    }
    // fileId 归属校验：只能引用本人上传的文件，防止越权挂载他人文件元数据
    if (input.fileId != null) {
      const rec = await this.fileRecords.findOne({ where: { id: input.fileId } });
      if (!rec) throw new BizException(ErrorCodes.NOT_FOUND, '关联文件不存在');
      if (user.role !== 'admin' && rec.uploaderId !== user.id) {
        throw new BizException(ErrorCodes.SCOPE_FORBIDDEN, '只能引用自己上传的文件');
      }
    }
    const res = await this.resources.save(
      this.resources.create({
        teacherId: user.id,
        type: input.type || '教案',
        title: input.title,
        description: input.description ?? null,
        license,
        fileId: input.fileId ?? null,
      }),
    );
    return { id: res.id };
  }

  async patchResource(user: JwtUser, id: number, patch: { title?: string; description?: string; license?: string }) {
    const res = await this.resources.findOne({ where: { id, teacherId: user.id } });
    if (!res) throw new BizException(ErrorCodes.NOT_FOUND);
    await this.resources.update(id, patch);
    return { ok: true };
  }

  async deleteResource(user: JwtUser, id: number) {
    const res = await this.resources.findOne({ where: { id, teacherId: user.id } });
    if (!res) throw new BizException(ErrorCodes.NOT_FOUND);
    await this.resources.softDelete(id);
    return { ok: true };
  }

  // ================= T15 集体备课 =================

  async listGroups() {
    return this.groups.find({ order: { id: 'DESC' }, take: 50 });
  }

  async createGroup(user: JwtUser, input: { name: string; school?: string; subject?: string }) {
    const group = await this.groups.save(
      this.groups.create({
        name: input.name,
        school: input.school ?? null,
        subject: input.subject ?? null,
        status: 'ongoing',
        members: 1,
        notes: 0,
      }),
    );
    await this.feeds.save(
      this.feeds.create({ groupId: group.id, userId: user.id, content: '创建了备课组' }),
    );
    return { id: group.id };
  }

  async createCollabPlan(user: JwtUser, input: { groupId: number; topic: string; mode?: string; plan: string }) {
    await this.assertGroupScope(user, input.groupId);
    const plan = await this.cplans.save(
      this.cplans.create({
        groupId: input.groupId,
        topic: input.topic,
        mode: input.mode ?? null,
        plan: input.plan,
      }),
    );
    await this.groups.increment({ id: input.groupId }, 'notes', 1);
    await this.feeds.save(
      this.feeds.create({ groupId: input.groupId, userId: user.id, content: `发起协作：《${input.topic}》` }),
    );
    return { id: plan.id };
  }

  /** 备课组范围校验：组必须存在，教师只能参与本校（school 匹配）或全校共享组 */
  private async assertGroupScope(user: JwtUser, groupId: number) {
    const group = await this.groups.findOne({ where: { id: groupId } });
    if (!group) throw new BizException(ErrorCodes.NOT_FOUND);
    if (user.role === 'admin') return;
    if (user.role !== 'teacher') throw new BizException(ErrorCodes.FORBIDDEN);
    if (!group.school) return; // 全校共享组
    const classes = await this.org.myClasses(user);
    const schoolIds = [...new Set(classes.map((c) => c.schoolId).filter((x): x is number => x != null))];
    if (!schoolIds.length) throw new BizException(ErrorCodes.SCOPE_FORBIDDEN, '未任教任何班级，无法参与备课组');
    const schools = await this.schools.find({ where: { id: In(schoolIds) } });
    if (!schools.some((s) => s.name === group.school)) {
      throw new BizException(ErrorCodes.SCOPE_FORBIDDEN, '无权参与其他学校的备课组');
    }
  }

  async collabFeed(groupId?: number) {
    const where: Record<string, unknown> = {};
    if (groupId) where.groupId = groupId;
    return this.feeds.find({ where, order: { id: 'DESC' }, take: 50 });
  }

  // ================= OCR 转教案（T7） =================

  async ocrToLesson(user: JwtUser, rawText: string) {
    const data = demoOcrToLesson(rawText);
    const plan = await this.plans.save(
      this.plans.create({
        teacherId: user.id,
        subject: '语文',
        grade: '五年级',
        bookVersion: '拍照识别',
        topic: '拍照转教案',
        periodCount: 1,
        duration: 40,
        adaptation: null,
        supplementary: null,
        content: data.content,
        outline: data.outline,
        sourceRefs: data.sourceRefs,
      }),
    );
    return { id: plan.id, ...data };
  }

  // ================= 话术助手（家长端复用） =================

  async generateTips(scene: string) {
    return { scene, text: demoTips(scene) };
  }
}
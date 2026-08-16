import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * D6 学生作答记录 —— 全系统唯一"原生行为数据源"。
 * 所有学情输出（个人诊断/班级看板/区域看板/周报）都是它的聚合视图。
 */
@Entity('answer_records')
@Index('idx_ar_student_time', ['studentId', 'answeredAt'])
@Index('idx_ar_kp', ['knowledgePointId'])
@Index('idx_ar_question', ['questionId'])
@Index('idx_ar_paper', ['paperId'])
export class AnswerRecord extends BaseEntity {
  @Column({ name: 'student_id', type: 'int' })
  studentId: number;

  @Column({ name: 'question_id', type: 'int' })
  questionId: number;

  @Column({ name: 'paper_id', type: 'int', nullable: true })
  paperId: number | null;

  @Column({ type: 'varchar', length: 16 })
  subject: string;

  @Column({ name: 'knowledge_point_id', type: 'int' })
  knowledgePointId: number;

  @Column({ type: 'text', nullable: true })
  answer: string | null;

  @Column({ name: 'is_correct', type: 'int', default: 0 })
  isCorrect: number;

  @Column({ type: 'real', nullable: true })
  score: number | null;

  @Column({ name: 'duration_sec', type: 'int', default: 0 })
  durationSec: number;

  @Column({ type: 'varchar', length: 16, default: 'practice' })
  source: string;

  @Column({ name: 'answered_at', type: 'datetime' })
  answeredAt: Date;
}

/** 试卷（组卷 T2） */
@Entity('question_papers')
@Index('idx_qp_teacher', ['teacherId'])
export class QuestionPaper extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'int' })
  teacherId: number;

  @Column({ name: 'class_id', type: 'int', nullable: true })
  classId: number | null;

  @Column({ type: 'varchar', length: 16 })
  subject: string;

  @Column({ type: 'varchar', length: 16 })
  grade: string;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'varchar', length: 16, default: 'uniform' })
  layerMode: string;

  @Column({ name: 'analysis_enabled', type: 'int', default: 1 })
  analysisEnabled: number;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status: string;
}

/** 试卷题目（分层 A/B/C） */
@Entity('paper_questions')
@Index('idx_pq_paper', ['paperId'])
export class PaperQuestion extends BaseEntity {
  @Column({ name: 'paper_id', type: 'int' })
  paperId: number;

  @Column({ name: 'question_id', type: 'int' })
  questionId: number;

  @Column({ type: 'int', default: 0 })
  seq: number;

  @Column({ type: 'varchar', length: 4, nullable: true })
  layer: string | null;

  @Column({ type: 'int', default: 5 })
  score: number;
}

/** 作业布置（教师端下发学生端） */
@Entity('homework_assignments')
@Index('idx_hw_class', ['classId'])
@Index('idx_hw_teacher', ['teacherId'])
export class HomeworkAssignment extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'int' })
  teacherId: number;

  @Column({ name: 'class_id', type: 'int' })
  classId: number;

  @Column({ name: 'paper_id', type: 'int', nullable: true })
  paperId: number | null;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'varchar', length: 16 })
  subject: string;

  @Column({ type: 'datetime', nullable: true })
  deadline: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'assigned' })
  status: string;
}

/** 学生作业提交 */
@Entity('homework_submissions')
@Index('idx_hs_assignment', ['assignmentId'])
@Index('idx_hs_student', ['studentId'])
export class HomeworkSubmission extends BaseEntity {
  @Column({ name: 'assignment_id', type: 'int' })
  assignmentId: number;

  @Column({ name: 'student_id', type: 'int' })
  studentId: number;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: string;

  @Column({ name: 'submitted_at', type: 'datetime', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'real', nullable: true })
  score: number | null;
}

/** 批改任务（T3） */
@Entity('grading_tasks')
@Index('idx_gt_teacher', ['teacherId'])
export class GradingTask extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'int' })
  teacherId: number;

  @Column({ name: 'class_id', type: 'int' })
  classId: number;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'varchar', length: 16 })
  subject: string;

  @Column({ type: 'varchar', length: 16, default: 'objective' })
  taskType: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  aiStatus: string;

  /** JSON：{total, autoGraded, needReview, classAvg, scores:{...}} */
  @Column({ type: 'text', nullable: true })
  stats: string | null;
}

/** 批改明细（每题） */
@Entity('grading_items')
@Index('idx_gi_task', ['taskId'])
export class GradingItem extends BaseEntity {
  @Column({ name: 'task_id', type: 'int' })
  taskId: number;

  @Column({ name: 'submission_id', type: 'int', nullable: true })
  submissionId: number | null;

  @Column({ name: 'question_id', type: 'int' })
  questionId: number;

  @Column({ name: 'ai_score', type: 'real', nullable: true })
  aiScore: number | null;

  @Column({ name: 'ai_correct', type: 'int', nullable: true })
  aiCorrect: number | null;

  @Column({ name: 'needs_review', type: 'int', default: 0 })
  needsReview: number;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  reviewStatus: string;

  @Column({ name: 'teacher_comment', type: 'text', nullable: true })
  teacherComment: string | null;

  @Column({ name: 'class_accuracy', type: 'real', nullable: true })
  classAccuracy: number | null;
}

/** 学习打卡（S7） */
@Entity('checkins')
@Unique('uk_checkin_student_date', ['studentId', 'checkinDate'])
@Index('idx_checkin_student', ['studentId'])
export class Checkin extends BaseEntity {
  @Column({ name: 'student_id', type: 'int' })
  studentId: number;

  @Column({ type: 'varchar', length: 16 })
  checkinDate: string;

  @Column({ type: 'int', default: 10 })
  points: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;
}
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/** 诊断记录（S3，触发维度） */
@Entity('diagnosis_records')
@Index('idx_dr_student', ['studentId'])
export class DiagnosisRecord extends BaseEntity {
  @Column({ name: 'student_id', type: 'int' })
  studentId: number;

  @Column({ type: 'varchar', length: 16, default: 'auto' })
  trigger: string;

  @Column({ name: 'answer_count', type: 'int', default: 0 })
  answerCount: number;

  @Column({ name: 'overall_mastery', type: 'real' })
  overallMastery: number;

  @Column({ type: 'real', nullable: true })
  confidence: number | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ name: 'computed_at', type: 'datetime' })
  computedAt: Date;
}

/** 掌握度快照（诊断模型输出，证据题可回溯） */
@Entity('mastery_snapshots')
@Index('idx_ms_student_time', ['studentId', 'computedAt'])
@Index('idx_ms_student_kp', ['studentId', 'knowledgePointId'])
export class MasterySnapshot extends BaseEntity {
  @Column({ name: 'student_id', type: 'int' })
  studentId: number;

  @Column({ name: 'knowledge_point_id', type: 'int' })
  knowledgePointId: number;

  @Column({ type: 'real' })
  mastery: number;

  @Column({ type: 'real', default: 0.8 })
  confidence: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  errorType: string | null;

  @Column({ name: 'evidence_count', type: 'int', default: 0 })
  evidenceCount: number;

  @Column({ name: 'computed_at', type: 'datetime' })
  computedAt: Date;
}

/** 学习计划（S6 ZPD） */
@Entity('study_plans')
@Index('idx_sp_student', ['studentId'])
export class StudyPlan extends BaseEntity {
  @Column({ name: 'student_id', type: 'int' })
  studentId: number;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ name: 'week_no', type: 'int', default: 1 })
  weekNo: number;

  @Column({ type: 'real', default: 0 })
  progress: number;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: string;
}

/** 计划步骤（复习/练习/进阶） */
@Entity('plan_steps')
@Index('idx_ps_plan', ['planId'])
export class PlanStep extends BaseEntity {
  @Column({ name: 'plan_id', type: 'int' })
  planId: number;

  @Column({ name: 'knowledge_point_id', type: 'int' })
  knowledgePointId: number;

  @Column({ type: 'varchar', length: 16, default: 'practice' })
  stepType: string;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'varchar', length: 16, default: 'wait' })
  status: string;

  @Column({ type: 'real', nullable: true })
  mastery: number | null;

  @Column({ name: 'question_count', type: 'int', default: 3 })
  questionCount: number;

  @Column({ name: 'completed_question_count', type: 'int', default: 0 })
  completedQuestionCount: number;
}

/** 错题本（S5） */
@Entity('error_book')
@Index('idx_eb_student', ['studentId'])
@Index('idx_eb_question', ['questionId'])
export class ErrorBook extends BaseEntity {
  @Column({ name: 'student_id', type: 'int' })
  studentId: number;

  @Column({ name: 'question_id', type: 'int' })
  questionId: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  errorType: string | null;

  @Column({ name: 'wrong_answer', type: 'text', nullable: true })
  wrongAnswer: string | null;

  @Column({ name: 'review_count', type: 'int', default: 0 })
  reviewCount: number;

  @Column({ type: 'int', default: 0 })
  mastered: number;

  @Column({ name: 'last_reviewed_at', type: 'datetime', nullable: true })
  lastReviewedAt: Date | null;
}

/** 兴趣画像（学生端兴趣向导） */
@Entity('interest_profiles')
@Index('idx_ip_student', ['studentId'])
export class InterestProfile extends BaseEntity {
  @Column({ name: 'student_id', type: 'int' })
  studentId: number;

  @Column({ type: 'text' })
  interests: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  dimension1: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  dimension2: string | null;

  @Column({ type: 'text', nullable: true })
  rec_cards: string | null;
}
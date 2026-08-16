import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/** T1 教案生成记录 */
@Entity('lesson_plans')
@Index('idx_lp_teacher', ['teacherId'])
export class LessonPlan extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'int' })
  teacherId: number;

  @Column({ type: 'varchar', length: 16 })
  subject: string;

  @Column({ type: 'varchar', length: 16 })
  grade: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  bookVersion: string | null;

  @Column({ type: 'varchar', length: 128 })
  topic: string;

  @Column({ name: 'period_count', type: 'int', default: 1 })
  periodCount: number;

  @Column({ type: 'int', default: 40 })
  duration: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  adaptation: string | null;

  @Column({ type: 'text', nullable: true })
  supplementary: string | null;

  /** JSON 结构化教案（环节/目标/板书/作业） */
  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  outline: string | null;

  /** JSON 出处引用（教材章节/模板来源）——可溯源 */
  @Column({ name: 'source_refs', type: 'text', nullable: true })
  sourceRefs: string | null;

  /** 关联智能体运行 ID（历史教案跳转会话） */
  @Column({ name: 'run_id', type: 'int', nullable: true })
  runId: number | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: string;
}

/** T14 微课脚本 */
@Entity('micro_lessons')
@Index('idx_ml_teacher', ['teacherId'])
export class MicroLesson extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'int' })
  teacherId: number;

  @Column({ type: 'varchar', length: 128 })
  topic: string;

  @Column({ type: 'int', default: 8 })
  duration: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  style: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  format: string | null;

  @Column({ name: 'teleprompter', type: 'int', default: 1 })
  teleprompter: number;

  @Column({ type: 'text' })
  content: string;
}

/** T9 家长会材料 / T10 开学包 / 发言稿 */
@Entity('speech_docs')
@Index('idx_sd_teacher', ['teacherId'])
export class SpeechDoc extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'int' })
  teacherId: number;

  @Column({ type: 'varchar', length: 32 })
  docType: string;

  @Column({ type: 'varchar', length: 128 })
  theme: string;

  @Column({ type: 'int', default: 15 })
  duration: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  audience: string | null;

  @Column({ name: 'key_points', type: 'text', nullable: true })
  keyPoints: string | null;

  @Column({ type: 'text' })
  content: string;

  /** 关联智能体运行 ID（历史发言稿跳转会话） */
  @Column({ name: 'run_id', type: 'int', nullable: true })
  runId: number | null;
}

/** T5 AI 教研员（教案点评/讲题话术/教学建议） */
@Entity('teaching_reviews')
@Index('idx_tr_teacher', ['teacherId'])
export class TeachingReview extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'int' })
  teacherId: number;

  @Column({ type: 'varchar', length: 32 })
  reviewType: string;

  @Column({ name: 'source_content', type: 'text', nullable: true })
  sourceContent: string | null;

  @Column({ type: 'real', nullable: true })
  score: number | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'int', default: 0 })
  adopted: number;
}

/** T12 基本功诊断报告 */
@Entity('skill_reports')
@Index('idx_sr_teacher', ['teacherId'])
export class SkillReport extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'int' })
  teacherId: number;

  @Column({ name: 'self_assessment', type: 'text' })
  selfAssessment: string;

  @Column({ type: 'text' })
  radar: string;

  @Column({ type: 'text' })
  plan: string;

  @Column({ type: 'text', nullable: true })
  archives: string | null;
}

/** T15 集体备课组 */
@Entity('collab_groups')
export class CollabGroup extends BaseEntity {
  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  school: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  subject: string | null;

  @Column({ type: 'varchar', length: 16, default: 'ongoing' })
  status: string;

  @Column({ type: 'int', default: 1 })
  members: number;

  @Column({ type: 'int', default: 0 })
  notes: number;
}

/** 集体备课分工计划（向导创建） */
@Entity('collab_plans')
export class CollabPlan extends BaseEntity {
  @Column({ name: 'group_id', type: 'int' })
  groupId: number;

  @Column({ type: 'varchar', length: 128 })
  topic: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  mode: string | null;

  @Column({ type: 'text' })
  plan: string;
}

/** 协作动态 */
@Entity('collab_feeds')
@Index('idx_cf_group', ['groupId'])
export class CollabFeed extends BaseEntity {
  @Column({ name: 'group_id', type: 'int' })
  groupId: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ type: 'text' })
  content: string;
}

/** T6 教学资源库 */
@Entity('resources')
@Index('idx_res_teacher', ['teacherId'])
@Index('idx_res_type', ['type'])
export class Resource extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'int' })
  teacherId: number;

  @Column({ type: 'varchar', length: 16, default: '教案' })
  type: string;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 32, default: '自建' })
  license: string;

  @Column({ name: 'file_id', type: 'int', nullable: true })
  fileId: number | null;

  @Column({ name: 'download_count', type: 'int', default: 0 })
  downloadCount: number;

  @Column({ name: 'usage_count', type: 'int', default: 0 })
  usageCount: number;
}
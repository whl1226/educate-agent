import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/** 预警（A3 控辍 / A4 心理欺凌 / A2 师资缺口），"预警不诊断" */
@Entity('alerts')
@Index('idx_alerts_type_status', ['alertType', 'status'])
@Index('idx_alerts_severity', ['severity'])
@Index('idx_alerts_student', ['studentId'])
export class Alert extends BaseEntity {
  @Column({ type: 'varchar', length: 32 })
  alertType: string;

  @Column({ type: 'varchar', length: 16, default: 'medium' })
  severity: string;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'student_id', type: 'int', nullable: true })
  studentId: number | null;

  @Column({ name: 'school_id', type: 'int', nullable: true })
  schoolId: number | null;

  @Column({ name: 'risk_score', type: 'real', nullable: true })
  riskScore: number | null;

  @Column({ type: 'varchar', length: 16, default: 'new' })
  status: string;

  @Column({ name: 'resolved_at', type: 'datetime', nullable: true })
  resolvedAt: Date | null;
}

/** 风险信号明细（证据可溯源） */
@Entity('alert_signals')
@Index('idx_as_alert', ['alertId'])
export class AlertSignal extends BaseEntity {
  @Column({ name: 'alert_id', type: 'int' })
  alertId: number;

  @Column({ type: 'varchar', length: 32 })
  signalType: string;

  @Column({ type: 'real', nullable: true })
  value: number | null;

  @Column({ type: 'text', nullable: true })
  evidence: string | null;
}

/** 预警处置闭环（时间线留痕） */
@Entity('alert_disposals')
@Index('idx_ad_alert', ['alertId'])
export class AlertDisposal extends BaseEntity {
  @Column({ name: 'alert_id', type: 'int' })
  alertId: number;

  @Column({ type: 'int', default: 1 })
  step: number;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ name: 'operator_id', type: 'int', nullable: true })
  operatorId: number | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;
}

/** A5 督导任务 */
@Entity('supervise_tasks')
@Index('idx_st_status', ['status'])
export class SuperviseTask extends BaseEntity {
  @Column({ type: 'varchar', length: 32 })
  taskNo: string;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'varchar', length: 16, default: 'alert' })
  source: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  owner: string | null;

  @Column({ type: 'varchar', length: 16, default: 'todo' })
  status: string;

  @Column({ type: 'datetime', nullable: true })
  deadline: Date | null;

  @Column({ name: 'archived_at', type: 'datetime', nullable: true })
  archivedAt: Date | null;
}

/** A6 教师画像 */
@Entity('teacher_profiles')
@Index('idx_tp_teacher', ['teacherId'])
export class TeacherProfile extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'int' })
  teacherId: number;

  /** JSON {教学质量,教研,AI融合,带教,口碑,发展} */
  @Column({ type: 'text' })
  metrics: string;

  @Column({ type: 'text', nullable: true })
  tags: string | null;

  @Column({ type: 'text', nullable: true })
  suggestions: string | null;
}

/** A2 师资台账 */
@Entity('teacher_stats')
@Index('idx_ts_school', ['schoolId'])
@Index('idx_ts_subject', ['subject'])
export class TeacherStat extends BaseEntity {
  @Column({ name: 'school_id', type: 'int' })
  schoolId: number;

  @Column({ name: 'teacher_id', type: 'int' })
  teacherId: number;

  @Column({ type: 'varchar', length: 16 })
  subject: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  ageGroup: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  education: string | null;

  @Column({ name: 'is_backbone', type: 'int', default: 0 })
  isBackbone: number;

  @Column({ name: 'retire_year', type: 'int', nullable: true })
  retireYear: number | null;
}

/** A7 城乡资源均衡快照 */
@Entity('school_resource_stats')
@Index('idx_srs_school', ['schoolId'])
export class SchoolResourceStat extends BaseEntity {
  @Column({ name: 'school_id', type: 'int' })
  schoolId: number;

  @Column({ type: 'varchar', length: 16 })
  period: string;

  @Column({ name: 'media_count', type: 'int', default: 0 })
  mediaCount: number;

  @Column({ name: 'teacher_ratio', type: 'real', nullable: true })
  teacherRatio: number | null;

  @Column({ name: 'books_per_student', type: 'real', nullable: true })
  booksPerStudent: number | null;

  @Column({ name: 'budget_level', type: 'int', nullable: true })
  budgetLevel: number | null;

  @Column({ type: 'int', nullable: true })
  bandwidth: number | null;
}

/** 教研活动（管理端 research + 教师端集体备课联动） */
@Entity('research_activities')
@Index('idx_ra_status', ['status'])
export class ResearchActivity extends BaseEntity {
  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'varchar', length: 32 })
  type: string;

  @Column({ type: 'varchar', length: 16, default: 'all' })
  rangeType: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  rangeDesc: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  whenDesc: string | null;

  @Column({ type: 'varchar', length: 16, default: 'ongoing' })
  status: string;

  @Column({ type: 'int', default: 0 })
  participants: number;

  @Column({ name: 'result_count', type: 'int', default: 0 })
  resultCount: number;

  @Column({ name: 'creator_id', type: 'int' })
  creatorId: number;
}
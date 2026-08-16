import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/** P1 脱敏学情周报 */
@Entity('weekly_reports')
@Index('idx_wr_student_week', ['studentId', 'weekNo'])
export class WeeklyReport extends BaseEntity {
  @Column({ name: 'student_id', type: 'int' })
  studentId: number;

  @Column({ name: 'week_no', type: 'int' })
  weekNo: number;

  @Column({ name: 'total_score', type: 'real' })
  totalScore: number;

  @Column({ name: 'prev_score', type: 'real', nullable: true })
  prevScore: number | null;

  /** 数据血缘说明（依据本周 N 次作答 · 已获家长授权） */
  @Column({ name: 'auth_note', type: 'text', nullable: true })
  authNote: string | null;

  @Column({ name: 'teacher_note', type: 'text', nullable: true })
  teacherNote: string | null;

  /** JSON 各科掌握度 */
  @Column({ type: 'text', nullable: true })
  masteries: string | null;

  /** JSON 成长足迹 */
  @Column({ type: 'text', nullable: true })
  footprints: string | null;

  @Column({ type: 'varchar', length: 16, default: 'published' })
  status: string;
}

/** P2 语音留言 */
@Entity('voice_messages')
@Index('idx_vm_from', ['fromUserId'])
@Index('idx_vm_to', ['toUserId'])
export class VoiceMessage extends BaseEntity {
  @Column({ name: 'from_user_id', type: 'int' })
  fromUserId: number;

  @Column({ name: 'to_user_id', type: 'int' })
  toUserId: number;

  @Column({ type: 'varchar', length: 8, default: 'parent' })
  direction: string;

  @Column({ name: 'duration_sec', type: 'int', default: 0 })
  durationSec: number;

  @Column({ type: 'text', nullable: true })
  text: string | null;

  @Column({ name: 'audio_file_id', type: 'int', nullable: true })
  audioFileId: number | null;

  @Column({ name: 'read_at', type: 'datetime', nullable: true })
  readAt: Date | null;
}

/** P5 家庭教育课程 */
@Entity('family_courses')
export class FamilyCourse extends BaseEntity {
  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  weekday: string | null;

  /** JSON 要点 */
  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ name: 'audio_file_id', type: 'int', nullable: true })
  audioFileId: number | null;

  @Column({ name: 'duration_min', type: 'int', default: 3 })
  durationMin: number;
}

/** 家长课程学习进度 */
@Entity('family_course_progress')
@Index('idx_fcp_parent', ['parentId'])
export class FamilyCourseProgress extends BaseEntity {
  @Column({ name: 'parent_id', type: 'int' })
  parentId: number;

  @Column({ name: 'course_id', type: 'int' })
  courseId: number;

  @Column({ type: 'varchar', length: 16, default: 'todo' })
  status: string;

  @Column({ name: 'learned_at', type: 'datetime', nullable: true })
  learnedAt: Date | null;
}
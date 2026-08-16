import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/** S10 书库 */
@Entity('books')
export class Book extends BaseEntity {
  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  level: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  grade: string | null;

  @Column({ type: 'int', default: 6 })
  chapters: number;

  /** JSON 章节正文 */
  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  excerpt: string | null;

  /** JSON 读后问答 [{q, options, answer}] */
  @Column({ type: 'text', nullable: true })
  quiz: string | null;
}

/** 阅读进度 */
@Entity('reading_progress')
@Index('idx_rp_student', ['studentId'])
export class ReadingProgress extends BaseEntity {
  @Column({ name: 'student_id', type: 'int' })
  studentId: number;

  @Column({ name: 'book_id', type: 'int' })
  bookId: number;

  @Column({ type: 'int', default: 0 })
  chapter: number;

  @Column({ type: 'varchar', length: 16, default: 'reading' })
  status: string;

  @Column({ type: 'int', default: 0 })
  minutes: number;

  @Column({ type: 'int', default: 0 })
  points: number;
}

/** S8 英语听说记录 */
@Entity('voice_practice_records')
@Index('idx_vpr_student', ['studentId'])
export class VoicePracticeRecord extends BaseEntity {
  @Column({ name: 'student_id', type: 'int' })
  studentId: number;

  @Column({ type: 'text' })
  sentence: string;

  @Column({ type: 'real', nullable: true })
  score: number | null;

  @Column({ type: 'real', nullable: true })
  fluency: number | null;

  @Column({ type: 'real', nullable: true })
  accuracy: number | null;

  @Column({ name: 'practiced_at', type: 'datetime' })
  practicedAt: Date;
}

/** S9 语文朗读记录 */
@Entity('reading_practice_records')
@Index('idx_rpr_student', ['studentId'])
export class ReadingPracticeRecord extends BaseEntity {
  @Column({ name: 'student_id', type: 'int' })
  studentId: number;

  @Column({ type: 'varchar', length: 128 })
  poem: string;

  @Column({ name: 'weak_syllables', type: 'text', nullable: true })
  weakSyllables: string | null;

  @Column({ type: 'real', nullable: true })
  score: number | null;

  @Column({ name: 'practiced_at', type: 'datetime' })
  practicedAt: Date;
}

/** S12 编程进度 */
@Entity('code_progress')
@Index('idx_cp_student', ['studentId'])
export class CodeProgress extends BaseEntity {
  @Column({ name: 'student_id', type: 'int' })
  studentId: number;

  @Column({ type: 'int', default: 1 })
  level: number;

  @Column({ name: 'task_id', type: 'int', default: 1 })
  taskId: number;

  @Column({ type: 'varchar', length: 16, default: 'locked' })
  status: string;

  @Column({ type: 'int', default: 0 })
  stars: number;
}

/** 徽章成就 */
@Entity('badges')
@Index('idx_badge_student', ['studentId'])
export class Badge extends BaseEntity {
  @Column({ name: 'student_id', type: 'int' })
  studentId: number;

  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 64 })
  name: string;
}

/** AI 会话（S1 苏格拉底辅导 / S4 知识问答） */
@Entity('ai_conversations')
@Index('idx_ac_user', ['userId'])
export class AiConversation extends BaseEntity {
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 16 })
  type: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: string;
}

/** 会话消息（含出处引用 refs —— 可溯源） */
@Entity('ai_messages')
@Index('idx_am_conv', ['conversationId'])
export class AiMessage extends BaseEntity {
  @Column({ name: 'conversation_id', type: 'int' })
  conversationId: number;

  @Column({ type: 'varchar', length: 16 })
  role: string;

  @Column({ type: 'text' })
  content: string;

  /** JSON 出处引用 [{title, ref}] */
  @Column({ type: 'text', nullable: true })
  refs: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: 16, default: 'normal' })
  kind: string;
}
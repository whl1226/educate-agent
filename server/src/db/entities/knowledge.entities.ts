import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/** D2 知识点图谱（树形） */
@Entity('knowledge_points')
@Index('idx_kp_subject_grade', ['subject', 'grade'])
export class KnowledgePoint extends BaseEntity {
  @Column({ type: 'varchar', length: 16 })
  subject: string;

  @Column({ type: 'varchar', length: 16 })
  grade: string;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ name: 'parent_id', type: 'int', nullable: true })
  parentId: number | null;

  @Column({ type: 'int', default: 1 })
  level: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}

/** D1 教材/课标内容（RAG 检索源） */
@Entity('textbook_contents')
@Index('idx_tb_subject_grade', ['subject', 'grade'])
@Index('idx_tb_title', ['title'])
export class TextbookContent extends BaseEntity {
  @Column({ type: 'varchar', length: 16 })
  subject: string;

  @Column({ type: 'varchar', length: 16 })
  grade: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  chapter: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  unit: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  section: string | null;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  /** 来源标注（人教版2013审定 等）——数据可溯源 */
  @Column({ type: 'varchar', length: 64, nullable: true })
  source: string | null;

  @Column({ type: 'varchar', length: 32, default: '公开领域' })
  license: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  version: string | null;
}

export type QuestionType = 'choice' | 'fill' | 'answer';

/** D3 题库 */
@Entity('questions')
@Index('idx_q_kp', ['knowledgePointId'])
@Index('idx_q_subject_grade_diff', ['subject', 'grade', 'difficulty'])
export class Question extends BaseEntity {
  @Column({ type: 'varchar', length: 16 })
  subject: string;

  @Column({ type: 'varchar', length: 16 })
  grade: string;

  @Column({ name: 'knowledge_point_id', type: 'int' })
  knowledgePointId: number;

  @Column({ type: 'varchar', length: 16 })
  type: QuestionType;

  @Column({ type: 'int', default: 3 })
  difficulty: number;

  @Column({ type: 'text' })
  stem: string;

  /** JSON 数组：["A. xx","B. xx"]（选择题） */
  @Column({ type: 'text', nullable: true })
  options: string | null;

  @Column({ type: 'text' })
  answer: string;

  @Column({ type: 'text', nullable: true })
  analysis: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  source: string | null;

  @Column({ type: 'varchar', length: 32, default: '公开/自建' })
  license: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: string;
}

/** D4 模板库（教案/课件/家长会/开学包/微课/发言稿） */
@Entity('templates')
export class Template extends BaseEntity {
  @Column({ type: 'varchar', length: 32 })
  type: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 32, default: '自建' })
  license: string;
}

/** D5 沟通/教研知识库（留守儿童/家校话术/家庭教育/教研规则） */
@Entity('knowledge_base_entries')
@Index('idx_kbe_category_scene', ['category', 'scene'])
export class KnowledgeBaseEntry extends BaseEntity {
  @Column({ type: 'varchar', length: 32 })
  category: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  scene: string | null;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'text' })
  content: string;
}

/** 教材知识块（RAG 检索单元：分块 + 向量） */
@Entity('knowledge_chunks')
@Index('idx_kc_textbook', ['textbookId'])
@Index('idx_kc_kp', ['knowledgePointId'])
export class KnowledgeChunk extends BaseEntity {
  @Column({ name: 'textbook_id', type: 'int' })
  textbookId: number;

  @Column({ name: 'knowledge_point_id', type: 'int', nullable: true })
  knowledgePointId: number | null;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  /** 章节定位（溯源用） */
  @Column({ type: 'varchar', length: 64, nullable: true })
  chapter: string | null;

  /** 向量：JSON 数字数组（降级模式为 0/1 特征向量） */
  @Column({ type: 'text', nullable: true })
  embedding: string | null;

  /** 来源标注（与 textbook 一致） */
  @Column({ type: 'varchar', length: 64, nullable: true })
  source: string | null;
}
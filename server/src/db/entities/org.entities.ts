import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

export type SchoolType = '镇中' | '村小' | '教学点';

/** 学校（区域治理与城乡均衡 A7 数据源） */
@Entity('schools')
export class School extends BaseEntity {
  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'varchar', length: 64 })
  region: string;

  @Column({ type: 'varchar', length: 16, default: '村小' })
  schoolType: SchoolType;

  @Column({ type: 'varchar', length: 64, nullable: true })
  principal: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  address: string | null;

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

/** 班级 */
@Entity('classes')
@Index('idx_classes_school', ['schoolId'])
@Index('idx_classes_head', ['headTeacherId'])
export class ClassEntity extends BaseEntity {
  @Column({ name: 'school_id', type: 'int' })
  schoolId: number;

  @Column({ type: 'varchar', length: 16 })
  grade: string;

  @Column({ type: 'varchar', length: 32 })
  className: string;

  @Column({ name: 'head_teacher_id', type: 'int', nullable: true })
  headTeacherId: number | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  academicYear: string | null;
}

/** 教师-班级-学科（一师多科） */
@Entity('teacher_class_links')
@Index('idx_tcl_teacher', ['teacherId'])
@Index('idx_tcl_class', ['classId'])
export class TeacherClassLink extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'int' })
  teacherId: number;

  @Column({ name: 'class_id', type: 'int' })
  classId: number;

  @Column({ type: 'varchar', length: 16 })
  subject: string;

  @Column({ name: 'is_head_teacher', type: 'int', default: 0 })
  isHeadTeacher: number;
}

/** 学生-家长绑定（多家长：父母+祖辈） */
@Entity('student_parent_links')
@Index('idx_spl_student', ['studentId'])
@Index('idx_spl_parent', ['parentId'])
export class StudentParentLink extends BaseEntity {
  @Column({ name: 'student_id', type: 'int' })
  studentId: number;

  @Column({ name: 'parent_id', type: 'int' })
  parentId: number;

  @Column({ type: 'varchar', length: 16, default: '父亲' })
  relation: string;

  @Column({ name: 'is_primary', type: 'int', default: 0 })
  isPrimary: number;
}

/** 学生归属（班级/学校/学号），关联 users 表 */
@Entity('students')
@Index('idx_students_user', ['userId'])
@Index('idx_students_class', ['classId'])
export class Student extends BaseEntity {
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'school_id', type: 'int' })
  schoolId: number;

  @Column({ name: 'class_id', type: 'int' })
  classId: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  studentNo: string | null;
}
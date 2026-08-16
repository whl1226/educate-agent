import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { User, UserStatus } from '../../db/entities/auth.entities';
import { ClassEntity, School, Student, StudentParentLink, TeacherClassLink } from '../../db/entities/org.entities';
import { AnswerRecord } from '../../db/entities/behavior.entities';
import { MasterySnapshot } from '../../db/entities/diagnosis.entities';
import { JwtUser } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz.exception';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { maskPhone } from '../../common/utils/mask.util';

@Injectable()
export class OrgService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(School) private readonly schools: Repository<School>,
    @InjectRepository(ClassEntity) private readonly classes: Repository<ClassEntity>,
    @InjectRepository(TeacherClassLink) private readonly tcls: Repository<TeacherClassLink>,
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(StudentParentLink) private readonly spls: Repository<StudentParentLink>,
    @InjectRepository(AnswerRecord) private readonly answers: Repository<AnswerRecord>,
    @InjectRepository(MasterySnapshot) private readonly snapshots: Repository<MasterySnapshot>,
  ) {}

  // ================= 用户 =================

  async listUsers(page: number, pageSize: number, role?: string, keyword?: string) {
    const qb = this.users.createQueryBuilder('u').select([
      'u.id', 'u.username', 'u.displayName', 'u.role', 'u.phone', 'u.status',
      'u.studentNo', 'u.createdAt', 'u.lastLoginAt',
    ]);
    if (role) qb.andWhere('u.role = :role', { role });
    if (keyword) {
      qb.andWhere('(u.displayName LIKE :kw OR u.username LIKE :kw OR u.phone LIKE :kw)', {
        kw: `%${keyword}%`,
      });
    }
    qb.orderBy('u.id', 'ASC')
      .skip((page - 1) * pageSize)
      .take(Math.min(pageSize, 100));
    const [list, total] = await qb.getManyAndCount();
    return {
      total,
      list: list.map((u) => ({ ...u, phone: maskPhone(u.phone) })),
    };
  }

  async listTeachers() {
    const list = await this.users.find({
      where: { role: 'teacher', status: 'active' },
      select: ['id', 'username', 'displayName', 'phone'],
    });
    return list.map((u) => ({ id: u.id, name: u.displayName, phone: maskPhone(u.phone) }));
  }

  async patchUser(adminId: number, userId: number, patch: { status?: string }) {
    const target = await this.users.findOne({ where: { id: userId } });
    if (!target) throw new BizException(ErrorCodes.NOT_FOUND, '用户不存在');
    if (target.id === adminId && patch.status === 'disabled') {
      throw new BizException(ErrorCodes.FORBIDDEN, '不能停用当前登录账号');
    }
    await this.users.update(userId, { status: patch.status as UserStatus });
    return { ok: true };
  }

  // ================= 班级 =================

  async myClasses(user: JwtUser) {
    if (user.role === 'admin') {
      return this.classes.find({ order: { id: 'ASC' } });
    }
    if (user.role === 'teacher') {
      const links = await this.tcls.find({ where: { teacherId: user.id } });
      const ids = links.map((l) => l.classId);
      if (!ids.length) return [];
      return this.classes.find({ where: { id: In(ids) }, order: { id: 'ASC' } });
    }
    if (user.role === 'student') {
      const s = await this.students.findOne({ where: { userId: user.id } });
      return s ? this.classes.find({ where: { id: s.classId } }) : [];
    }
    // parent：绑定孩子所在班级
    const bindings = await this.spls.find({ where: { parentId: user.id } });
    const studentIds = bindings.map((b) => b.studentId);
    if (!studentIds.length) return [];
    const stus = await this.students.find({ where: { id: In(studentIds) } });
    const classIds = [...new Set(stus.map((s) => s.classId))];
    return this.classes.find({ where: { id: In(classIds) } });
  }

  /** 校验教师是否任教该班（水平越权拦截） */
  async assertClassTeacher(user: JwtUser, classId: number) {
    if (user.role === 'admin') return;
    if (user.role === 'teacher') {
      const link = await this.tcls.findOne({ where: { teacherId: user.id, classId } });
      if (!link) throw new BizException(ErrorCodes.SCOPE_FORBIDDEN);
      return;
    }
    throw new BizException(ErrorCodes.FORBIDDEN);
  }

  async classStudents(classId: number, page: number, pageSize: number, keyword?: string) {
    const stus = await this.students.find({ where: { classId } });
    const userIds = stus.map((s) => s.userId);
    if (!userIds.length) return { total: 0, list: [] };
    const qb = this.users
      .createQueryBuilder('u')
      .select(['u.id', 'u.username', 'u.displayName', 'u.gender', 'u.studentNo', 'u.status'])
      .where('u.id IN (:...ids)', { ids: userIds });
    if (keyword) qb.andWhere('(u.displayName LIKE :kw OR u.studentNo LIKE :kw)', { kw: `%${keyword}%` });
    qb.orderBy('u.studentNo', 'ASC')
      .skip((page - 1) * pageSize)
      .take(Math.min(pageSize, 100));
    const [list, total] = await qb.getManyAndCount();
    return { total, list };
  }

  async classOverview(classId: number) {
    const stus = await this.students.find({ where: { classId } });
    const studentIds = stus.map((s) => s.userId);
    const total = studentIds.length;
    const since = new Date(Date.now() - 7 * 86_400_000);
    let answerCount = 0;
    let correct = 0;
    let avgMastery = 0;
    if (studentIds.length) {
      const records = await this.answers.find({ where: { studentId: In(studentIds), answeredAt: MoreThan(since) } });
      answerCount = records.length;
      correct = records.filter((r) => r.isCorrect).length;
      const latest = await this.latestSnapshots(studentIds);
      if (latest.length) {
        avgMastery = Math.round((latest.reduce((s, m) => s + m.mastery, 0) / latest.length) * 10) / 10;
      }
    }
    return {
      total,
      answerCount7d: answerCount,
      accuracy7d: answerCount ? Math.round((correct / answerCount) * 100) : 0,
      avgMastery,
      pendingGrading: 0,
    };
  }

  async knowledgeMastery(classId: number) {
    const stus = await this.students.find({ where: { classId } });
    const studentIds = stus.map((s) => s.userId);
    if (!studentIds.length) return [];
    const latest = await this.latestSnapshots(studentIds);
    const byKp = new Map<number, { name: string; total: number; sum: number }>();
    for (const m of latest) {
      const item = byKp.get(m.knowledgePointId) || { name: `知识点#${m.knowledgePointId}`, total: 0, sum: 0 };
      item.total++;
      item.sum += m.mastery;
      byKp.set(m.knowledgePointId, item);
    }
    const rows = [...byKp.entries()].map(([kpId, v]) => ({
      knowledgePointId: kpId,
      mastery: Math.round((v.sum / v.total) * 10) / 10,
      students: v.total,
    }));
    return rows.sort((a, b) => b.mastery - a.mastery);
  }

  async riskStudents(classId: number) {
    const stus = await this.students.find({ where: { classId } });
    const studentIds = stus.map((s) => s.userId);
    if (!studentIds.length) return [];
    const latest = await this.latestSnapshots(studentIds);
    const byStudent = new Map<number, number[]>();
    for (const m of latest) {
      const arr = byStudent.get(m.studentId) || [];
      arr.push(m.mastery);
      byStudent.set(m.studentId, arr);
    }
    const rows = [...byStudent.entries()]
      .map(([sid, arr]) => ({
        studentId: sid,
        // 注意：snapshot.mastery 存的是小数（0~1），阈值必须与尺度一致
        avg: Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100,
        kpCount: arr.length,
        weakKp: Math.min(...arr),
      }))
      .filter((r) => r.avg < 0.6)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 10);
    const users = await this.users.find({ where: { id: In(rows.map((r) => r.studentId)) } });
    return rows.map((r) => ({
      ...r,
      name: users.find((u) => u.id === r.studentId)?.displayName ?? '未知',
      confidence: Math.min(0.95, 0.6 + r.kpCount * 0.05),
    }));
  }

  async classTrends(classId: number, days: number) {
    const stus = await this.students.find({ where: { classId } });
    const studentIds = stus.map((s) => s.userId);
    const n = Math.min(Math.max(days, 1), 30);
    const labels: string[] = [];
    const counts: number[] = [];
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(since.getTime() - i * 86_400_000);
      labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
      counts.push(0);
    }
    if (studentIds.length) {
      const records = await this.answers.find({
        where: { studentId: In(studentIds), answeredAt: MoreThan(since) },
      });
      for (const r of records) {
        // answeredAt 为 UTC 存储，需先转成本地时区午夜再归桶，避免本地 0~8 点的作答被丢弃
        const localMidnight = new Date(r.answeredAt);
        localMidnight.setHours(0, 0, 0, 0);
        const idx = n - 1 - Math.floor((since.getTime() - localMidnight.getTime()) / 86_400_000);
        if (idx >= 0 && idx < n) counts[idx]++;
      }
    }
    return { labels, counts };
  }

  // ================= 学生个体 =================

  async studentMastery(user: JwtUser, studentId: number) {
    if (user.role === 'student' && user.id !== studentId) {
      throw new BizException(ErrorCodes.SCOPE_FORBIDDEN);
    }
    if (user.role === 'parent') {
      const binding = await this.spls.findOne({ where: { parentId: user.id, studentId } });
      if (!binding) throw new BizException(ErrorCodes.SCOPE_FORBIDDEN);
    }
    if (user.role === 'teacher') {
      const s = await this.students.findOne({ where: { userId: studentId } });
      // 学生不存在（或不在班级）时同样拒绝，防止跳过越权校验
      if (!s) throw new BizException(ErrorCodes.NOT_FOUND, '学生不存在');
      await this.assertClassTeacher(user, s.classId);
    }
    const latest = await this.latestSnapshots([studentId]);
    const records = await this.answers.find({
      where: { studentId },
      order: { answeredAt: 'DESC' },
      take: 50,
    });
    const total = records.length;
    const correct = records.filter((r) => r.isCorrect).length;
    const byKp = new Map<number, { total: number; correct: number; mastery: number; confidence: number }>();
    for (const m of latest) {
      byKp.set(m.knowledgePointId, { total: 0, correct: 0, mastery: m.mastery, confidence: m.confidence });
    }
    for (const r of records) {
      const item = byKp.get(r.knowledgePointId);
      if (item) {
        item.total++;
        if (r.isCorrect) item.correct++;
      }
    }
    const dims = [...byKp.entries()].map(([kpId, v]) => ({
      knowledgePointId: kpId,
      mastery: v.mastery,
      confidence: v.confidence,
      evidenceCount: v.total,
    }));
    return {
      overallMastery: latest.length
        ? Math.round((latest.reduce((s, m) => s + m.mastery, 0) / latest.length) * 10) / 10
        : 0,
      answerCount: total,
      accuracy: total ? Math.round((correct / total) * 100) : 0,
      dims,
      lastComputedAt: latest[0]?.computedAt ?? null,
    };
  }

  /** 家长的孩子信息（含班主任，用于周报/语音留言） */
  async childrenWithTeacher(parentId: number) {
    const bindings = await this.spls.find({ where: { parentId }, order: { isPrimary: 'DESC' } });
    const studentIds = bindings.map((b) => b.studentId);
    if (!studentIds.length) return [];
    const stus = await this.students.find({ where: { id: In(studentIds) } });
    const classIds = [...new Set(stus.map((s) => s.classId))];
    const classes = classIds.length ? await this.classes.find({ where: { id: In(classIds) } }) : [];
    const users = await this.users.find({
      where: { id: In(stus.map((s) => s.userId)) },
      select: ['id', 'displayName', 'studentNo'],
    });
    const headIds = [...new Set(classes.map((c) => c.headTeacherId).filter((x): x is number => x != null))];
    const heads = headIds.length
      ? await this.users.find({ where: { id: In(headIds) }, select: ['id', 'displayName'] })
      : [];
    return bindings.map((b) => {
      const s = stus.find((x) => x.id === b.studentId);
      const u = users.find((x) => x.id === s?.userId);
      const cls = classes.find((x) => x.id === s?.classId);
      const head = heads.find((x) => x.id === cls?.headTeacherId);
      return {
        studentId: s?.userId,
        studentName: u?.displayName ?? '未知',
        studentNo: u?.studentNo,
        relation: b.relation,
        isPrimary: !!b.isPrimary,
        className: cls?.className ?? null,
        grade: cls?.grade ?? null,
        teacherUserId: head?.id ?? null,
        teacherName: head?.displayName ?? null,
      };
    });
  }

  /** 孩子账号对应的家长（用户）列表 */
  async parentsOf(studentUserId: number) {
    const student = await this.students.findOne({ where: { userId: studentUserId } });
    if (!student) return [];
    const bindings = await this.spls.find({ where: { studentId: student.id } });
    const parentIds = [...new Set(bindings.map((b) => b.parentId))];
    if (!parentIds.length) return [];
    return this.users.find({ where: { id: In(parentIds) }, select: ['id', 'displayName'] });
  }

  async parentChildren(parentId: number) {
    const bindings = await this.spls.find({ where: { parentId }, order: { isPrimary: 'DESC' } });
    const studentIds = bindings.map((b) => b.studentId);
    if (!studentIds.length) return [];
    const stus = await this.students.find({ where: { id: In(studentIds) } });
    const users = await this.users.find({
      where: { id: In(stus.map((s) => s.userId)) },
      select: ['id', 'displayName', 'studentNo', 'gender'],
    });
    return bindings.map((b) => {
      const s = stus.find((x) => x.id === b.studentId);
      const u = users.find((x) => x.id === s?.userId);
      return {
        studentId: b.studentId,
        userId: s?.userId,
        name: u?.displayName ?? '未知',
        studentNo: u?.studentNo,
        relation: b.relation,
        isPrimary: !!b.isPrimary,
      };
    });
  }

  private async latestSnapshots(studentIds: number[]) {
    if (!studentIds.length) return [];
    return this.snapshots
      .createQueryBuilder('ms')
      .where('ms.studentId IN (:...ids)', { ids: studentIds })
      .andWhere('ms.id IN (SELECT MAX(id) FROM mastery_snapshots GROUP BY student_id, knowledge_point_id)')
      .getMany();
  }
}
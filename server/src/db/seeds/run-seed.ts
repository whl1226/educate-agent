import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { join } from 'path';
import { loadEnv } from '../../config/env.loader';
import { LoginAttempt, PasswordResetToken, Session, User } from '../entities/auth.entities';
import { ClassEntity, School, Student, StudentParentLink, TeacherClassLink } from '../entities/org.entities';
import { KnowledgeBaseEntry, KnowledgePoint, Question, Template, TextbookContent } from '../entities/knowledge.entities';
import { AnswerRecord, Checkin } from '../entities/behavior.entities';
import { Notification, SystemConfig } from '../entities/system.entities';
import {
  Alert, AlertDisposal, AlertSignal, ResearchActivity, SchoolResourceStat,
  SuperviseTask, TeacherProfile, TeacherStat,
} from '../entities/admin.entities';
import { FamilyCourse, VoiceMessage, WeeklyReport } from '../entities/parent.entities';
import {
  Badge, Book, CodeProgress, ReadingProgress, VoicePracticeRecord,
} from '../entities/student.entities';
import {
  DiagnosisRecord, ErrorBook, MasterySnapshot, PlanStep, StudyPlan,
} from '../entities/diagnosis.entities';

/**
 * 演示种子数据（幂等：已存在则跳过）。
 * 账号约定：
 *   管理员 zhoujuzhang / Admin@2026Xy（来自 .env SEED_ADMIN_*）
 *   教师   wangxiulan（王秀兰·语文·班主任）、liuzhiqiang（刘志强·数学）
 *   学生   lixiaoyu（李小雨·五(2)班）、student001..student042
 *   家长   lijiangguo（李建国·父亲）、wangfang（王芳·母亲）
 *   统一演示密码 Demo@2026xy
 */

const DEMO_PASSWORD = 'Demo@2026xy';
const BCRYPT_COST = 12;

const SURNAMES = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林'];
const GIVEN = ['浩然', '子涵', '雨欣', '梓轩', '欣怡', '俊杰', '思彤', '博文', '诗涵', '明轩', '雅静', '嘉懿', '晓彤', '宇航', '悦宁', '国豪'];

async function main() {
  loadEnv();
  const dbPath = process.env.DB_ABS || join(process.cwd(), process.env.DB_PATH || './data/xiangya.db');

  const ds = new DataSource({
    type: 'better-sqlite3',
    database: dbPath,
    synchronize: true,
    entities: [
      User, Session, PasswordResetToken, LoginAttempt,
      School, ClassEntity, TeacherClassLink, StudentParentLink, Student,
      KnowledgePoint, TextbookContent, Question, Template, KnowledgeBaseEntry,
      AnswerRecord, Checkin, Notification, SystemConfig,
      Alert, AlertDisposal, AlertSignal, ResearchActivity, SchoolResourceStat,
      SuperviseTask, TeacherProfile, TeacherStat,
      FamilyCourse, VoiceMessage, WeeklyReport,
      Badge, Book, CodeProgress, ReadingProgress, VoicePracticeRecord,
      DiagnosisRecord, ErrorBook, MasterySnapshot, PlanStep, StudyPlan,
    ],
  });
  await ds.initialize();
  console.log(`[seed] 数据库已连接: ${dbPath}`);

  // ============ 1. 学校 ============
  const schoolRepo = ds.getRepository('School');
  let school = await schoolRepo.findOne({ where: { name: '云溪镇中心小学' } });
  if (!school) {
    school = await schoolRepo.save(
      schoolRepo.create({
        name: '云溪镇中心小学',
        region: '云溪镇',
        schoolType: '镇中',
        principal: '陈国栋',
        address: '云溪镇育才路 12 号',
        mediaCount: 36,
        teacherRatio: 18.6,
        booksPerStudent: 22.4,
        budgetLevel: 2,
        bandwidth: 100,
      }),
    );
    console.log('[seed] 学校: 云溪镇中心小学');
  }

  // ============ 2. 用户 ============
  const userRepo = ds.getRepository('User');
  const seedAdmin = process.env.SEED_ADMIN_USERNAME || 'zhoujuzhang';
  const seedAdminPwd = process.env.SEED_ADMIN_PASSWORD;
  if (process.env.NODE_ENV === 'production' && !seedAdminPwd) {
    console.error('[seed] 生产环境必须通过 SEED_ADMIN_PASSWORD 显式配置管理员密码（禁止使用内置默认值）');
    process.exit(1);
  }
  const adminPassword = seedAdminPwd || 'Admin@2026Xy';

  const accounts: Array<{
    username: string;
    password: string;
    displayName: string;
    role: 'admin' | 'teacher' | 'student' | 'parent';
    phone?: string;
    gender?: string;
    studentNo?: string;
  }> = [
    { username: seedAdmin, password: adminPassword, displayName: '周局长', role: 'admin', phone: '13800001234', gender: '男' },
    { username: 'wangxiulan', password: DEMO_PASSWORD, displayName: '王秀兰', role: 'teacher', phone: '13900005678', gender: '女' },
    { username: 'liuzhiqiang', password: DEMO_PASSWORD, displayName: '刘志强', role: 'teacher', phone: '13900008765', gender: '男' },
    { username: 'lixiaoyu', password: DEMO_PASSWORD, displayName: '李小雨', role: 'student', phone: '13800009001', gender: '女', studentNo: '20260518' },
    { username: 'lijiangguo', password: DEMO_PASSWORD, displayName: '李建国', role: 'parent', phone: '13700002233', gender: '男' },
    { username: 'wangfang', password: DEMO_PASSWORD, displayName: '王芳', role: 'parent', phone: '13700004455', gender: '女' },
  ];

  // 42 人班级：student001..student042
  for (let i = 1; i <= 42; i++) {
    accounts.push({
      username: `student${String(i).padStart(3, '0')}`,
      password: DEMO_PASSWORD,
      displayName: `${SURNAMES[i % SURNAMES.length]}${GIVEN[(i * 3) % GIVEN.length]}`,
      role: 'student',
      studentNo: `2026${String(101 + i)}`,
    });
  }

  const userIds: Record<string, number> = {};
  for (const acc of accounts) {
    const exists = await userRepo.findOne({ where: { username: acc.username } });
    if (exists) {
      userIds[acc.username] = exists.id;
      continue;
    }
    const user = await userRepo.save(
      userRepo.create({
        username: acc.username,
        passwordHash: await bcrypt.hash(acc.password, BCRYPT_COST),
        displayName: acc.displayName,
        role: acc.role,
        phone: acc.phone ?? null,
        gender: acc.gender ?? null,
        studentNo: acc.studentNo ?? null,
        status: 'active',
      }),
    );
    userIds[acc.username] = user.id;
  }
  console.log(`[seed] 用户: ${Object.keys(userIds).length} 个（含 42 名学生）`);

  // ============ 3. 班级与归属 ============
  const classRepo = ds.getRepository('ClassEntity');
  let class52 = await classRepo.findOne({ where: { className: '五(2)班' } });
  if (!class52) {
    class52 = await classRepo.save(
      classRepo.create({
        schoolId: school.id,
        grade: '五年级',
        className: '五(2)班',
        headTeacherId: userIds['wangxiulan'],
        academicYear: '2025-2026',
      }),
    );
  }

  const tclRepo = ds.getRepository('TeacherClassLink');
  if (!(await tclRepo.findOne({ where: { teacherId: userIds['wangxiulan'], classId: class52.id } }))) {
    await tclRepo.save([
      tclRepo.create({ teacherId: userIds['wangxiulan'], classId: class52.id, subject: '语文', isHeadTeacher: 1 }),
      tclRepo.create({ teacherId: userIds['liuzhiqiang'], classId: class52.id, subject: '数学', isHeadTeacher: 0 }),
    ]);
  }

  const studentRepo = ds.getRepository('Student');
  for (const [username, uid] of Object.entries(userIds)) {
    if (!username.startsWith('student') && username !== 'lixiaoyu') continue;
    const exists = await studentRepo.findOne({ where: { userId: uid } });
    if (exists) continue;
    await studentRepo.save(
      studentRepo.create({
        userId: uid,
        schoolId: school.id,
        classId: class52.id,
        studentNo: username === 'lixiaoyu' ? '20260518' : `2026${String(101 + Number(username.slice(7)))}`,
      }),
    );
  }

  const splRepo = ds.getRepository('StudentParentLink');
  if (!(await splRepo.findOne({ where: { studentId: userIds['lixiaoyu'] } }))) {
    const sid = (
      await studentRepo.findOne({ where: { userId: userIds['lixiaoyu'] } })
    )!.id;
    await splRepo.save([
      splRepo.create({ studentId: sid, parentId: userIds['lijiangguo'], relation: '父亲', isPrimary: 1 }),
      splRepo.create({ studentId: sid, parentId: userIds['wangfang'], relation: '母亲', isPrimary: 0 }),
    ]);
  }
  console.log('[seed] 班级: 五(2)班 42 人，归属关系已建立');

  // ============ 4. 知识点（五年级语文） ============
  const kpRepo = ds.getRepository('KnowledgePoint');
  const kpCount = await kpRepo.count();
  if (kpCount === 0) {
    const kp = (name: string, parentId: number | null, level: number, description?: string) =>
      kpRepo.create({ subject: '语文', grade: '五年级', name, parentId, level, description: description ?? null });
    const roots = await kpRepo.save([
      kp('识字与写字', null, 1, '生字词识记、书写规范'),
      kp('阅读与理解', null, 1, '课文理解、信息提取、情感体会'),
      kp('写作表达', null, 1, '习作构思、段落组织、语言运用'),
    ]);
    await kpRepo.save([
      kp('易错多音字', roots[0].id, 2, '朝/都/尽/乐 等常见多音字辨析'),
      kp('形近字辨析', roots[0].id, 2, '辩-辨、既-即、竞-竟'),
      kp('概括主要内容', roots[1].id, 2, '六要素概括法'),
      kp('人物形象分析', roots[1].id, 2, '抓住语言、动作、神态描写'),
      kp('句子仿写', roots[2].id, 2, '排比、拟人、比喻句式'),
      kp('文章结构安排', roots[2].id, 2, '总分总、首尾呼应'),
    ]);
    console.log('[seed] 知识点: 9 个（语文·五年级）');
  }

  // ============ 4b. 知识点（数学/英语/科学·五年级） ============
  const mathKpCount = await kpRepo.count({ where: { subject: '数学' } });
  if (mathKpCount === 0) {
    const kpM = (name: string, parentId: number | null, level: number, description?: string) =>
      kpRepo.create({ subject: '数学', grade: '五年级', name, parentId, level, description: description ?? null });
    const mRoots = await kpRepo.save([
      kpM('数与代数', null, 1, '整数、小数、分数、方程'),
      kpM('图形与几何', null, 1, '平面图形、立体图形、度量'),
      kpM('统计与概率', null, 1, '数据收集、统计图表、可能性'),
    ]);
    await kpRepo.save([
      kpM('小数乘除法', mRoots[0].id, 2, '小数乘整数/小数、除数是小数的除法'),
      kpM('简易方程', mRoots[0].id, 2, '用字母表示数、解方程、列方程解决问题'),
      kpM('多边形面积', mRoots[1].id, 2, '平行四边形/三角形/梯形面积公式推导'),
      kpM('统计与可能性', mRoots[2].id, 2, '折线统计图、可能性大小'),
    ]);
    const kpE = (name: string, parentId: number | null, level: number, description?: string) =>
      kpRepo.create({ subject: '英语', grade: '五年级', name, parentId, level, description: description ?? null });
    const eRoots = await kpRepo.save([
      kpE('词汇与句型', null, 1, '核心词汇、基本句型'),
      kpE('语音与听说', null, 1, '自然拼读、听力理解、口语表达'),
    ]);
    await kpRepo.save([
      kpE('一般现在时', eRoots[0].id, 2, 'be 动词与实义动词的一般现在时'),
      kpE('现在进行时', eRoots[0].id, 2, 'be + doing 结构'),
      kpE('自然拼读', eRoots[1].id, 2, '元音字母组合发音规则'),
    ]);
    const kpS = (name: string, parentId: number | null, level: number, description?: string) =>
      kpRepo.create({ subject: '科学', grade: '五年级', name, parentId, level, description: description ?? null });
    const sRoots = await kpRepo.save([
      kpS('物质科学', null, 1, '物质变化、光、声音、热'),
      kpS('生命科学', null, 1, '植物、动物、人体'),
      kpS('地球与宇宙', null, 1, '天气、地表、日月星辰'),
    ]);
    await kpRepo.save([
      kpS('光的传播', sRoots[0].id, 2, '光的直线传播、反射'),
      kpS('声音的产生', sRoots[0].id, 2, '振动产生声音、传播需要介质'),
      kpS('植物的生长', sRoots[1].id, 2, '种子发芽条件、植物器官'),
    ]);
    console.log('[seed] 知识点: 新增 18 个（数学/英语/科学·五年级）');
  }

  // ============ 5. 教材内容 + FTS ============
  const tbRepo = ds.getRepository('TextbookContent');
  const tbCount = await tbRepo.count();
  if (tbCount === 0) {
    await tbRepo.save([
      tbRepo.create({
        subject: '语文', grade: '五年级', chapter: '第一单元', unit: '童年往事',
        title: '祖父的园子', source: '人教版 2019 审定', license: '教材内容·教育用途',
        content: '我家有一个大园子，这园子里蜜蜂、蝴蝶、蜻蜓、蚂蚱，样样都有。祖父整天都在园子里，我也跟着他在里面转。祖父栽花，我就栽花；祖父拔草，我就拔草。……一切都活了，要做什么，就做什么。要怎么样，就怎么样，都是自由的。',
      }),
      tbRepo.create({
        subject: '语文', grade: '五年级', chapter: '第二单元', unit: '古典名著',
        title: '草船借箭', source: '人教版 2019 审定', license: '教材内容·教育用途',
        content: '周瑜看到诸葛亮挺有才干，心里很妒忌。有一天，周瑜请诸葛亮商议军事，说："我们就要跟曹军交战。水上交战，用什么兵器最好？"诸葛亮说："用弓箭最好。"……诸葛亮说："都督委托，当然照办。不知道这十万支箭什么时候用？"',
      }),
      tbRepo.create({
        subject: '语文', grade: '五年级', chapter: '第五单元', unit: '人物描写',
        title: '人物描写一组·摔跤', source: '人教版 2019 审定', license: '教材内容·教育用途',
        content: '小嘎子在家里跟人摔跤，一向仗着手疾眼快，从不单凭力气，自然不跟他一叉一搂。两人把"枪"和"鞭"放在门墩儿上，各自虎势儿一站，公鸡鹐架似的对起阵来。起初，小嘎子精神抖擞，欺负对手傻大黑粗，动转不灵，围着他猴儿似的蹦来蹦去。',
      }),
    ]);
    console.log('[seed] 教材内容: 3 篇课文');

    // FTS5 全文检索索引（外部内容表 + 触发器）
    try {
      await ds.query(`
        CREATE VIRTUAL TABLE IF NOT EXISTS textbook_contents_fts
        USING fts5(title, content, content='textbook_contents', content_rowid='id')
      `);
      await ds.query(`INSERT INTO textbook_contents_fts(rowid, title, content)
        SELECT id, title, content FROM textbook_contents`);
      await ds.query(`
        CREATE TRIGGER IF NOT EXISTS textbook_fts_insert AFTER INSERT ON textbook_contents BEGIN
          INSERT INTO textbook_contents_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
        END
      `);
      await ds.query(`
        CREATE TRIGGER IF NOT EXISTS textbook_fts_delete AFTER DELETE ON textbook_contents BEGIN
          INSERT INTO textbook_contents_fts(textbook_contents_fts, rowid, title, content)
          VALUES('delete', old.id, old.title, old.content);
        END
      `);
      console.log('[seed] FTS5: textbook_contents_fts 已建立');
    } catch (e) {
      console.warn('[seed] FTS5 不可用（当前 SQLite 构建未包含 FTS5），跳过全文索引:', (e as Error).message);
    }
  }

  // ============ 5b. 教材内容（数学/英语/科学·五年级） ============
  const mathTbCount = await tbRepo.count({ where: { subject: '数学' } });
  if (mathTbCount === 0) {
    await tbRepo.save([
      tbRepo.create({
        subject: '数学', grade: '五年级', chapter: '第一单元', unit: '小数乘法',
        title: '小数乘整数', source: '人教版 2022 审定·内容摘要', license: '教育用途摘要',
        content: '小数乘整数：先把小数转化为整数计算，再根据因数中小数位数确定积的小数点位置。如 0.8×3，把 0.8 看作 8，8×3=24，0.8 有一位小数，所以积为 2.4。注意末尾有 0 时要先点小数点再去 0。',
      }),
      tbRepo.create({
        subject: '数学', grade: '五年级', chapter: '第五单元', unit: '简易方程',
        title: '用字母表示数', source: '人教版 2022 审定·内容摘要', license: '教育用途摘要',
        content: '用字母表示数：字母可以表示任意数，如 a 表示某数，2a 表示它的 2 倍。含字母的式子可表示数量关系：路程=速度×时间，记作 s=vt。书写规则：数与字母相乘省略乘号，数字写在字母前（如 3x）；1 与字母相乘省略 1（x 而非 1x）。',
      }),
      tbRepo.create({
        subject: '英语', grade: '五年级', chapter: 'Unit 1', unit: 'What is he like?',
        title: '描述人物性格词汇与句型', source: 'PEP 版·内容摘要', license: '教育用途摘要',
        content: '核心词汇：kind（和蔼的）、strict（严格的）、funny（风趣的）、polite（有礼貌的）、hard-working（勤奋的）。核心句型：What is he like? He is kind. Is she strict? Yes, she is. / No, she isnt. 拓展：Who is your English teacher? Miss White. She is young. 建议搭配角色扮演操练。',
      }),
      tbRepo.create({
        subject: '科学', grade: '五年级', chapter: '光', unit: '光与影',
        title: '光的直线传播', source: '教科版·内容摘要', license: '教育用途摘要',
        content: '光沿直线传播：光源发出的光在均匀介质中沿直线前进，因此形成影子。实验：用手电筒照射不同角度观察影子方向与长度变化——光源在物体正上方时影子最短，斜射时影子变长且方向相反。应用：皮影戏、日晷、小孔成像。',
      }),
    ]);
    console.log('[seed] 教材内容: 新增 4 条（数学/英语/科学）');
  }

  // ============ 6. 题库 ============
  const qRepo = ds.getRepository('Question');
  const qCount = await qRepo.count();
  if (qCount === 0) {
    const kps = await kpRepo.find();
    const findKp = (name: string) => kps.find((k) => k.name === name)!;
    await qRepo.save([
      qRepo.create({
        subject: '语文', grade: '五年级', knowledgePointId: findKp('易错多音字').id,
        type: 'choice', difficulty: 2, status: 'active',
        stem: '下列词语中加点字的读音完全正确的一项是（　　）',
        options: JSON.stringify(['A. 燕(yàn)山 尽(jìn)管', 'B. 燕(yān)山 尽(jǐn)管', 'C. 燕(yàn)山 尽(jǐn)管']),
        answer: 'B', analysis: '“燕山”的“燕”读 yān；“尽管”的“尽”读 jǐn。',
      }),
      qRepo.create({
        subject: '语文', grade: '五年级', knowledgePointId: findKp('形近字辨析').id,
        type: 'choice', difficulty: 3, status: 'active',
        stem: '下面句子中没有错别字的一项是（　　）',
        options: JSON.stringify(['A. 我们在辩论会上发言。', 'B. 这件事已经既成事实。', 'C. 河水竞然这么清澈。']),
        answer: 'B', analysis: 'A“辩→辨”；C“竞→竟”。',
      }),
      qRepo.create({
        subject: '语文', grade: '五年级', knowledgePointId: findKp('概括主要内容').id,
        type: 'choice', difficulty: 3, status: 'active',
        stem: '概括《草船借箭》的主要内容，最恰当的一项是（　　）',
        options: JSON.stringify(['A. 诸葛亮用妙计向曹操"借"来十万支箭', 'B. 周瑜妒忌诸葛亮', 'C. 诸葛亮造箭的故事']),
        answer: 'A', analysis: '概括要抓住主要事件和结果。',
      }),
      qRepo.create({
        subject: '语文', grade: '五年级', knowledgePointId: findKp('人物形象分析').id,
        type: 'choice', difficulty: 4, status: 'active',
        stem: '《摔跤》中小嘎子"围着他猴儿似的蹦来蹦去"，主要表现了他（　　）',
        options: JSON.stringify(['A. 轻浮好动', 'B. 机灵敏捷、善于用智', 'C. 害怕对手']),
        answer: 'B', analysis: '动作描写“蹦来蹦去”体现小嘎子的机灵劲儿。',
      }),
      qRepo.create({
        subject: '语文', grade: '五年级', knowledgePointId: findKp('句子仿写').id,
        type: 'fill', difficulty: 3, status: 'active',
        stem: '仿写句子：一切都活了，要做什么，就做什么。要怎么样，就怎么样，都是自由的。（用"要……就……"写一句话）',
        options: null, answer: '示例：小蜜蜂在花丛中飞舞，要采哪朵花，就采哪朵花。', analysis: '句式与内容贴切即可。',
      }),
      qRepo.create({
        subject: '语文', grade: '五年级', knowledgePointId: findKp('文章结构安排').id,
        type: 'answer', difficulty: 4, status: 'active',
        stem: '围绕"运动会"写一个 80 字左右的开头，要求使用"总分总"中的"总起"句。',
        options: null, answer: '示例：一年一度的春季运动会开始了，操场上彩旗飘扬，同学们个个摩拳擦掌，准备大显身手。', analysis: '总起句要点明事件、氛围。',
      }),
    ]);
    console.log('[seed] 题库: 6 题');
  }

  // ============ 6b. 题库（数学/英语/科学·五年级） ============
  // 逐题安全插入：按 subject+type+stem 查重；知识点缺失时 warn 跳过，不因旧数据导致整体失败
  const kpsAll = await kpRepo.find();
  const newMathQuestions = [
    { subject: '数学', grade: '五年级', kp: '小数乘除法', type: 'choice', difficulty: 2, stem: '0.8 × 3 的积是（　　）', options: JSON.stringify(['A. 2.4', 'B. 24', 'C. 0.24']), answer: 'A', analysis: '0.8×3：8×3=24，因数 0.8 有一位小数，积为 2.4。' },
    { subject: '数学', grade: '五年级', kp: '简易方程', type: 'choice', difficulty: 3, stem: '方程 3x + 5 = 20 的解是（　　）', options: JSON.stringify(['A. x=5', 'B. x=15', 'C. x=25']), answer: 'A', analysis: '3x+5=20 → 3x=15 → x=5。' },
    { subject: '数学', grade: '五年级', kp: '多边形面积', type: 'fill', difficulty: 3, stem: '平行四边形底 8cm、高 5cm，面积是（　　）平方厘米。', options: null, answer: '40', analysis: 'S=底×高=8×5=40。' },
    { subject: '数学', grade: '五年级', kp: '统计与可能性', type: 'choice', difficulty: 2, stem: '掷一枚硬币，正面朝上的可能性是（　　）', options: JSON.stringify(['A. 一定', 'B. 一半', 'C. 不可能']), answer: 'B', analysis: '硬币两面概率相等，各占一半。' },
    { subject: '英语', grade: '五年级', kp: '一般现在时', type: 'choice', difficulty: 2, stem: 'I ___ a student.', options: JSON.stringify(['A. is', 'B. am', 'C. are']), answer: 'B', analysis: '主语 I 用 am。' },
    { subject: '英语', grade: '五年级', kp: '现在进行时', type: 'fill', difficulty: 3, stem: 'Look! The cat ___ (sleep). 用所给词的正确形式填空。', options: null, answer: 'is sleeping', analysis: 'Look 提示正在发生，用 be+doing。' },
    { subject: '科学', grade: '五年级', kp: '光的传播', type: 'choice', difficulty: 2, stem: '下列现象说明光沿直线传播的是（　　）', options: JSON.stringify(['A. 水中筷子"折断"', 'B. 影子的形成', 'C. 镜子能成像']), answer: 'B', analysis: '影子是光被物体挡住形成的，证明光沿直线传播。' },
  ] as Array<{ subject: string; grade: string; kp: string; type: 'choice' | 'fill'; difficulty: number; stem: string; options: string | null; answer: string; analysis: string }>;
  let insertedQ = 0;
  for (const q of newMathQuestions) {
    const exists = await qRepo.findOne({ where: { subject: q.subject, type: q.type, stem: q.stem } });
    if (exists) continue;
    const kp = kpsAll.find((k) => k.subject === q.subject && k.name === q.kp);
    if (!kp) {
      console.warn(`[seed] 跳过题目「${q.stem.slice(0, 20)}」：知识点「${q.kp}」不存在（${q.subject}）`);
      continue;
    }
    await qRepo.save(
      qRepo.create({ ...q, knowledgePointId: kp.id, status: 'active' }),
    );
    insertedQ++;
  }
  if (insertedQ > 0) console.log(`[seed] 题库: 新增 ${insertedQ} 题（数学/英语/科学）`);

  // ============ 7. 模板库 ============
  const tplRepo = ds.getRepository('Template');
  if ((await tplRepo.count()) === 0) {
    await tplRepo.save([
      tplRepo.create({
        type: 'lesson_plan', name: '五年级语文·精读课文教案模板',
        content: '一、教学目标（知识与能力/过程与方法/情感态度与价值观）\n二、教学重难点\n三、教学准备\n四、教学过程（导入→初读→精读→拓展→小结）\n五、板书设计\n六、作业布置\n七、教学反思',
      }),
      tplRepo.create({
        type: 'parent_meeting', name: '期中家长会流程模板',
        content: '一、开场致辞\n二、班级整体情况汇报\n三、学科学习情况分析\n四、家庭教育建议（附留守儿童关怀要点）\n五、互动答疑\n六、会后个别沟通',
      }),
      tplRepo.create({
        type: 'lessonware', name: '课件结构模板（10 页标准）',
        content: '封面→学习目标→复习导入→新知讲授（3-4 页）→课堂练习→易错点提示→课堂小结→作业布置→结束页',
      }),
    ]);
    console.log('[seed] 模板库: 3 个');
  }

  // ============ 8. 沟通/教研知识库 ============
  const kbeRepo = ds.getRepository('KnowledgeBaseEntry');
  if ((await kbeRepo.count()) === 0) {
    await kbeRepo.save([
      kbeRepo.create({
        category: '家校沟通', scene: '留守儿童',
        title: '留守儿童家长沟通话术要点',
        content: '1. 先肯定孩子在学校的进步；2. 说明孩子近期情绪与学习状态；3. 给出可操作建议（每周视频通话频次、作业陪伴）；4. 避免指责性语言，强调家校协同。',
      }),
      kbeRepo.create({
        category: '家庭教育', scene: '手机管理',
        title: '孩子沉迷手机的家庭干预建议',
        content: '约定使用时间（每天不超过 1 小时）→ 划定使用场景（作业完成前不用）→ 家长以身作则 → 用户外活动替代屏幕时间 → 必要时求助班主任。',
      }),
      kbeRepo.create({
        category: '教研规则', scene: '集体备课',
        title: '乡镇小学集体备课基本流程',
        content: '主备人初备→集体研讨（重难点/学情/教法）→二次修改→课堂实施→课后复盘。两周一次，覆盖全学科。',
      }),
    ]);
    console.log('[seed] 知识库: 3 条');
  }

  // ============ 8b. 教研规则/家校沟通知识库扩充 ============
  const kbeFiveDim = await kbeRepo.count({ where: { title: '优质教案五维评价标准' } });
  if (kbeFiveDim === 0) {
    await kbeRepo.save([
      kbeRepo.create({
        category: '教研规则', scene: '教案评价',
        title: '优质教案五维评价标准',
        content: '1. 目标设计：三维目标具体可测、与课标一致；2. 过程设计：环节完整、时间分配合理、有梯度问题链；3. 活动设计：学生活动真实参与、有合作探究；4. 评价设计：有课堂检测与反馈机制、教学评一致；5. 作业设计：分层（A/B/C）、总量适度、联系生活。',
      }),
      kbeRepo.create({
        category: '教研规则', scene: '分层教学',
        title: '乡村小班化分层教学要点',
        content: '按掌握度分 A（基础巩固）/B（能力提升）/C（拓展挑战）三层：A 层重概念与基本练习，B 层加变式与情境题，C 层给综合与开放题。每层 1-2 道搭桥题照顾临界生；小组内异质分组促进互助。',
      }),
      kbeRepo.create({
        category: '教研规则', scene: '课堂提问',
        title: '课堂提问链设计方法',
        content: '问题链三步法：① 回忆型（是什么）激活旧知；② 理解型（为什么）建立联系；③ 应用型（怎么办）迁移运用。每环节至少留 8 秒思考时间，先点名再提问，避免齐答掩盖个体差异。',
      }),
      kbeRepo.create({
        category: '教研规则', scene: '作业设计',
        title: '双减背景下的作业设计原则',
        content: '控量提质：书面作业每天不超过 60 分钟（中年级）；基础作业+弹性作业相结合；作业即评价，当天反馈；设计实践类/阅读类/合作类作业提升兴趣。',
      }),
      kbeRepo.create({
        category: '家校沟通', scene: '留守儿童',
        title: '与外出务工家长沟通建议',
        content: '固定每周一次视频通话（教师-家长-学生三方）；通话前准备 2-3 个具体表扬点；用成长记录照片增强参与感；指导家长用语音留言保持日常陪伴；重要节点（考试/情绪波动）及时同步。',
      }),
      kbeRepo.create({
        category: '家校沟通', scene: '祖辈监护人',
        title: '与祖辈监护人沟通要点',
        content: '用方言或简单表述，一句话一个指令；先报喜再谈问题；强调"您放心"降低焦虑；布置可操作任务（如提醒收作业、保证睡眠）；避免专业术语。',
      }),
      kbeRepo.create({
        category: '家庭教育', scene: '学习习惯',
        title: '小学生专注力训练家庭建议',
        content: '分段计时学习（20 分钟一节，中间休息 5 分钟）；创设安静整洁的学习角；用番茄钟游戏化训练；减少电子设备干扰；亲子共读提升持续注意。',
      }),
    ]);
    console.log('[seed] 知识库: 新增 7 条（教研规则/家校沟通/家庭教育）');
  }

  // ============ 9. 演示行为数据（李小雨） ============
  const arRepo = ds.getRepository('AnswerRecord');
  if ((await arRepo.count()) === 0) {
    const questions = await qRepo.find();
    const lxy = userIds['lixiaoyu'];
    const results = [
      { q: questions[0], correct: 1, answer: 'B' },
      { q: questions[1], correct: 0, answer: 'A' },
      { q: questions[2], correct: 1, answer: 'A' },
      { q: questions[3], correct: 1, answer: 'B' },
      { q: questions[4], correct: 0, answer: '小蜜蜂在花丛中飞，要采哪朵就采哪朵。' },
    ];
    await arRepo.save(
      results.map((r, i) =>
        arRepo.create({
          studentId: lxy,
          questionId: r.q.id,
          knowledgePointId: r.q.knowledgePointId,
          subject: '语文',
          grade: '五年级',
          answer: r.answer,
          isCorrect: r.correct,
          durationSec: 40 + i * 17,
          source: 'practice',
          answeredAt: new Date(Date.now() - (5 - i) * 86_400_000),
        }),
      ),
    );
    console.log('[seed] 作答记录: 李小雨 5 条');
  }

  // ============ 10. 学情快照 / 诊断 / 错题 / 计划（李小雨） ============
  const msRepo = ds.getRepository('MasterySnapshot');
  if ((await msRepo.count()) === 0) {
    const kps = await kpRepo.find();
    const qs = await qRepo.find();
    const lxy = userIds['lixiaoyu'];
    const perKp: Record<string, { correct: number; total: number }> = {};
    for (const q of qs) {
      const name = kps.find((k) => k.id === q.knowledgePointId)?.name ?? '';
      if (!perKp[name]) perKp[name] = { correct: 0, total: 0 };
      perKp[name].total++;
      const rec = await arRepo.findOne({ where: { studentId: lxy, questionId: q.id } });
      if (rec?.isCorrect) perKp[name].correct++;
    }
    const now = new Date();
    const snapshots = Object.entries(perKp).map(([name, v]) => {
      const kp = kps.find((k) => k.name === name)!;
      return msRepo.create({
        studentId: lxy,
        knowledgePointId: kp.id,
        mastery: v.total ? Math.round((v.correct / v.total) * 60) / 100 : 0.3,
        confidence: Math.min(0.95, 0.5 + v.total * 0.1),
        errorType: v.correct < v.total ? '掌握不足' : null,
        evidenceCount: v.total,
        computedAt: now,
      });
    });
    await msRepo.save(snapshots);
    await ds.getRepository('DiagnosisRecord').save(
      ds.getRepository('DiagnosisRecord').create({
        studentId: lxy,
        trigger: 'auto',
        answerCount: 5,
        overallMastery: Math.round(snapshots.reduce((s, m) => s + m.mastery, 0) / snapshots.length * 100) / 100,
        confidence: 0.8,
        summary: '基于 5 次作答：易错多音字、概括主要内容掌握良好；形近字辨析、句子仿写需要加强。建议本周重点复习形近字，完成 3 道仿写练习。',
        computedAt: now,
      }),
    );
    for (const q of qs) {
      const rec = await arRepo.findOne({ where: { studentId: lxy, questionId: q.id } });
      if (rec && !rec.isCorrect) {
        await ds.getRepository('ErrorBook').save(
          ds.getRepository('ErrorBook').create({
            studentId: lxy,
            questionId: q.id,
            errorType: q.knowledgePointId === kps.find((k) => k.name === '形近字辨析')?.id ? '形近字混淆' : '知识点不牢',
            wrongAnswer: rec.answer ?? '',
            reviewCount: 1,
            mastered: 0,
            lastReviewedAt: now,
          }),
        );
      }
    }
    console.log('[seed] 学情: 快照/诊断/错题已生成');
  }

  const planRepo = ds.getRepository('StudyPlan');
  if ((await planRepo.count()) === 0) {
    const lxy = userIds['lixiaoyu'];
    const kps = await kpRepo.find();
    const weak = kps.filter((k) => k.name === '形近字辨析' || k.name === '句子仿写');
    const plan = await planRepo.save(
      planRepo.create({ studentId: lxy, title: '第 33 周学习计划', weekNo: 33, progress: 40, status: 'active' }),
    );
    const stepRepo = ds.getRepository('PlanStep');
    await stepRepo.save([
      stepRepo.create({ planId: plan.id, knowledgePointId: weak[0].id, stepType: 'review', title: '复习：形近字辨析', status: 'done', mastery: 0.7, questionCount: 3, completedQuestionCount: 3 }),
      stepRepo.create({ planId: plan.id, knowledgePointId: weak[1].id, stepType: 'practice', title: '练习：句子仿写', status: 'active', mastery: 0.6, questionCount: 3, completedQuestionCount: 2 }),
      stepRepo.create({ planId: plan.id, knowledgePointId: kps.find((k) => k.name === '易错多音字')!.id, stepType: 'review', title: '巩固：易错多音字', status: 'wait', mastery: null, questionCount: 3, completedQuestionCount: 0 }),
    ]);
    await ds.getRepository('CodeProgress').save(
      ds.getRepository('CodeProgress').create({ studentId: lxy, level: 1, taskId: 2, status: 'active', stars: 1 }),
    );
    await ds.getRepository('Badge').save([
      ds.getRepository('Badge').create({ studentId: lxy, code: 'first_checkin', name: '第一次打卡' }),
      ds.getRepository('Badge').create({ studentId: lxy, code: 'streak7', name: '连续打卡 7 天' }),
    ]);
    await ds.getRepository('ReadingProgress').save(
      ds.getRepository('ReadingProgress').create({ studentId: lxy, bookId: 1, chapter: 4, status: 'reading', minutes: 96, points: 18 }),
    );
    console.log('[seed] 学习计划/打卡/徽章已生成');
  }

  const checkinRepo = ds.getRepository('Checkin');
  if ((await checkinRepo.count()) === 0) {
    const lxy = userIds['lixiaoyu'];
    const days: string[] = [];
    const d = new Date();
    for (let i = 8; i >= 0; i--) {
      const day = new Date(d.getTime() - i * 86_400_000);
      if (day.getDay() !== 0) days.push(day.toISOString().slice(0, 10));
    }
    await checkinRepo.save(
      days.map((day) => checkinRepo.create({ studentId: lxy, checkinDate: day, points: 10, note: null })),
    );
    console.log('[seed] 打卡: 李小雨 8 天');
  }

  // ============ 11. 师资台账 / 教师画像 ============
  const tsRepo = ds.getRepository('TeacherStat');
  if ((await tsRepo.count()) === 0) {
    await tsRepo.save([
      tsRepo.create({ schoolId: school.id, teacherId: userIds['wangxiulan'], subject: '语文', ageGroup: '35-40', education: '本科', isBackbone: 1, retireYear: null }),
      tsRepo.create({ schoolId: school.id, teacherId: userIds['liuzhiqiang'], subject: '数学', ageGroup: '30-35', education: '本科', isBackbone: 0, retireYear: null }),
      tsRepo.create({ schoolId: school.id, teacherId: 9001, subject: '语文', ageGroup: '55-60', education: '中师', isBackbone: 0, retireYear: 2028 }),
      tsRepo.create({ schoolId: school.id, teacherId: 9002, subject: '英语', ageGroup: '50-55', education: '大专', isBackbone: 0, retireYear: 2027 }),
      tsRepo.create({ schoolId: school.id, teacherId: 9003, subject: '体育', ageGroup: '40-45', education: '本科', isBackbone: 0, retireYear: null }),
    ]);
    const tpRepo = ds.getRepository('TeacherProfile');
    await tpRepo.save([
      tpRepo.create({
        teacherId: userIds['wangxiulan'],
        metrics: JSON.stringify({ 教学质量: 92, 教研: 85, AI融合: 78, 带教: 80, 口碑: 95, 发展: 82 }),
        tags: JSON.stringify(['骨干教师', '班主任标兵', '家长信任']),
        suggestions: '保持班级管理优势，可牵头全校语文学科集体备课。',
      }),
      tpRepo.create({
        teacherId: userIds['liuzhiqiang'],
        metrics: JSON.stringify({ 教学质量: 80, 教研: 72, AI融合: 85, 带教: 60, 口碑: 78, 发展: 88 }),
        tags: JSON.stringify(['青年新秀', '技术融合']),
        suggestions: '建议参与县级青年教师赛课，积累教研成果。',
      }),
    ]);
    console.log('[seed] 师资台账/教师画像已生成');
  }

  // ============ 12. 预警与处置 ============
  const alertRepo = ds.getRepository('Alert');
  if ((await alertRepo.count()) === 0) {
    const lxy = userIds['lixiaoyu'];
    const dropout = await alertRepo.save(
      alertRepo.create({
        alertType: 'dropout', severity: 'high',
        title: '学生近 7 天登录与作答活跃度下降 62%',
        description: '依据平台作答记录与班主任反馈综合研判，属于行为预警，需人工核实真实原因，不直接定性。',
        studentId: lxy, schoolId: school.id, riskScore: 0.72, status: 'new',
      }),
    );
    const mental = await alertRepo.save(
      alertRepo.create({
        alertType: 'mental', severity: 'medium',
        title: '个别学生近期作答量明显减少，建议班主任主动谈心',
        description: '作答量较上周下降 62%，建议班主任主动谈心，不直接下结论。',
        studentId: lxy, schoolId: school.id, riskScore: 0.55, status: 'processing',
      }),
    );
    const teacherGap = await alertRepo.save(
      alertRepo.create({
        alertType: 'teacher', severity: 'high',
        title: '语文教师年龄结构偏大，3 年内退休 2 人',
        description: '师资缺口预警，建议提前启动招聘与双师课堂计划。',
        studentId: null, schoolId: school.id, riskScore: 0.8, status: 'new',
      }),
    );
    await ds.getRepository('AlertSignal').save([
      ds.getRepository('AlertSignal').create({ alertId: dropout.id, signalType: 'activity_drop', value: 0.62, evidence: '近 7 天作答 2 次，前 7 天 6 次（作答记录聚合）' }),
      ds.getRepository('AlertSignal').create({ alertId: mental.id, signalType: 'activity_drop', value: 0.62, evidence: '作答量较上周下降 62%' }),
      ds.getRepository('AlertSignal').create({ alertId: teacherGap.id, signalType: 'age_structure', value: 2, evidence: '台账统计：55 岁以上语文教师 2 人，3 年内退休' }),
    ]);
    await ds.getRepository('AlertDisposal').save([
      ds.getRepository('AlertDisposal').create({ alertId: mental.id, step: 1, action: '通知班主任谈心', operatorId: userIds['wangxiulan'], note: '班主任本周内完成一次一对一交流', createdAt: new Date(Date.now() - 86_400_000) }),
    ]);
    console.log('[seed] 预警: 3 条 + 信号/处置闭环');
  }

  // ============ 13. 督导任务 ============
  const taskRepo = ds.getRepository('SuperviseTask');
  if ((await taskRepo.count()) === 0) {
    await taskRepo.save([
      taskRepo.create({ taskNo: 'XJ-2026-0001', title: '核实李小雨同学近一周学习活跃度下降原因', source: 'alert', owner: '王秀兰', status: 'todo', deadline: new Date(Date.now() + 5 * 86_400_000) }),
      taskRepo.create({ taskNo: 'XJ-2026-0002', title: '全镇语文教师年龄结构摸底与补充计划', source: 'alert', owner: '教研室', status: 'todo', deadline: new Date(Date.now() + 12 * 86_400_000) }),
      taskRepo.create({ taskNo: 'XJ-2026-0003', title: '秋季开学前校园安全巡检', source: 'manual', owner: '总务处', status: 'archived', deadline: new Date(Date.now() - 3 * 86_400_000), archivedAt: new Date(Date.now() - 2 * 86_400_000) }),
    ]);
    console.log('[seed] 督导任务: 3 条');
  }

  // ============ 14. 城乡资源均衡快照 ============
  const srsRepo = ds.getRepository('SchoolResourceStat');
  if ((await srsRepo.count()) === 0) {
    const village = await schoolRepo.save(
      schoolRepo.create({ name: '云溪村小学', region: '云溪镇', schoolType: '村小', principal: '赵立军', address: '云溪镇云溪村', mediaCount: 8, teacherRatio: 12.1, booksPerStudent: 12.6, budgetLevel: 1, bandwidth: 50 }),
    );
    const teachingPoint = await schoolRepo.save(
      schoolRepo.create({ name: '石门教学点', region: '云溪镇', schoolType: '教学点', principal: '孙桂芳', address: '云溪镇石门村', mediaCount: 2, teacherRatio: 8.4, booksPerStudent: 6.2, budgetLevel: 1, bandwidth: 20 }),
    );
    await srsRepo.save([
      srsRepo.create({ schoolId: school.id, period: '2026-2', mediaCount: 36, teacherRatio: 18.6, booksPerStudent: 22.4, budgetLevel: 2, bandwidth: 100 }),
      srsRepo.create({ schoolId: village.id, period: '2026-2', mediaCount: 8, teacherRatio: 12.1, booksPerStudent: 12.6, budgetLevel: 1, bandwidth: 50 }),
      srsRepo.create({ schoolId: teachingPoint.id, period: '2026-2', mediaCount: 2, teacherRatio: 8.4, booksPerStudent: 6.2, budgetLevel: 1, bandwidth: 20 }),
    ]);
    console.log('[seed] 城乡资源快照: 3 校');
  }

  // ============ 15. 教研活动 ============
  const raRepo = ds.getRepository('ResearchActivity');
  if ((await raRepo.count()) === 0) {
    await raRepo.save([
      raRepo.create({ title: '五年级语文同课异构《祖父的园子》', type: '同课异构', rangeType: 'school', rangeDesc: '云溪镇中心小学', whenDesc: '本周四 14:00 录播教室', status: 'ongoing', participants: 6, resultCount: 2, creatorId: userIds['wangxiulan'] }),
      raRepo.create({ title: '全镇小学数学单元整体教学研讨', type: '主题教研', rangeType: 'town', rangeDesc: '全镇 3 所学校', whenDesc: '下周五 9:00', status: 'planned', participants: 12, resultCount: 0, creatorId: userIds['liuzhiqiang'] }),
      raRepo.create({ title: '暑期教师信息素养提升培训', type: '培训', rangeType: 'all', rangeDesc: '全镇教师', whenDesc: '8 月 20 日', status: 'done', participants: 32, resultCount: 32, creatorId: 1 }),
    ]);
    console.log('[seed] 教研活动: 3 条');
  }

  // ============ 16. 家庭教育课程 ============
  const fcRepo = ds.getRepository('FamilyCourse');
  if ((await fcRepo.count()) === 0) {
    await fcRepo.save([
      fcRepo.create({ title: '如何与孩子聊成绩', weekday: '周一', content: JSON.stringify(['先问感受，再聊分数', '用"这一周最得意的一道题"开场', '一起定一个下周小目标']), durationMin: 3 }),
      fcRepo.create({ title: '屏幕时间管理三步法', weekday: '周三', content: JSON.stringify(['约定优于规定', '作业完成前不使用', '家长以身作则']), durationMin: 4 }),
      fcRepo.create({ title: '亲子共读 15 分钟', weekday: '周五', content: JSON.stringify(['选孩子感兴趣的书', '轮流朗读并讨论', '不打断、多鼓励']), durationMin: 5 }),
    ]);
    console.log('[seed] 家庭课程: 3 门');
  }

  // ============ 17. 分级阅读书库 ============
  const bookRepo = ds.getRepository('Book');
  if ((await bookRepo.count()) === 0) {
    await bookRepo.save([
      bookRepo.create({
        title: '草房子（节选·桥梁版）', level: 'B', grade: '五年级', chapters: 6,
        content: JSON.stringify([
          { chapter: 1, title: '秃鹤', text: '秃鹤的秃，是很地道的。他用长长的好看的脖子，支撑起那么一颗光溜溜的脑袋……' },
          { chapter: 2, title: '纸月', text: '纸月走路的样子很好看，两只细细的胳膊，在身前轻轻地摆动着……' },
          { chapter: 3, title: '细马', text: '细马是南方人，说话的口音很重，同学们一开始都听不懂……' },
          { chapter: 4, title: '桑桑', text: '桑桑是校长桑乔的儿子，他常常做出一些让大家想不到的事……' },
          { chapter: 5, title: '杜小康', text: '杜小康家是油麻地最富有的，他有一辆让所有孩子羡慕的白行车……' },
          { chapter: 6, title: '药寮', text: '纸月的爸爸是药寮的医生，药寮里总是飘着淡淡的药香……' },
        ]),
        excerpt: '秃鹤的秃，是很地道的。他用长长的好看的脖子，支撑起那么一颗光溜溜的脑袋。',
        quiz: JSON.stringify([{ q: '秃鹤的"秃"是天然的还是后天的？', options: ['天然', '后天', '文中未说明'], answer: 0 }, { q: '桑桑是校长的孩子吗？', options: ['是', '不是', '文中未说明'], answer: 0 }]),
      }),
      bookRepo.create({
        title: '中国古代寓言故事（选编）', level: 'A', grade: '五年级', chapters: 5,
        content: JSON.stringify([
          { chapter: 1, title: '守株待兔', text: '宋国有一个农夫，看见一只兔子撞在树桩上死了，便放下农具，天天守在树桩旁……' },
          { chapter: 2, title: '掩耳盗铃', text: '一个人想偷别人家的铃铛，怕铃响被人听见，就捂住自己的耳朵……' },
          { chapter: 3, title: '刻舟求剑', text: '楚国有个人渡江，剑掉进水里，他就在船舷上刻了个记号……' },
          { chapter: 4, title: '画蛇添足', text: '几个人比赛画蛇，先画成的人却给蛇添上了脚……' },
          { chapter: 5, title: '狐假虎威', text: '老虎捉住一只狐狸，狐狸说：我是天帝派来管理百兽的……' },
        ]),
        excerpt: '宋国有一个农夫，看见一只兔子撞在树桩上死了，便放下农具，天天守在树桩旁……',
        quiz: JSON.stringify([{ q: '《守株待兔》讽刺的是哪种人？', options: ['勤劳的人', '不劳而获的人', '聪明的人'], answer: 1 }]),
      }),
    ]);
    console.log('[seed] 书库: 2 本');
  }

  // ============ 18. 语音留言 / 周报 / 通知 ============
  const vmRepo = ds.getRepository('VoiceMessage');
  if ((await vmRepo.count()) === 0) {
    await vmRepo.save([
      vmRepo.create({ fromUserId: userIds['lijiangguo'], toUserId: userIds['wangxiulan'], direction: 'parent', durationSec: 25, text: '王老师您好，小雨最近在家写作业有点拖拉，想跟您了解一下她在学校的情况。', readAt: null }),
      vmRepo.create({ fromUserId: userIds['wangfang'], toUserId: userIds['wangxiulan'], direction: 'parent', durationSec: 18, text: '老师您好，请问下周家长会的具体时间是几点？', readAt: new Date() }),
      vmRepo.create({ fromUserId: userIds['wangxiulan'], toUserId: userIds['lijiangguo'], direction: 'teacher', durationSec: 22, text: '建国家长您好，小雨这周课堂表现不错，作业拖拉的问题我们下周一起盯一盯。', readAt: null }),
    ]);
    console.log('[seed] 语音留言: 3 条');
  }

  const wrRepo = ds.getRepository('WeeklyReport');
  if ((await wrRepo.count()) === 0) {
    const lxy = userIds['lixiaoyu'];
    await wrRepo.save([
      wrRepo.create({
        studentId: lxy, weekNo: 31, totalScore: 82, prevScore: null,
        authNote: '数据血缘：依据本周 5 次作答 · 已获家长授权',
        teacherNote: '本周课堂专注度提升，继续保持。',
        masteries: JSON.stringify([{ subject: '语文', mastery: 82, answerCount: 5 }]),
        footprints: JSON.stringify([{ date: '2026-07-30', event: '本周完成 5 次练习', type: 'study' }, { date: '2026-07-30', event: '连续打卡 7 天', type: 'habit' }]),
        status: 'published',
      }),
      wrRepo.create({
        studentId: lxy, weekNo: 32, totalScore: 88, prevScore: 82,
        authNote: '数据血缘：依据本周 6 次作答 · 已获家长授权',
        teacherNote: '阅读理解进步明显，建议加强仿写练习。',
        masteries: JSON.stringify([{ subject: '语文', mastery: 88, answerCount: 6 }]),
        footprints: JSON.stringify([{ date: '2026-08-06', event: '本周完成 6 次练习', type: 'study' }]),
        status: 'published',
      }),
    ]);
    const noteRepo = ds.getRepository('Notification');
    await noteRepo.save([
      noteRepo.create({ userId: lxy, title: '本周学习计划已生成', content: '你的第 33 周学习计划已更新，点击查看', type: 'plan', link: '/student.html#learn' }),
      noteRepo.create({ userId: lxy, title: '获得徽章：连续打卡 7 天', content: '坚持就是胜利，继续保持！', type: 'badge', link: null }),
      noteRepo.create({ userId: userIds['lijiangguo'], title: '李小雨第 32 周学情周报已生成', content: '本周整体掌握度 88%，进步明显。', type: 'weekly', link: '/parent.html#weekly' }),
    ]);
    console.log('[seed] 周报/通知已生成');
  }

  // ============ 19. 系统配置 ============
  const cfgRepo = ds.getRepository('SystemConfig');
  const defaults: Array<{ key: string; value: string; description: string }> = [
    { key: 'llm_provider', value: 'demo', description: 'LLM 提供商：demo/openai-compatible' },
    { key: 'demo_mode', value: 'true', description: '演示模式开关（无 Key 可用）' },
    { key: 'captcha_required_after_failures', value: '3', description: '登录失败多少次后要求验证码' },
  ];
  for (const d of defaults) {
    if (!(await cfgRepo.findOne({ where: { key: d.key } }))) {
      await cfgRepo.save(cfgRepo.create(d));
    }
  }

  await ds.destroy();
  console.log('[seed] 完成 ✔');
}

main().catch((e) => {
  console.error('[seed] 失败:', e);
  process.exit(1);
});
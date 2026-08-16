/**
 * 演示模式内容生成器（规则引擎，确定性输出）。
 * 接入真实 LLM 后由各 Service 走 OpenAI 兼容通道，本模块仅作离线降级。
 */

export interface LessonPlanInput {
  subject: string;
  grade: string;
  topic: string;
  periodCount: number;
  duration: number;
  bookVersion?: string;
  adaptation?: string;
  supplementary?: string;
}

/** 教学目标动词库（按学科差异化，避免千篇一律的"认识并理解"） */
const GOAL_VERBS: Record<string, string[]> = {
  语文: ['正确流利地朗读', '圈画批注并概括', '品读词句、体会情感', '联系生活迁移运用'],
  数学: ['经历探索过程、理解算理', '正确进行口算笔算', '运用法则解决实际问题', '渗透转化与数形结合思想'],
  英语: ['听懂并认读核心词汇', '运用目标句型进行交流', '借助情境理解语篇大意', '乐于表达、增强自信'],
};

/** 教学活动设计（阶段 → 教师活动/学生活动/设计意图），比单一 detail 更接近真实教案 */
const PROCESS_DESIGN = [
  {
    stage: '情境导入',
    minutesRatio: 0.1,
    teacher: '创设与本课主题相关的生活情境，通过提问/图片/音视频唤起学生已有经验',
    student: '观察情境、自由发言，尝试用自己的话说出"想学什么、想知道什么"',
    intent: '激发学习兴趣，建立新旧知识联结，明确本课学习任务',
  },
  {
    stage: '初读感知（整体把握）',
    minutesRatio: 0.25,
    teacher: '组织自读与检查反馈，引导学生用"谁+做什么+结果"梳理主要内容',
    student: '自主朗读/阅读，圈画关键词句，同桌互说主要内容并全班交流',
    intent: '落实整体感知，训练提取与概括信息的能力',
  },
  {
    stage: '精读探究（重点突破）',
    minutesRatio: 0.35,
    teacher: '围绕核心问题设计主问题链，组织小组合作与全班研讨，相机点拨',
    student: '带着问题默读批注，小组内交流观点，代表汇报、互相补充质疑',
    intent: '突破重难点，在言语实践中发展思维与表达能力',
  },
  {
    stage: '巩固运用（当堂检测）',
    minutesRatio: 0.15,
    teacher: '出示分层练习，巡视指导，收集典型错误集中讲评',
    student: '独立完成练习，同桌互批互讲，订正错题',
    intent: '检测目标达成度，暴露并矫正典型错误',
  },
  {
    stage: '总结提升与作业布置',
    minutesRatio: 0.15,
    teacher: '带领学生回顾知识脉络，布置分层作业并说明要求',
    student: '自主梳理收获，记录疑难问题，明确课后任务',
    intent: '建构知识体系，把课堂学习延伸到课后',
  },
];

export function demoLessonPlan(input: LessonPlanInput) {
  const { subject, grade, topic, periodCount, duration, bookVersion, adaptation, supplementary } = input;
  const verbs = GOAL_VERBS[subject] || GOAL_VERBS['语文'];
  const design = PROCESS_DESIGN.map((d) => ({
    stage: d.stage,
    minutes: Math.max(3, Math.round(duration * d.minutesRatio)),
    teacher: d.teacher,
    student: d.student,
    intent: d.intent,
  }));
  const content = {
    analysis: {
      text: `《${topic}》是${bookVersion || '人教版'}${grade}${subject}教材中的核心篇目。文章以"${topic}"为主线，通过典型细节与语言描写承载本单元的人文主题与语文要素，是训练学生${'概括、品读、迁移' }能力的重要载体。`,
      students: `五年级学生已具备一定的自主阅读与合作学习能力，对"${topic}"相关话题有生活经验积累；但信息提取易浮于表面、深度品读仍需教师搭建支架，需关注中等生与学困生的参与度。`,
    },
    goals: [
      `${verbs[0]}《${topic}》课文，认识并会写本课生字新词，正确读写重点词句。`,
      `通过圈画批注、小组合作等方式，梳理${topic}的内容脉络，概括文章/问题核心要点。`,
      `品读关键语段，体会表达方法与思想情感，学习作者的观察与表达方式。`,
      `联系生活实际迁移运用，落实学科核心素养，培养自主学习与合作交流的习惯。`,
    ],
    keyPoints: [
      `重点：理解《${topic}》的主要内容，把握结构线索，品读重点词句的表达效果。`,
      `难点：体会词句背后的情感/算理/语境，实现从"读懂"到"会用"的跨越。`,
      `易错点：常见混淆字词/步骤（根据学情预设），通过对比辨析与变式练习纠正。`,
    ],
    teachingMethods: ['以读代讲法', '问题驱动法', '小组合作探究法', '情境教学法'],
    resources: ['教材与配套课件', '多媒体情境素材', '小组合作学习单', '分层练习卡'],
    process: design,
    board: `${topic}\n┌───────────────────────────────┐\n│ 一、初步感知                     │\n│     内容：______________        │\n│ 二、精读探究                     │\n│     方法：____________  情感：__ │\n│ 三、总结提升                     │\n│     收获：_____________          │\n└───────────────────────────────┘`,
    homework: [
      { layer: 'A', desc: '基础巩固：完成课后"读读写写"，用新学词语各造一个句子，夯实字词与朗读' },
      { layer: 'B', desc: '能力提升：完成练习册对应练习，并就课文提出一个值得深入思考的问题' },
      { layer: 'C', desc: '拓展挑战：查阅相关资料，以"我眼中的《' + topic + '》"为题写 100 字左右的小练笔' },
    ],
    reflection:
      '课后从三个维度复盘：①目标达成度——各环节目标是否落实，重难点是否突破；②学生参与度——小组合作的实效与个体差异；③教学机智——课堂生成资源是否被有效利用。将改进点写入下轮教学设计，形成迭代闭环。',
  };
  return {
    content: JSON.stringify(content),
    outline: `一、教材与学情分析\n二、教学目标\n三、教学重难点\n四、教学方法与资源\n五、教学过程（${periodCount} 课时，含教师/学生活动与设计意图）\n六、板书设计\n七、分层作业\n八、教学反思`,
    sourceRefs: JSON.stringify([
      { title: `教材·${bookVersion || '人教版'}·${grade}${subject}《${topic}》`, ref: 'textbook' },
      { title: '教案模板·精读课文教案模板（三阶五环节）', ref: 'template:lesson_plan' },
      { title: '义务教育课程标准（2022 年版）·' + subject, ref: 'curriculum_standard' },
    ]),
  };
}

export interface PaperInput {
  subject: string;
  grade: string;
  title: string;
  layerMode: string;
  knowledgePointIds: number[];
  questionCount: number;
}

export interface DemoQuestion {
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
  layer: string;
  score: number;
}

const POOL: Array<Omit<DemoQuestion, 'layer' | 'score'>> = [
  { stem: '下列词语中加点字的读音完全正确的一项是（　　）', options: ['A. 燕(yàn)山 尽(jìn)管', 'B. 燕(yān)山 尽(jǐn)管', 'C. 燕(yàn)山 尽(jǐn)管'], answer: 'B', analysis: '“燕山”的“燕”读 yān；“尽管”的“尽”读 jǐn。' },
  { stem: '《草船借箭》中诸葛亮"借箭"成功的最主要原因是什么？', options: ['A. 运气好', 'B. 精通天文，算准大雾天气', 'C. 曹操胆小'], answer: 'B', analysis: '诸葛亮精通天文地理，预判大雾，是"借箭"成功的关键。' },
  { stem: '下列句子中运用了比喻修辞手法的一项是（　　）', options: ['A. 他好像知道了什么。', 'B. 弯弯的月亮像小船。', 'C. 我很快乐，也很惧怕。'], answer: 'B', analysis: 'A 表猜测，C 为并列，B 把月亮比作小船，是比喻。' },
  { stem: '"祖父栽花，我就栽花；祖父拔草，我就拔草。"这句话运用的描写方法是（　　）', options: ['A. 动作描写', 'B. 心理描写', 'C. 语言描写'], answer: 'A', analysis: '连续使用"栽""拔"等动词，是动作描写，体现"我"的模仿与自由。' },
  { stem: '根据课文内容填空：《祖父的园子》表达了作者对童年生活和对祖父的（　　）之情。', answer: '怀念与眷恋', analysis: '文章字里行间流露出对自由自在的园子生活的怀念和对祖父的思念。' },
  { stem: '照样子写句子：蜜蜂嗡嗡地飞着，满身绒毛，落到一朵花上，胖乎乎、圆滚滚。（用叠词写一种小动物）', answer: '示例：小鸭子摇摇摆摆地走着，毛茸茸、胖嘟嘟，可爱极了。', analysis: '使用叠词（胖乎乎、圆滚滚）形象生动，仿写做到句式一致即可。' },
  { stem: '《摔跤》中小嘎子"围着他猴儿似的蹦来蹦去"，主要表现了他（　　）', options: ['A. 轻浮好动', 'B. 机灵敏捷、善于用智', 'C. 胆小怕事'], answer: 'B', analysis: '"猴儿似的"形象写出小嘎子的灵活机敏。' },
  { stem: '概括《草船借箭》的主要内容，最恰当的一项是（　　）', options: ['A. 诸葛亮用妙计向曹操"借"来十万支箭', 'B. 周瑜妒忌诸葛亮', 'C. 诸葛亮造箭的故事'], answer: 'A', analysis: '概括要抓住主要事件与结果。' },
  { stem: '下列句子没有语病的一项是（　　）', options: ['A. 我断定他可能生病了。', 'B. 我们要养成认真读书的好习惯。', 'C. 这次考试，全班同学都到齐了，只有小明没来。'], answer: 'B', analysis: 'A"断定"与"可能"矛盾；C"都到齐了"与"只有小明没来"矛盾。' },
  { stem: '写一句关于读书的名言。', answer: '示例：读书破万卷，下笔如有神。——杜甫', analysis: '考查积累与书写，内容正确即可。' },
];

/** 数学演示题库（按科目取池，保证组卷内容与科目一致） */
const POOL_MATH: Array<Omit<DemoQuestion, 'layer' | 'score'>> = [
  { stem: '5.6 × 10 的结果是（　　）', options: ['A. 0.56', 'B. 56', 'C. 560'], answer: 'B', analysis: '小数乘 10，小数点向右移动一位：5.6 × 10 = 56。' },
  { stem: '计算：25 × 4 = （　　）', options: ['A. 90', 'B. 100', 'C. 125'], answer: 'B', analysis: '25 × 4 = 100，注意 25 × 40 = 1000 不要混淆。' },
  { stem: '3 千克棉花与 3 千克铁比较，（　　）', options: ['A. 棉花重', 'B. 铁重', 'C. 一样重'], answer: 'C', analysis: '都是 3 千克，质量相同，与材质无关。' },
  { stem: '把 0.5 改写成分数是（　　）', options: ['A. 1/2', 'B. 1/5', 'C. 5/10'], answer: 'A', analysis: '0.5 = 5/10 = 1/2。' },
  { stem: '一个长方形的长是 8 厘米，宽是 5 厘米，它的周长是（　　）厘米。', options: ['A. 13', 'B. 26', 'C. 40'], answer: 'B', analysis: '周长 = (长 + 宽) × 2 = (8 + 5) × 2 = 26 厘米。' },
  { stem: '计算：72 ÷ 8 = （　　）', answer: '9', analysis: '根据乘法口诀"八九七十二"可得 72 ÷ 8 = 9。' },
];

/** 英语演示题库 */
const POOL_ENGLISH: Array<Omit<DemoQuestion, 'layer' | 'score'>> = [
  { stem: 'What does "apple" mean? （　　）', options: ['A. 香蕉', 'B. 苹果', 'C. 橘子'], answer: 'B', analysis: 'apple 意为"苹果"。' },
  { stem: 'Choose the correct one: I ___ a student.', options: ['A. is', 'B. am', 'C. are'], answer: 'B', analysis: '主语是 I 时系动词用 am。' },
  { stem: 'How many days are there in a week? （　　）', options: ['A. Five', 'B. Six', 'C. Seven'], answer: 'C', analysis: '一周有 7 天：Monday 到 Sunday。' },
  { stem: 'The opposite of "big" is （　　）', options: ['A. small', 'B. tall', 'C. long'], answer: 'A', analysis: 'big 的反义词是 small。' },
  { stem: 'Spell the word: 猫 = （　　）', options: ['A. dog', 'B. cat', 'C. bag'], answer: 'B', analysis: '猫的英文是 cat。' },
  { stem: 'Translate: 你好 = （　　）', answer: 'hello', analysis: '你好最常用的英文表达是 hello / hi。' },
];

export function demoPaper(input: PaperInput) {
  const pool =
    input.subject === '数学'
      ? POOL_MATH
      : input.subject === '英语' || input.subject === 'English'
        ? POOL_ENGLISH
        : POOL;
  const layers = input.layerMode === 'layered' ? ['A', 'B', 'C'] : ['A'];
  const per = Math.max(2, Math.ceil(input.questionCount / layers.length));
  const questions: DemoQuestion[] = [];
  let seq = 0;
  for (const layer of layers) {
    for (let i = 0; i < per && questions.length < input.questionCount; i++) {
      const base = pool[(seq * 7 + i * 3) % pool.length];
      questions.push({ ...base, layer, score: layer === 'C' ? 10 : 5 });
      seq++;
    }
  }
  return {
    sections: layers.map((layer) => ({
      layer,
      name: layer === 'A' ? '基础巩固' : layer === 'B' ? '能力提升' : '拓展挑战',
      count: questions.filter((q) => q.layer === layer).length,
    })),
    questions,
    totalScore: questions.reduce((s, q) => s + q.score, 0),
  };
}

export function demoMicroScript(topic: string, style: string, duration: number) {
  const segments = [
    `【开场 30 秒】大家好，今天我们花 ${duration} 分钟学习《${topic}》。`,
    '【情境导入 1 分钟】先看一个与生活相关的小例子，猜猜今天要学什么。',
    '【核心讲解 3-4 分钟】把知识点拆成三步，每一步配一个直观演示。',
    '【易错提醒 1 分钟】这里有三个同学常犯的错误，注意看第二点。',
    '【小结与练习 1-2 分钟】用一句话总结，再留一个小练习。',
  ];
  return {
    content: segments.join('\n'),
    style,
    format: '竖屏 9:16',
    teleprompter: 1,
  };
}

export function demoSpeech(docType: string, theme: string, audience: string, keyPoints?: string) {
  const audienceLine = audience ? `各位${audience}：` : '各位家长：';
  const points = keyPoints ? keyPoints.split(/[,，;；]/).filter(Boolean) : ['学习情况总体反馈', '进步与亮点', '需要配合的事项'];
  return `${audienceLine}\n大家好！感谢大家在百忙之中参加今天的${theme}。\n\n一、关于近阶段情况\n${points
    .map((p, i) => `${i + 1}. ${p}`)
    .join('\n')}\n\n二、需要家校配合的三个方面\n1. 习惯养成：每天固定时间完成作业与阅读。\n2. 沟通交流：多倾听孩子在校的开心与困惑。\n3. 关注身心：睡眠、运动与情绪一样重要。\n\n最后，感谢大家的信任与支持，让我们携手，陪孩子走好每一步。谢谢！`;
}

export function demoResearcher(reviewType: string, sourceContent: string) {
  const text = sourceContent.slice(0, 200);
  if (reviewType === 'comment') {
    const dims = [
      { key: 'goal', name: '目标设计', score: 86, comment: '三维目标具体，建议补充可观测的行为动词' },
      { key: 'process', name: '过程设计', score: 84, comment: '环节完整，导入略长，建议压缩至 2 分钟' },
      { key: 'activity', name: '活动设计', score: 80, comment: '有学生活动，可增加 1 次小组合作探究' },
      { key: 'assessment', name: '评价设计', score: 78, comment: '缺少课堂检测环节，建议增设当堂小测' },
      { key: 'homework', name: '作业设计', score: 82, comment: '有分层意识，A/B/C 层任务可更具体' },
    ];
    const mustFix = ['导入压缩至 2 分钟并链接生活情境', '增设 3 分钟当堂检测并即时反馈'];
    const suggest = ['精读环节预设 2 个学生易错点', '小组合作任务给出分工提示'];
    const standard = '义务教育课程标准（2022 年版）· 教学评一致性要求';
    const avg = Math.round(dims.reduce((s, d) => s + d.score, 0) / dims.length);
    return {
      score: avg,
      dims,
      mustFix,
      suggest,
      standard,
      content:
        `【教案点评】综合 ${avg} 分（${standard}）。\n` +
        `维度评分：${dims.map((d) => `${d.name} ${d.score}`).join('、')}。\n` +
        `必须改进：${mustFix.join('；')}。\n建议优化：${suggest.join('；')}。\n参考内容：「${text}…」`,
    };
  }
  if (reviewType === 'talk-script') {
    return {
      content: `【讲题话术】三步讲题法：\n1. 读题圈条件——"我们先看题目给了我们什么信息？"（边说边在题干上圈画）\n2. 找关系——"条件和问题之间藏着什么联系？"（引导学生自己说）\n3. 验证——"算出来之后怎么确认对不对？"（代回原题检查）\n要点：每步先让学生说，老师只做追问与小结。`,
    };
  }
  return {
    content: `【教学建议】基于「${text}」的课堂情况：\n① 关注后进生的课堂参与度，可采用同桌互助与即时小反馈；\n② 每节课留 3 分钟"说想法"环节，训练表达；\n③ 单元结束后用 1 道综合性任务检验迁移能力。`,
  };
}

export function demoSkillReport(self: Record<string, number>) {
  const radar = { 教学设计: self['教学设计'] ?? 82, 课堂管理: self['课堂管理'] ?? 74, 粉笔字: self['粉笔字'] ?? 68, 普通话: self['普通话'] ?? 86, 信息化: self['信息化'] ?? 63, 学情分析: self['学情分析'] ?? 78, 作业设计: self['作业设计'] ?? 70, 家校沟通: self['家校沟通'] ?? 75 };
  const weakest = Object.entries(radar).sort((a, b) => a[1] - b[1]).slice(0, 3);
  const plan = weakest.map(([k, v], i) => ({
    item: k,
    score: v,
    days: `第 ${i * 2 + 1}-${i * 2 + 2} 天`,
    train: `针对「${k}」：第 1 天完成 2 次微格练习并录音自评；第 2 天观摩同组优秀案例 1 次并写 300 字复盘；每项配 15 分钟练习 + 自评表（1-5 分）。`,
    resource: k === '信息化' ? '推荐：国家中小学智慧教育平台·课件制作微课' : k === '粉笔字' ? '推荐：每日 15 分钟楷书结构临摹 + 拍照对比' : '推荐：教研规则库对应训练模块',
  }));
  return { radar: JSON.stringify(radar), plan: JSON.stringify(plan) };
}

export function demoOcrToLesson(raw: string) {
  const lines = raw.split('\n').filter((l) => l.trim());
  const title = lines[0]?.slice(0, 40) || '未识别标题';
  return demoLessonPlan({
    subject: '语文',
    grade: '五年级',
    topic: title,
    periodCount: 1,
    duration: 40,
    bookVersion: '拍照识别',
    supplementary: `OCR 原始文本节选：${lines.slice(1, 6).join('；')}`,
  });
}

export function demoTitleOrganize(items: string[]) {
  return items.map((name, i) => ({
    name,
    category: i % 2 === 0 ? '教学业绩材料' : '师德与继续教育材料',
    order: i + 1,
  }));
}

export function demoCodeRun(script: string) {
  const clean = script.replace(/\s+/g, '');
  const steps = clean.match(/(前进|后退|左转|右转|重复)/g) || [];
  const valid = steps.length > 0;
  return {
    passed: valid,
    steps: steps.length,
    output: valid
      ? `模拟执行成功：共 ${steps.length} 条指令（${steps.join('→')}），角色到达目标点。`
      : '指令无法解析：请使用「前进 / 后退 / 左转 / 右转 / 重复 n 次」等指令。',
    feedback: valid ? '太棒了！指令清晰，路径正确，获得 3 颗星。' : '再看一眼指令卡片，把动作写成"指令 + 次数"的格式哦。',
  };
}

export function demoWeeklyMasteries() {
  return [
    { subject: '语文', mastery: 86, trend: 4 },
    { subject: '数学', mastery: 74, trend: -2 },
    { subject: '英语', mastery: 68, trend: 6 },
    { subject: '科学', mastery: 81, trend: 3 },
  ];
}

export function demoTips(scene: string) {
  const tips: Record<string, string> = {
    exam: '先别急着问成绩。可以问："这周有没有哪道题让你觉得特别有成就感？"让孩子先说感受，再一起分析错题，最后约定一个下周小目标。',
    phone: '和孩子约定"屏幕时间"时，试试这样说："我们一起定个规则：作业完成后，可以看 30 分钟。你来定哪天多看，好吗？"把规定变成约定，孩子更容易接受。',
    homework: '辅导作业时少说"你怎么又错了"，改成"这道题你卡在哪一步了？"先定位卡点，再陪孩子一起拆解。',
    default: '多听少说，先共情再给建议。句式参考："我理解你有点着急，我们一起来看看能做什么。"',
  };
  return tips[scene] || tips.default;
}

export function demoAlerts() {
  return [
    { type: 'dropout', severity: 'high', title: '连续 7 天未登录学习平台', desc: '依据平台登录记录与班主任反馈综合研判，属于行为预警，需人工核实。' },
    { type: 'mental', severity: 'medium', title: '近期作答活跃度明显下降', desc: '作答量较上周下降 62%，建议班主任主动谈心，不直接下结论。' },
    { type: 'teacher', severity: 'high', title: '语文教师年龄结构偏大，3 年内退休 2 人', desc: '师资缺口预警，建议提前启动招聘与双师课堂计划。' },
  ];
}

export function demoRegionTrends(weeks: number) {
  const answers: number[] = [];
  const active: number[] = [];
  let a = 28000;
  let b = 4200;
  for (let i = 0; i < weeks; i++) {
    answers.push(a + i * 2600 + (i % 3) * 900);
    active.push(b + i * 320 + (i % 2) * 130);
  }
  return { answers, active };
}
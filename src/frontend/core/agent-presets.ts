/**
 * 智能体工作台预设定义（teacher 端入口与 agent 工作台共用）：
 * 每个预设 = 参数表单 + 任务文本模板。表单值保留（切换不丢失），发送时实时读取。
 */

export interface Preset {
  key: string;
  name: string;
  icon: string;
  desc: string;
  formHtml: string;
  /** 表单值 → 发送给智能体的任务文本 */
  buildTask: (form: Record<string, string>) => string;
}

export const PRESETS: Preset[] = [
  {
    key: 'lesson',
    name: '一键备课',
    icon: 'ph:note-pencil',
    desc: '保留备课信息，发送给智能体生成教案',
    formHtml: `
      <div class="field"><label>任教学科 <span class="req">*</span>（一师多科可多选）</label>
        <div class="radio-pill">
          <span class="on" data-field="subject" data-v="数学">数学</span>
          <span data-field="subject" data-v="科学">科学</span>
          <span data-field="subject" data-v="语文">语文</span>
        </div>
      </div>
      <div class="f-row">
        <div class="field"><label>年级</label><select class="select" data-field="grade"><option>五年级</option><option>四年级</option><option>六年级</option></select></div>
        <div class="field"><label>教材版本</label><select class="select" data-field="bookVersion"><option>人教版（2013 审定）</option><option>北师大版</option><option>苏教版</option></select></div>
      </div>
      <div class="field"><label>课题 <span class="req">*</span></label><input class="input" data-field="topic" value="简易方程 · 用字母表示数" placeholder="输入课题名称"></div>
      <div class="f-row3">
        <div class="field"><label>课时</label><select class="select" data-field="periodCount"><option>1 课时</option><option>2 课时</option></select></div>
        <div class="field"><label>时长</label><select class="select" data-field="duration"><option>40 分钟</option><option>45 分钟</option></select></div>
        <div class="field"><label>学情适配</label><select class="select" data-field="adaptation"><option>默认</option><option>偏薄弱班级</option><option>偏拔高班级</option></select></div>
      </div>
      <div class="field"><label>补充说明</label><textarea class="input" data-field="supplementary" placeholder="如：班级里 8 名学生方程概念薄弱，需加强情境导入…"></textarea></div>`,
    buildTask: (f) =>
      `请为${f.grade || '五年级'}${f.subject || '语文'}${f.bookVersion || '人教版'}《${f.topic || '草船借箭'}》生成教案，${f.periodCount || '1 课时'}，每课时 ${f.duration || '40'} 分钟，学情适配：${f.adaptation || '默认'}${f.supplementary ? `，补充说明：${f.supplementary}` : ''}。请生成可直接上课的完整教案，并在完成后用文档交付。`,
  },
  {
    key: 'paper',
    name: '一键组卷 / 分层作业',
    icon: 'ph:file-text',
    desc: '保留组卷参数，A/B/C 分层，可下载 Word / PDF',
    formHtml: `
      <div class="f-row">
        <div class="field"><label>年级 / 学科</label><select class="select" data-field="subject"><option>五年级 · 数学</option><option>五年级 · 语文</option></select></div>
        <div class="field"><label>单元范围</label><select class="select" data-field="unit"><option>第四单元 · 简易方程</option><option>第三单元 · 小数除法</option></select></div>
      </div>
      <div class="f-row3">
        <div class="field"><label>选择题</label><input class="input" type="number" data-field="choice" value="6"></div>
        <div class="field"><label>填空题</label><input class="input" type="number" data-field="blank" value="6"></div>
        <div class="field"><label>解答题</label><input class="input" type="number" data-field="solve" value="4"></div>
      </div>
      <div class="field"><label>分层模式</label>
        <div class="radio-pill"><span class="on" data-field="layerMode" data-v="A/B/C 分层">A/B/C 分层</span><span data-field="layerMode" data-v="统一卷">统一卷</span><span data-field="layerMode" data-v="个性化组卷">个性化组卷</span></div>
      </div>
      <div class="field" style="display:flex;align-items:center;gap:10px"><label style="margin:0;flex:1">自动附答案解析</label><div class="switch on" data-sw></div></div>
      <div class="field" style="display:flex;align-items:center;gap:10px"><label style="margin:0;flex:1">同步布置到学生端</label><div class="switch on" data-sw></div></div>`,
    buildTask: (f) =>
      `请生成一份${f.subject || '五年级 · 数学'}试卷，范围：${f.unit || '简易方程'}，分层模式：${f.layerMode || 'A/B/C 分层'}，共 ${f.choice || 6} 道选择题、${f.blank || 6} 道填空题、${f.solve || 4} 道解答题，自动附答案解析。请用试卷文档交付（可下载 Word/PDF）。`,
  },
  {
    key: 'micro',
    name: '微课脚本',
    icon: 'ph:video-camera',
    desc: '分镜脚本 · 逐字稿 · 提词卡',
    formHtml: `
      <div class="field"><label>课题</label><input class="input" data-field="topic" value="分数的基本性质"></div>
      <div class="f-row">
        <div class="field"><label>微课时长</label><select class="select" data-field="duration"><option>5 分钟</option><option selected>8 分钟</option><option>10 分钟</option></select></div>
        <div class="field"><label>授课风格</label><select class="select" data-field="style"><option>亲切乡镇风（多用生活情境）</option><option>标准规范风</option><option>活泼激励风</option></select></div>
      </div>
      <div class="field"><label>录制规格</label>
        <div class="radio-pill"><span class="on" data-field="format" data-v="横屏 16:9">横屏 16:9</span><span data-field="format" data-v="竖屏 9:16">竖屏 9:16</span></div>
      </div>
      <div class="field" style="display:flex;align-items:center;gap:10px"><label style="margin:0;flex:1">生成提词卡</label><div class="switch on" data-sw></div></div>`,
    buildTask: (f) =>
      `请为《${f.topic || '分数的基本性质'}》生成微课脚本，时长 ${f.duration || '8'} 分钟，授课风格：${f.style || '亲切乡镇风（多用生活情境）'}，录制规格：${f.format || '横屏 16:9'}，需要提词卡。脚本需含分镜、逐字稿与停顿点，用文档交付。`,
  },
  {
    key: 'researcher',
    name: 'AI 教研员',
    icon: 'ph:sparkle',
    desc: '教案点评 · 讲题话术 · 教学建议',
    formHtml: `
      <div class="field"><label>教研类型</label>
        <div class="radio-pill"><span class="on" data-field="type" data-v="教案点评">教案点评</span><span data-field="type" data-v="讲题话术">讲题话术</span><span data-field="type" data-v="教学建议">教学建议</span></div>
      </div>
      <div class="field"><label>粘贴教案 / 题目内容</label><textarea class="input" data-field="sourceContent" style="min-height:160px" placeholder="粘贴教案内容或题目，AI 教研员将按 2022 版课标 + 教研规则库点评">【导入】复习上节课内容 5 分钟。
【新授】讲解方程概念 20 分钟，例题 2 道。
【练习】学生做练习册 15 分钟。
【总结】布置作业。</textarea></div>`,
    buildTask: (f) =>
      `请以 AI 教研员身份${f.type === '讲题话术' ? '生成苏格拉底式讲题话术（不给答案，引导思考）' : f.type === '教学建议' ? '基于班级学情生成本周教学建议' : '点评以下教案，给出评分与改进建议'}：\n${f.sourceContent || ''}`,
  },
  {
    key: 'skills',
    name: '基本功补强',
    icon: 'ph:medal',
    desc: '自评诊断 · 专属训练计划',
    formHtml: `
      <div class="field"><label>6 项基本功自评</label>
        <div class="opt-cols" style="grid-template-columns:1fr 1fr">
          <div class="opt-card" data-field="skill" data-v="教学设计 82"><div class="oc-t">教学设计 82</div><div class="oc-d">目标设计 · 环节衔接</div></div>
          <div class="opt-card" data-field="skill" data-v="课堂管理 74"><div class="oc-t">课堂管理 74</div><div class="oc-d">纪律组织 · 节奏把控</div></div>
          <div class="opt-card" data-field="skill" data-v="粉笔字 68"><div class="oc-t">粉笔字 68</div><div class="oc-d">板书书写 · 字迹规范</div></div>
          <div class="opt-card" data-field="skill" data-v="普通话 86"><div class="oc-t">普通话 86</div><div class="oc-d">发音标准 · 课堂表达</div></div>
          <div class="opt-card" data-field="skill" data-v="信息化 63"><div class="oc-t">信息化 63</div><div class="oc-d">多媒体运用 · 课件制作</div></div>
          <div class="opt-card" data-field="skill" data-v="学情分析 78"><div class="oc-t">学情分析 78</div><div class="oc-d">诊断学情 · 分层设计</div></div>
        </div>
      </div>
      <div class="field"><label>你最习惯的课堂风格？</label>
        <div class="radio-pill"><span class="on" data-field="style" data-v="板书引导">板书引导</span><span data-field="style" data-v="多媒体演示">多媒体演示</span><span data-field="style" data-v="小组讨论">小组讨论</span></div>
      </div>`,
    buildTask: (f) =>
      `请根据我的教师基本功自评生成补强训练计划：${f.skill || '教学设计 82'}${
        f.style ? `，课堂风格偏好：${f.style}` : ''
      }。按薄弱项排序输出本周训练计划（含每天任务与时长），用文档交付。`,
  },
  {
    key: 'library',
    name: '教学资源库',
    icon: 'ph:books',
    desc: '资源整理 · 分类归档',
    formHtml: `
      <div class="field"><label>资源类型</label>
        <div class="radio-pill"><span class="on" data-field="type" data-v="全部">全部</span><span data-field="type" data-v="教案">教案</span><span data-field="type" data-v="课件">课件</span><span data-field="type" data-v="习题">习题</span><span data-field="type" data-v="视频">视频</span></div>
      </div>
      <div class="field"><label>整理要求</label><textarea class="input" data-field="desc" placeholder="如：按教材章节分类，标注授权方式，生成资源清单…">请按教案 / 课件 / 习题 / 视频分类整理教学资源库，标注授权方式，生成一份资源清单。</textarea></div>`,
    buildTask: (f) =>
      `请帮我整理教学资源库（${f.type || '全部'}类型）：${f.desc || '按教案/课件/习题/视频分类，标注授权方式，生成资源清单'}。用文档交付资源清单。`,
  },
  {
    key: 'ocr',
    name: '拍照转教案',
    icon: 'ph:camera',
    desc: '手写教案 OCR → 结构化电子教案',
    formHtml: `
      <div class="field"><label>手写教案识别文本（OCR 结果）</label><textarea class="input" data-field="ocrText" style="min-height:180px">§ 课题：多边形面积
① 复习长方形公式 5min
② 割补法演示平行四边形
③ 学生剪拼操作
④ 公式推导 S=ah</textarea></div>
      <div class="cite" style="margin-top:4px"><span class="iconify" data-icon="ph:info"></span> 支持上传图片自动 OCR（拍照转教案入口），此处可直接粘贴识别结果</div>`,
    buildTask: (f) =>
      `请将以下手写教案 OCR 文本转换为结构化电子教案（含课题、导入、新授、活动、结论、作业设计），对齐教材章节后交付：\n${f.ocrText || ''}`,
  },
  {
    key: 'parentmeet',
    name: '家长会材料包',
    icon: 'ph:megaphone',
    desc: '发言稿 · 数据图表页',
    formHtml: `
      <div class="field"><label>家长会主题</label><input class="input" data-field="theme" value="五年级（1）班 · 期中家长会"></div>
      <div class="f-row">
        <div class="field"><label>发言时长</label><select class="select" data-field="duration"><option>10 分钟</option><option selected>15 分钟</option><option>20 分钟</option></select></div>
        <div class="field"><label>参会群体</label><select class="select" data-field="audience"><option>含大量务工/祖辈家长</option><option>本地务农家长为主</option></select></div>
      </div>
      <div class="field"><label>重点内容（可多选）</label>
        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="display:flex;align-items:center;gap:9px;font-size:13px;font-weight:500;color:var(--label-secondary);cursor:pointer"><input type="checkbox" checked data-field="kp1" value="班级学情总览" style="accent-color:var(--state-primary);width:15px;height:15px"> 班级学情总览（数据图表）</label>
          <label style="display:flex;align-items:center;gap:9px;font-size:13px;font-weight:500;color:var(--label-secondary);cursor:pointer"><input type="checkbox" checked data-field="kp2" value="进步学生表扬名单" style="accent-color:var(--state-primary);width:15px;height:15px"> 进步学生表扬名单</label>
          <label style="display:flex;align-items:center;gap:9px;font-size:13px;font-weight:500;color:var(--label-secondary);cursor:pointer"><input type="checkbox" checked data-field="kp3" value="家庭教育协作建议" style="accent-color:var(--state-primary);width:15px;height:15px"> 家庭教育协作建议</label>
        </div>
      </div>`,
    buildTask: (f) => {
      const kps = [f.kp1, f.kp2, f.kp3].filter(Boolean).join('、');
      return `请为「${f.theme || '五年级（1）班 · 期中家长会'}」生成家长会发言稿，时长 ${f.duration || '15'} 分钟，参会群体：${f.audience || '含大量务工/祖辈家长'}，重点内容：${kps || '班级学情总览'}。结合班级学情数据生成，用文档交付并附图表页说明。`;
    },
  },
  {
    key: 'backtoschool',
    name: '开学材料包',
    icon: 'ph:backpack',
    desc: '第一课 · 班规 · 计划 · 告知书',
    formHtml: `
      <div class="field"><label>年级 / 班级</label><input class="input" data-field="cls" value="五年级（1）班"></div>
      <div class="field"><label>需要生成的材料（可多选）</label>
        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="display:flex;align-items:center;gap:9px;font-size:13px;font-weight:500;color:var(--label-secondary);cursor:pointer"><input type="checkbox" checked data-field="m1" value="开学第一课课件" style="accent-color:var(--state-primary);width:15px;height:15px"> 开学第一课课件</label>
          <label style="display:flex;align-items:center;gap:9px;font-size:13px;font-weight:500;color:var(--label-secondary);cursor:pointer"><input type="checkbox" checked data-field="m2" value="班级公约" style="accent-color:var(--state-primary);width:15px;height:15px"> 班级公约</label>
          <label style="display:flex;align-items:center;gap:9px;font-size:13px;font-weight:500;color:var(--label-secondary);cursor:pointer"><input type="checkbox" checked data-field="m3" value="学期教学计划" style="accent-color:var(--state-primary);width:15px;height:15px"> 学期教学计划</label>
          <label style="display:flex;align-items:center;gap:9px;font-size:13px;font-weight:500;color:var(--label-secondary);cursor:pointer"><input type="checkbox" checked data-field="m4" value="安全告知书" style="accent-color:var(--state-primary);width:15px;height:15px"> 安全告知书</label>
          <label style="display:flex;align-items:center;gap:9px;font-size:13px;font-weight:500;color:var(--label-secondary);cursor:pointer"><input type="checkbox" checked data-field="m5" value="致家长的一封信" style="accent-color:var(--state-primary);width:15px;height:15px"> 致家长的一封信</label>
        </div>
      </div>`,
    buildTask: (f) => {
      const ms = [f.m1, f.m2, f.m3, f.m4, f.m5].filter(Boolean).join('、');
      return `请为${f.cls || '五年级（1）班'}生成开学材料包：${ms || '开学第一课课件、班级公约、学期计划、安全告知书、致家长信'}。结合班级学情与课标生成，用文档交付。`;
    },
  },
  {
    key: 'title',
    name: '职称材料整理',
    icon: 'ph:folder-open',
    desc: '自动分类归档 · 生成目录',
    formHtml: `
      <div class="field"><label>材料清单（每行一项，可粘贴说明）</label><textarea class="input" data-field="items" style="min-height:160px">县级优质课二等奖
《乡镇小班化教学实践》论文
国培结业证书
普通话二甲证书
近三年教案本
班主任任职证明</textarea></div>
      <div class="field"><label>归档规则</label>
        <div class="radio-pill"><span class="on" data-field="rule" data-v="获奖证书/论文课题/继续教育/任职教案四类">标准四类</span><span data-field="rule" data-v="按年份+材料类型">按年份</span></div>
      </div>`,
    buildTask: (f) =>
      `请将以下职称评审材料按「${f.rule || '获奖证书/论文课题/继续教育/任职教案四类'}」自动分类归档并生成目录（含材料名、份数、归档位置）：\n${f.items || ''}`,
  },
];

export function presetByKey(key: string): Preset | undefined {
  return PRESETS.find((p) => p.key === key);
}

/** 读取预设表单值（radio-pill 取 .on 的 data-v，checkbox 取勾选项） */
export function collectPresetForm(root: HTMLElement): Record<string, string> {
  const form: Record<string, string> = {};
  root.querySelectorAll<HTMLElement>('[data-field]').forEach((el) => {
    const field = el.dataset.field || '';
    if (!field || form[field]) return;
    if (el.classList.contains('radio-pill')) {
      const on = el.querySelector('.on') as HTMLElement | null;
      if (on && on.dataset.v) form[field] = on.dataset.v;
    } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      if (el.checked) form[field] = el.value;
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      form[field] = el.value.trim();
    } else if (el.classList.contains('opt-card') && el.classList.contains('sel')) {
      if (el.dataset.v) form[field] = el.dataset.v;
    }
  });
  return form;
}

/** 为表单 DOM 挂载交互（switch / radio-pill / opt-card 点击切换） */
export function bindPresetForm(root: HTMLElement): void {
  root.querySelectorAll('[data-sw]').forEach((el) => {
    el.addEventListener('click', () => el.classList.toggle('on'));
  });
  root.querySelectorAll('.radio-pill > span').forEach((el) => {
    el.addEventListener('click', () => {
      el.parentElement!.querySelectorAll('span').forEach((s) => s.classList.remove('on'));
      el.classList.add('on');
    });
  });
  root.querySelectorAll('.opt-card').forEach((el) => {
    el.addEventListener('click', () => {
      el.parentElement!.querySelectorAll('.opt-card').forEach((c) => c.classList.remove('sel'));
      el.classList.add('sel');
    });
  });
}

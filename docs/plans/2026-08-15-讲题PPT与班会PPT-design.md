# 教师真实高频场景：讲题 PPT + 班会 PPT 设计

日期：2026-08-15
状态：已确认（用户场景访谈 + 开源借鉴分析）
前置：`2026-08-15-教师办公文档生成.md`（通用 Markdown→四格式渲染已交付）

## 1. 背景与场景认知

### 1.1 真实场景访谈结论（教师视角）
- **讲题 PPT（最高频）**：老师拿一份卷子 → 智能体按题生成讲题 PPT，**一页 PPT 一道题**（含题目与选项）；**大题预留足够作答与书写空间**，用于**学校白板讲评**。
- **班会 PPT**：班会主题课件（防欺凌/安全/心理/节日等），轻量生成。
- **明确不做**：公开课/赛课精美 PPT（教师自备，AI 生成无价值）——YAGNI。

### 1.2 需求确认（头脑风暴结论）
| 决策点 | 结论 |
|---|---|
| 卷子输入形态 | 图片（拍照）+ PDF 电子卷 + 文本粘贴，**三者都要** |
| 讲评演示逻辑 | **题目页与答案页分离**：题目页让学生先作答，翻页揭晓答案 |
| 本期范围 | 只做讲题 PPT + 班会 PPT |

### 1.3 现有能力差距
- `generate_document`（通用 Markdown→docx/pptx/pdf/xlsx）**无法表达题目卡片布局**（大字题干/选项排版/作答留白/答案分离），需专用渲染器。
- **OCR 是占位实现**（files.service.ts:162 返回占位文本），图片卷子无法提取题目。
- 通用 pptx 渲染器存在**同页元素重叠 bug**（复杂场景实测：8-10 个文本块仅 4-5 个 y 坐标，slide5-11 全部重叠）——班会 PPT 若复用必须修复。

## 2. 开源借鉴分析（已下载实证）

### 2.1 devictang/lesson-plan-to-pptx（Apache 2.0，教案→PPTX）
下载于 `%TEMP%\opencode\refs\lesson-plan-to-pptx`，直接借鉴：
1. **blockquote 语法标记布局**：`> ❓ 题干` / `> A. 选项` / `> ✅ C`（答案标记）、`> ✏️ 练习区`、`> 💡 提示框`、`> notes：逐字稿`
2. **选择题渲染**：字母圆圈徽章（正确=实心绿底白字，错误=白底描边），选项垂直堆叠，每项高 1.2"
3. **语义化主题设计系统**：每主题 `palette{ bg, surface, text, muted, accent, accent2, accent3, good, warn, bad }` + `fonts{}` + `scale{ hero,title,body,meta,small }` + `radius/shadow`
4. **导航元素**：底部进度条（按页码比例填充）、右下角水印大页码（130pt 半透明）、顶部 accent 细条
5. **布局规范**：16:9 `13.33×7.5"`，`MARGIN 0.85"`，全部坐标英寸制
6. **布局自动检测**：优先级 if 级联（divider→split→callout→exercise→mcq→concept→code→quote→table→stats→timeline→content）

### 2.2 tcshowhand/teacher（Vue3 教育平台，含试卷/PPT 编辑）
借鉴：
1. **AI 结构化输出约定**：prompt 内嵌目标 JSON schema + 要求"不要包含代码块"；解析时 strip ```` ```json ```` 前缀、JSON.parse 失败提示重试
2. **题目字段思路**：`qNum / title / tags(知识点) / desc / image`；导出 Word 时 HTML 清洗逐行 Paragraph
3. 局限性：其题目模型是 OJ 编程题风格，无选择题选项结构——**题集 JSON 需自行扩展 type/options/answer/analysis**

### 2.3 不采用的
- banana-slides（AGPL，依赖生图 API，方向不符）
- ai-to-pptx（GPL，前端模板体系太重，仅参考"大纲→模板渲染"思路）

## 3. 架构设计

### 3.1 管道总览

```
卷子（图片拍照 / PDF 电子卷 / 文本粘贴）
   │
   ▼ extract_exam_text（新工具，文件解析）
   ├─ PDF  → pdf-parse 提取文本
   ├─ 图片 → tesseract.js chi_sim OCR（真实落地，替代占位）
   │        └ 模型缺失/识别置信度低 → 引导老师粘贴文本（Agent 自愈）
   └─ 文本 → 直接使用
   │
   ▼ extract_exam_questions（新工具，LLM 结构化提取）
   → 题集 JSON（question-bank）+ 校验器（题号连续/选项完整/题干非空）
   → 返回题集摘要给老师确认（多轮交互闭环）
   │
   ▼ generate_quiz_pptx（新工具）
   → quiz-pptx-renderer（专用渲染器）→ 讲题 PPT（题目页+答案页分离）
```

### 3.2 题集 JSON 中间格式（question-bank）

```json
{
  "paperTitle": "五年级数学期中试卷",
  "grade": "五年级",
  "subject": "数学",
  "questions": [
    {
      "no": 1,
      "type": "choice | fill | judge | compute | answer",
      "stem": "题干（Unicode 文本，公式用符号表达）",
      "options": ["阳光", "水", "氧气", "二氧化碳"],
      "answer": "C",
      "analysis": "解析文本（答案页展示）",
      "knowledge": "光合作用",
      "points": 3
    }
  ]
}
```

### 3.3 讲题 PPT 布局（quiz-pptx-renderer，白板讲评专用）

| 元素 | 设计 |
|---|---|
| 画布 | 16:9 `13.33×7.5"`，`MARGIN 0.85"`（借鉴 lesson-plan） |
| 封面页 | 试卷名 hero 大字 + 题数/科目/知识点清单 + 编制人 |
| 题目页（选择题） | 页眉（试卷名+题号+分值）；**大字题干 ≥28pt**；选项 **A/B 左列 C/D 右列**（字母圆圈徽章，无答案提示）；底部"先作答，翻页看答案"轻提示 |
| 题目页（大题/解答） | 题干区占**上方 35%**；下方 **65% 大面积留白**，浅色网格线辅助书写——教师直接在白板演算 |
| 答案页（每题跟随） | 题干缩略 + **答案绿框高亮** + 解析 + 知识点标签 |
| 导航 | 底部进度条 + 右下角水印页码（借鉴 lesson-plan） |
| 主题 | 复用升级后的语义化主题系统（见 3.5） |

### 3.4 班会 PPT（generate_class_meeting_pptx）

- 内置 8 个主题模板：防欺凌 / 交通安全 / 防溺水 / 心理健康 / 节约粮食 / 感恩教育 / 传统节日 / 诚信教育
- 每模板：主题配色（复用主题系统）+ 固定结构（封面→班会目标→情景导入→知识/案例→互动讨论→总结→课后延伸）
- 渲染：**先修复通用 pptx 渲染器重叠 bug**，班会 PPT 用通用渲染器 + 结构模板填充（内容为标题+要点列表，无需专用布局）
- LLM 按主题生成内容 → 模板渲染 → 下载

### 3.5 主题设计系统升级（兼容现有）

现有 `THEME_COLORS`（primary/secondary 两色）升级为语义化结构（**保留 primary/secondary 别名兼容 4 个现有渲染器**）：

```ts
interface ThemeSpec {
  primary: string; secondary: string;      // 兼容旧字段
  palette: { bg, surface, text, muted, accent, accent2, good, warn, bad };
  fonts: { display, body, cjk };
  scale: { hero, title, body, meta, small };
}
```

6 个现有主题升级为完整语义化配色（docx/pptx/pdf 渲染器改读 palette 的对应字段，行为不变），quiz-pptx-renderer 使用完整 palette。

### 3.6 Agent 多轮交互闭环（老师完整使用流）

1. "帮我把这份卷子做成讲题 PPT" + 上传图片/PDF（前端文件上传已有）或粘贴文本
2. Agent 调 `extract_exam_text` 解析 → `extract_exam_questions` 提取题集
3. Agent 回复**题集摘要**（题数、每题的题型/知识点/题干前 20 字）询问确认
4. 老师确认或修正（"去掉第 5 题"、"把第 2 题也加上"——重提取）——**多轮交互能力体现**
5. Agent 调 `generate_quiz_pptx` → 返回下载链接

## 4. 依赖与风险

| 项 | 方案 | 风险 |
|---|---|---|
| PDF 文本提取 | `pdf-parse`（纯 JS，轻量） | 低；扫描版 PDF 无文本层 → 降级为图片 OCR 或提示粘贴 |
| 图片 OCR | `tesseract.js`（WASM + chi_sim 语言包） | 中：语言包首次加载需网络（约 12MB）；印刷体质量 OK，手写不行。降级：加载失败 → 明确提示老师粘贴文本（Agent 自愈路径） |
| 公式 | Unicode 符号文本（√ × ÷ ² 等），**不做 LaTeX 渲染** | YAGNI |
| 渲染器重叠 bug | 修复通用 pptx-renderer（垂直布局游标+超页开新页） | 必修（班会 PPT 依赖） |

## 5. 验收标准

1. **三种输入**（图片/PDF/文本）各端到端生成一次讲题 PPT：每页一题、选项完整、大题有 65% 留白、答案页分离跟随
2. 选择题页双列选项无重叠；答案页绿框高亮
3. 班会 PPT：8 主题模板可生成，无重叠
4. 单元测试（题集校验器/quiz 渲染器/OCR 服务/文本提取服务）+ 端到端脚本 `test-exam-pptx.mjs` + 全量回归（现有 57 用例 + tsc）
5. 越权防护：学生账号不可调用 3 个新工具（复用 needsPermission）

## 6. 不做清单（YAGNI）

- 公开课/赛课模板、动画特效、AI 配图、公式 LaTeX 渲染、老师在线编辑 PPT、题库系统

---

## 7. 优化评审与修订（V2，2026-08-15 追加）

> 基于代码实证的深度优化评审，优先效果与使用体验，UI 全局统一（禁用 emoji）。以下修订全部纳入。

### 7.1 使用体验修订

| 修订 | 说明 | 落地 |
|---|---|---|
| **Agent 工作台附件上传** | 现有 agent.html/agent-main.ts 无上传入口（teacher/student 页面有，agent 没有）——老师无法在对话中上传卷子，场景链路断裂 | agent 输入区加附件按钮（SVG 图标），上传后 fileId 注入任务文本 |
| **题集确认中断机制** | agent-graph 的 ReAct 循环只有"无工具调用→结束"，无法表达"提取完等老师确认" | 工具返回 `needConfirm` 标记 → 循环中断输出确认文案；题集缓存于会话（TTL 30min），下轮"确认生成"时复用 |
| **全站 emoji 清理** | agent-main.ts 23 处 emoji（🔧✅📥🤔…）；LLM 回复自带 📥🎉（prompt 无约束） | 前端图标统一为 SVG（`src/frontend/core/icons.ts`）；agent-graph system prompt 与各生成 prompt 增加"禁止 emoji"规则；错误提示符号改文字 |

### 7.2 效果修订

| 修订 | 说明 | 落地 |
|---|---|---|
| **PDF 渲染器分页修复** | 已发现 bug：`pdf-renderer.ts` drawLines 页底 `break` 静默丢弃文本；表格 drawRow 无分页，大表格画到页外被裁切 | 重构为块级分页：段落越界翻页续写；表格行级分页 + 跨页重复表头 |
| **quiz 渲染器长内容自适应** | 题干固定 h2.2@28pt、选项 h0.9@28pt，pptxgenjs 不自动增高 → 长题干压到选项区 | 题干按字符估算行数：超 4 行降档（28→24→20）或拆页；选项超长换行增高 |
| **答案页选项高亮** | 原设计"正确答案：C"纯文字，白板讲评需指着选项讲 | 答案页复制选项列表，正确选项字母绿圈高亮 + 文字加粗 |

### 7.3 工程修订

| 修订 | 说明 | 落地 |
|---|---|---|
| **OCR 单例 + 模型本地化** | 计划中每次 createWorker（模型加载 10-30s/次）；tesseract 默认 CDN 下载模型，评审现场断网不可用 | 静态单例 worker 懒加载复用；`scripts/download-tessdata.mjs` 预下载 chi_sim+eng 到 `server/assets/tessdata/`，langPath 优先本地 |
| **文件登记公共化** | office/quiz/meeting 三处重复 FileRecord 落盘登记 | 新增 `office-storage.service.ts`（persistFile），三处共用 |
| **测试工具提取** | zip 解析 helper 在 3 个测试/脚本中重复 | 提取 `__tests__/helpers/zip.ts` 共享 |

### 7.4 验收标准更新（V2）

1. 三项原验收标准保留（三输入端到端/讲题页布局/班会模板）
2. 老师可在 Agent 工作台**上传卷子附件**并在对话中生成讲题 PPT
3. 提取题集后 Agent **中断等待确认**，老师可删题/改题后再生成（多轮交互）
4. 全站（agent/teacher/student 前端 + LLM 输出 + 生成文档）**无 emoji**，图标为 SVG
5. 长 PDF（多页段落 + 30 行表格）分页完整不丢内容
6. 离线环境（tessdata 已预下载）OCR 可用
7. 复杂场景回归：原 9/10（PPTX 重叠）→ 预期 10/10
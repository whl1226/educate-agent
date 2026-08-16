# 乡芽 Agent 能力演示剧本（复赛评审版 · 5 分钟）

> 配套文档：`docs/复赛自检清单.md`（演示前逐项自检）、`docs/部署手册.md`、`docs/安全设计说明.md`。
> 本文是 **V2 Agent 工作台** 的独立演示剧本；四端表单功能演示仍见 `docs/演示脚本.md`。
> 版本：V2 · 2026-08-15

---

## 0. 演示准备清单（演示前 15 分钟）

### 0.1 环境启动

| 步骤 | 命令 | 说明 |
|---|---|---|
| 安装依赖 | `cd server && npm install` | 含 `@langchain/langgraph`、`@langchain/openai`、`@langchain/langgraph-checkpoint-sqlite` |
| 种子数据 | `npm run seed`（server 目录） | 幂等，可重复执行；账号见下表 |
| 启动服务 | `npm run start:dev`（server 目录）或 `node dist/main.js`；或根目录 `start.bat` | 服务端口 3000，健康检查 `GET /api/v1/system/health` |
| 浏览器 | 访问 `http://localhost:3000/login.html` | 登录后四端角色统一跳转 **`agent.html`**（`src/frontend/entries/login-main.ts:96`） |

### 0.2 Seed 账号（与 `server/src/db/seeds/run-seed.ts` 一致）

| 角色 | 姓名 | 用户名 | 密码 | 备注 |
|---|---|---|---|---|
| 教师 | 王秀兰 | `wangxiulan` | `Demo@2026xy` | 语文·班主任·五(2)班 |
| 教师 | 刘志强 | `liuzhiqiang` | `Demo@2026xy` | 数学 |
| 学生 | 李小雨 | `lixiaoyu` | `Demo@2026xy` | 五(2)班，学号 20260518 |
| 学生 | （42 人班级） | `student001`..`student042` | `Demo@2026xy` | |
| 家长 | 李建国 | `lijiangguo` | `Demo@2026xy` | 李小雨父亲 |
| 家长 | 王芳 | `wangfang` | `Demo@2026xy` | 李小雨母亲 |
| 管理员 | 周局长 | `zhoujuzhang` | **`Admin@2026Xy`** | ⚠️ 注意：管理员密码与统一演示密码不同（seed 第 91 行 `Admin@2026Xy`） |

### 0.3 模型配置（`server/.env`，不配置即为演示模式）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `LLM_PROVIDER` | `demo`（无 Key 即规则引擎） | 置为 `openai-compatible` 启用真实 LLM |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` | OpenAI 兼容地址 |
| `LLM_API_KEY` | 空 | DeepSeek/兼容服务 Key |
| `LLM_MODEL` | `deepseek-chat` | |
| `EMBEDDING_PROVIDER` | `hash`（确定性哈希 64 维，无 Key 可跑） | 置为 `openai-compatible` 启用真实向量 |
| `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL` | 空 / 通义兼容地址 / `text-embedding-v3` | 真实 embedding（通义/OpenAI） |

### 0.4 前置数据操作（重要）

1. **知识库入库检查（第二幕前提）**：`knowledge_chunks` 表需有教材分块数据（当前种子脚本只写入 `textbook_contents`，chunk 切分入库需提前执行——可从 `textbook_contents`（草船借箭/祖父的园子等，人教版 2019 审定）切块写入 `knowledge_chunks` 并生成 embedding，或使用已入库环境）。检查 SQL：`SELECT COUNT(*) FROM knowledge_chunks;`，为 0 时第二幕检索将无结果、无 refs。
2. **诊断闭环前置（第一/四幕更真实）**：用 `lixiaoyu / Demo@2026xy` 登录 agent.html，先让 Agent 调 `practice_questions` 取 1–2 道题并 `submit_answer`（故意答错 1 道），再跑诊断 → 错题数/掌握度变化可见。李小雨已有种子作答记录与错题本（run-seed.ts:394–447），不做此步也能演示，但做了更完整。BKT 的 EM 拟合需单个知识点作答 ≥15 条（`bkt.ts:fitByEM`），演示时留意工具结果中的 `evidenceCount`。
3. **建议预热**：演示前用 `lixiaoyu` 跑一次「帮我诊断学习薄弱点」、用 `wangxiulan` 跑一次知识问答，确认事件流与任务历史正常，避免首轮冷启动耗时。
4. **服务自检**：`curl http://localhost:3000/api/v1/system/health` 返回 ok；`npm test`（server 目录）全绿（见 `docs/测试报告.md`）。

### 0.5 演示画面要求

- 浏览器窗口建议 1280×900 以上，三栏布局完整可见（左侧任务历史 / 中间消息流 / 右侧运行详情）。
- 提前打开一个「任务历史 → 运行详情」实例作为第四幕素材。
- 录屏 OBS ≤5 分钟，1080p，输出至 `docs/演示视频/`。

---

## 第一幕（0:00–1:00）任务理解 + 流程编排

### 操作步骤

1. 教师账号登录：`wangxiulan / Demo@2026xy` → 自动进入 `agent.html`，欢迎语提示可尝试的 5 类任务（诊断/知识/备课/预警/计划）。
2. 输入任务（二选一）：
   - **教师账号（LLM 模式推荐）**：「帮学生:4 诊断薄弱点，并生成一周 ZPD 学习计划」（`:4` 为李小雨 userId，**以实际库为准**：seed 按 管理员=1、王秀兰=2、刘志强=3、李小雨=4 的顺序插入，可用 `SELECT id, username FROM users;` 复核）；
   - **学生账号（演示模式推荐）**：「帮我诊断学习薄弱点」（demo 规则模式自动绑定本人 userId）。
3. 观察顶部思考块出现：「已识别意图「diagnose」，进入规则引擎执行（演示模式）」或 LLM 模式的「开始理解任务：解析意图、规划所需工具与执行顺序」（点击思考块头部可折叠/展开）。
4. 观察工具卡片逐个出现：
   - LLM 模式：`run_diagnosis` → `get_error_book` / `get_study_plan`（LLM 自主编排，顺序视其规划）；
   - 演示模式：确定性顺序 `run_diagnosis` → `get_error_book`（`agent-graph.ts` diagnose 分支）。
5. 展开第一张工具卡片：可见**参数**（`studentId`）、**结果**（整体掌握度/各知识点 mastery/confidence/evidenceCount）、**耗时**（✓ 完成 · xx ms）。

### 评审看点

- 意图理解：任务被正确归类为 `diagnose`（5 类意图标签：diagnose/teach/generate/knowledge/admin/general，`detectIntent` 规则兜底）。
- 流程编排：工具调用顺序符合业务依赖——先诊断、再取错题/计划，不凭空生成。
- 全链路证据：每个工具卡片的参数、结果、状态、耗时都可展开查看。

### 预期画面

```
🤔 思考（可折叠）
    已识别意图「diagnose」，进入规则引擎执行（演示模式）。
🔧 run_diagnosis        ✓ 完成 · 214ms
   ▸ 参数: {"studentId":4}
   ▸ 结果: {"overallMastery":0.62,"dims":[...],"confidence":0.71,"evidenceCount":9}
🔧 get_error_book       ✓ 完成 · 38ms
   ▸ 参数: {"studentId":4}
   ▸ 结果: [{"id":1,"errorType":"形近字混淆",...}]
✅ 交付完成
   （演示模式）已执行 2 个工具步骤。详情见下方工具轨迹与结果。
```

---

## 第二幕（1:00–2:00）工具调用 + 知识增强

### 操作步骤

1. 继续用教师账号（或任意账号）输入：「《草船借箭》讲了什么故事？为什么诸葛亮能成功？」
2. 观察 `search_knowledge` 工具卡片出现（**LLM 模式**）：系统提示要求知识类问题必须调用本工具并标注引用。
3. 展开工具结果：可见教材片段（title/chapter/content/source=人教版 2019 审定），可讲解「BM25 + 向量双路召回 → RRF 融合 → 图谱命中加权」（优秀级混合检索，`hybrid-retriever.ts`）。
4. 观察最终回答下方出现**引用标签** `📖 chunk:xxx`（`verifyRefs` 校验通过的真实检索命中，防幻觉）。
5. 追问（多轮记忆演示）：「那曹操为什么会上当？」→ 回答承接前文，无需重复解释背景（LangGraph `checkpoint-sqlite` 跨轮记忆生效）。

### 评审看点

- 知识增强：检索结果带出处引用，回答严格基于检索片段。
- 防幻觉：交付前 `verifyRefsAndFlag` 校验，无效引用剔除并提示（`refs-verify.ts`）。
- 多轮交互：checkpoint 记忆使追问上下文保持。

### 预期画面

```
🔧 search_knowledge     ✓ 完成 · 96ms
   ▸ 参数: {"query":"《草船借箭》讲了什么故事？为什么诸葛亮能成功？","topK":5}
   ▸ 结果: [{"id":3,"title":"草船借箭","chapter":"五年级·第2单元",...}]
💬 《草船借箭》出自人教版五年级上册，讲的是周瑜妒忌诸葛亮的才干……（引用片段）
   ——引用均来自教材知识库，点击验证真实存在
📖 chunk:3   📖 chunk:7
```

> 说明：demo 规则模式下知识意图只执行 `search_knowledge`，事件流完整但**无引用标签与流式文本**（refs 仅在 LLM 模式产出），应急方案见第五幕。

---

## 第三幕（2:00–3:00）多轮交互 + 苏格拉底

### 操作步骤

1. 切换为学生账号 `lixiaoyu / Demo@2026xy`（演示"学生求助"视角）。
2. 输入：「帮我辅导这道题：x + 3 = 8」→ **需 LLM 模式**（demo 规则模式不触发 `socratic_tutor`，降级表现见第五幕）。
3. 观察 `socratic_tutor` 工具卡片：结果含 `stage`（五阶段 read→identify→relate→solve→verify）、`text`（引导语）、`escalate`、`refs`（`socratic:read` 等）。
4. 逐轮追问推进：学生回复带进展（"已知条件是 x 加 3 等于 8"）→ 阶段前进；回复无进展 2 次 → 阶段回退（`socratic-state-machine.ts` 的 stall 机制）。
5. **答案拦截演示**：输入「答案就是 5」→ `detectFullAnswer` 命中 → 不给答案，改为引导语「我们先不急着下结论。你先说说：这道题里有哪些已知条件？」。

### 评审看点

- 多轮交互：苏格拉底状态机跨轮推进/回退/转人工（`escalate`），不是一次性问答。
- 教育伦理：绝不直接给学生答案，答案形式输入被拦截（AI 生成语也做二次拦截）。

### 预期画面

```
🔧 socratic_tutor       ✓ 完成 · 112ms
   ▸ 参数: {"problem":"x + 3 = 8","studentReply":"答案就是 5"}
   ▸ 结果: {"stage":"identify","text":"我们先不急着下结论。你先说说：这道题里有哪些已知条件？...","escalate":false,"refs":[{"title":"辅导阶段：identify","ref":"socratic:identify"}]}
```

---

## 第四幕（3:00–4:00）结果交付 + 追溯

### 操作步骤

1. 回到第一幕的会话：点击中间区域交付卡片（`✅ 交付完成`）——报告内容可操作：整体掌握度、薄弱知识点、建议动作。
2. 点击左侧**任务历史**中任意一条运行（`#id 任务 · intent · status · 工具数 · 耗时`）→ 右侧**运行详情**侧栏展开全链路 trace：思考 → 每次工具调用的参数/结果/状态/耗时 → 最终交付。
3. 用管理员 `zhoujuzhang / Admin@2026Xy` 登录 → 可查看**全部用户**的任务历史（admin 不限 scope，`agent.service.ts:listRuns`）→ 打开李小雨某次诊断运行做"复盘"。
4. 数据闭环（可选，视剩余时间）：切家长 `lijiangguo` 看周报（`get_weekly_report` 家长端脱敏视图）、切教师 `wangxiulan` 看班级概览（`get_class_overview`），说明"诊断结果回流到四端数据视图"。

### 评审看点

- 结果交付：交付卡片输出可理解（自然语言报告）、可操作（给出建议）、可追溯（refs + trace）。
- 全链路追溯：任意一次运行可从 `GET /api/v1/agent/runs/:id` 完整回放思考/工具/参数/结果/耗时。
- 数据闭环：Agent 调用的是真实业务服务（`run_diagnosis` 等绑定 `student/teacher/org/parent/admin` Service），结果自动落库回流四端。

### 预期画面

```
🗂 任务历史                       🧬 运行详情
#12 帮我诊断学习薄弱点          #12 帮我诊断学习薄弱点
    diagnose · success            success · 412ms · 2 个工具
    · 2 个工具 · 412ms        🤔 思考: 已识别意图「diagnose」…
#11 草船借箭讲了什么故事？      🔧 run_diagnosis
    knowledge · success           {"studentId":4}
    · 1 个工具 · 96ms         ↳ done · 214ms
#10 …                            🔧 get_error_book
                                 {"studentId":4}
                                 ↳ done · 38ms
                             ✅ 交付: （演示模式）已执行 2 个工具步骤…
```

---

## 第五幕（4:00–5:00）边界与降级

### 操作步骤

1. 说明降级前提：`.env` 不配 Key（`LLM_PROVIDER` 缺省 `demo`）时，系统**不会崩**，自动进入规则引擎。
2. 现场演示（若当前就是 demo 模式则直接展示）：输入「帮我诊断学习薄弱点」→ 事件流仍完整（thinking/tool_start/tool_end/done），工具轨迹**真实执行、真实数据**（调用的就是真业务 Service），但无流式文本、无引用标签、无苏格拉底。
3. 失败路径说明：工具异常时卡片显示 `✗ 失败 · xx ms` 并可展开错误；运行状态记为 `needs_human`；工具超时 30s 自动中断（`tool-registry.ts`）。
4. 限流说明：`POST /api/v1/agent/chat` 限流 10 次/分钟/用户，连发会 429（`RateLimit`）。
5. **合规收尾话术**：演示数据为种子数据（教材内容标注"教材内容·教育用途"许可）；学生数据在家长端脱敏、周报需家长授权；AI 结论仅供辅助——「**诊断结果仅供参考，不替代教师评价**」。

### 评审看点

- 优雅降级：无 Key 环境功能可用（demo 规则模式），有 Key 即切真实 AI（`AIService` 双 Provider 设计）。
- 失败可感知：工具失败/超时/限流均有明确状态与提示，不静默吞错。
- 合规边界：演示数据角标、授权说明、不替代教师评价，三条都讲到位。

---

## 应急方案

| 故障场景 | 表现 | 处理 |
|---|---|---|
| **LLM 无 Key**（`LLM_PROVIDER` 缺省 demo） | 规则引擎按意图执行：diagnose→run_diagnosis+get_error_book；teach→get_study_plan+get_error_book；generate→generate_lesson_plan(语文/五年级/草船借箭)；knowledge→search_knowledge；admin→get_region_overview+list_alerts(5)；general→run_diagnosis。事件流完整，无流式文本/无 refs/无苏格拉底 | 不阻塞演示：强调"步骤流与工具轨迹真实可查"，第二/三幕改为演示模式可覆盖部分（第二幕检索仍可看；第三幕苏格拉底需 LLM 模式） |
| **Embedding 无 Key**（`EMBEDDING_PROVIDER` 缺省 hash） | 确定性哈希 64 维 0/1 特征向量，检索仍可复现可用，召回略弱 | 不阻塞：可讲"向量通道降级为确定性特征，保证离线可跑" |
| **checkpoint-sqlite 初始化失败** | 日志警告「本轮记忆关闭」，多轮追问上下文丢失 | 重启服务；演示时避免追问式长对话 |
| **工具失败/超时** | 卡片 `✗ 失败 · xx ms`，运行状态 `needs_human`，30s 超时自动中断 | 换一个工具或任务重试；可顺势演示失败可见性 |
| **限流 429** | 「请求过于频繁」 | 等待 1 分钟；演示中控制提问节奏 |
| **无种子数据** | 登录失败/首页空 | 先 `npm run seed`（幂等）再启动 |
| **知识库空**（第二幕） | search_knowledge 返回空、无 refs | 提前确认 `knowledge_chunks` 已入库（见准备清单 0.4-1）；可临时用 SQL 从 `textbook_contents` 插入分块 |

---

## 评审脚本速查（30 秒版）

> 任务理解 → 编排 → 工具 → 知识 → 多轮 → 交付 → 追溯 → 降级 → 合规
> 「帮学生:4 诊断薄弱点，并生成一周 ZPD 学习计划」→「草船借箭讲了什么故事？」→「帮我辅导 x+3=8」→ 任务历史回放 → 无 Key 演示 →「诊断结果仅供参考，不替代教师评价」

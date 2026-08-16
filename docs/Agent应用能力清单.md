# Agent 应用能力清单

> 对应《GOAI 无界应用参赛手册》附录 B 模板逐项填写 ｜ 乡芽 · 乡镇教育智能体
> 填写日期：2026-08-15 ｜ 本清单与当前代码实现逐条对照（真实 LLM 模式已验证）

---

## 应用入口

- **Web 工作台（主入口）**：登录后进入 `agent.html`（Agent 工作台）——左侧任务历史、中间步骤流对话区、右侧全链路轨迹侧栏；教师/学生/家长/管理四端页面保留为数据视图，可从工作台快捷进入
- **访问方式**：浏览器访问 `http://<host>:3000/agent.html`，账号登录（四端演示账号见 `docs/复赛自检清单.md`）

## 目标用户

| 用户 | 关键任务 |
|---|---|
| 乡镇学生（李小雨等） | 诊断学习薄弱点、苏格拉底辅导、错题分析、学习计划、知识问答 |
| 乡镇教师（王秀兰等） | 一键备课、组卷、班级学情概览、教研点评 |
| 家长 | 孩子学情周报、育儿建议 |
| 县区管理者（周局长等） | 区域学情看板、控辍保学/师资预警 |

## 核心流程（从输入到结果交付）

```
用户输入自然语言任务
  → POST /api/v1/agent/chat（SSE 流式）
  → 意图识别（detectIntent 规则 + LLM function-calling 双通道）
  → ReAct 循环（LangGraph StateGraph）：LLM 决策 → ToolRegistry 执行 → 结果回填 → 再决策（≤12 轮）
  → 引用校验（verifyRefs 防幻觉）
  → 交付：流式文本 + 结构化报告 + refs 引用 + agent_runs/agent_messages 全链路落库
  → 前端步骤流渲染：思考块（折叠）→ 工具卡片（参数/结果/耗时/状态色）→ 流式文本 → 交付卡片
```

## Agent 能力（对照评审六项，全部已实现并实测）

| 能力 | 实现 | 实测证据 |
|---|---|---|
| **任务理解** | `detectIntent` 规则引擎 + LLM 意图解析（系统提示 8 条规则约束） | 学生/教师/管理端不同表述均正确路由工具（实测 4 端 5 类任务） |
| **计划生成** | ReAct 循环中 LLM 自主拆解多步计划并决策工具顺序 | 实测"诊断+错题+计划"复合任务一次循环自主调用 3 个工具 |
| **多轮交互** | LangGraph checkpoint-sqlite 记忆（thread_id 隔离）+ 苏格拉底五阶段状态机（推进/回退/转人工） | 追问上下文保持；辅导阶段逐级推进 |
| **工具调用** | ToolRegistry 16 个教育工具（带 JSON Schema + 角色权限 + 30s 超时 + 轨迹记录） | 实测 4 端工具真实调用并落库（诊断/错题/计划/备课/区域/预警） |
| **知识增强** | embedding 向量 + BM25 双路召回 → RRF 融合 → 图谱加权 → **引用校验防幻觉** | 实测《草船借箭》检索返回 7 个 chunk 引用；空库时模型拒绝编造 |
| **记忆** | checkpoint-sqlite（独立文件，SQLITE_BUSY 自动降级）+ agent_messages 全量轨迹 | 运行期故障降级重试已实现 |
| **结果验证** | refs 引用校验（无效引用剔除并提示）+ run 状态机（success/needs_human/failed）+ 全链路 trace 回放 | 实测 runDetail 展开思考/工具/结果逐条 |

## 工具 / 系统依赖

| 类别 | 明细 |
|---|---|
| 模型 | DeepSeek `deepseek-chat`（OpenAI 兼容 API，function calling 已验证）；embedding：可选通义 `text-embedding-v3`，无 Key 时确定性哈希降级 |
| Agent 框架 | LangGraph.js（`@langchain/langgraph` 1.4.9 + checkpoint-sqlite） |
| 数据库 | SQLite（better-sqlite3，WAL）：业务表 41 张 + agent_runs/agent_messages + knowledge_chunks（含 FTS5 虚拟表） |
| 知识库 | 教材分块 16 块（人教版五年级语文，含向量与全文索引） |
| 工具层 | 16 个教育工具：run_diagnosis / get_latest_diagnosis / get_error_book / get_study_plan / practice_questions / submit_answer / search_knowledge / socratic_tutor / generate_lesson_plan / generate_paper / get_class_overview / researcher_comment / get_weekly_report / get_region_overview / list_alerts / get_teacher_profile |
| 算法 | BKT 贝叶斯知识追踪（前向滤波+遗忘衰减+EM 拟合）、ZPD 最近发展区（依赖 DAG+贪心）、苏格拉底状态机 |
| 基础设施 | NestJS 10 / Redis 可选（未启用时内存降级）/ Nginx 部署模板 |

## 输入输出

| 项 | 说明 |
|---|---|
| 输入样例 | "帮我诊断一下我的学习薄弱点" / "帮我看看学习情况、错题本和计划进展" / "《草船借箭》讲了什么？" / "生成一份五年级语文《草船借箭》教案" / "看看区域学情和预警" |
| 输出结构 | SSE 事件流：`thinking`（思考）→ `tool_start`/`tool_end`（工具卡片）→ `text_delta`（流式文本，24 字符缓冲聚合）→ `done`（finalText + refs） |
| 质量要求 | 学情数据必须来自工具返回（禁止编造，系统提示第 6 条强制）；引用必须通过 verifyRefs；回答结构化（Markdown 表格/分点） |
| 展示方式 | 工作台步骤流 UI：思考块可折叠、工具卡片可展开参数/结果/耗时、引用标签展示、右侧 trace 全链路回放 |

## 失败处理

| 场景 | 处理方式 |
|---|---|
| 缺失信息 | 工具参数可自动推断（当前登录用户）则直接推断；否则调用工具后根据结果决定是否询问 |
| 工具调用失败 | 错误记录到轨迹（tool_end error）+ 标记 needs_human；模型可自愈（换正确参数重试） |
| 越权访问 | assertSelfScope / 角色权限拦截，返回"无权访问"错误，模型据提示自动改用当前用户身份重试（已实测自愈） |
| LLM 不可用/超时 | 45s 超时；无 Key 时自动降级 Demo 规则引擎（事件流完整、打演示角标） |
| checkpoint 故障 | SQLITE_BUSY 时降级无记忆重试一次，thinking 事件告知用户 |
| 知识库未覆盖 | 模型明确告知"知识库未检索到相关内容"，拒绝编造（已实测） |
| 引用校验失败 | 无效引用从交付中剔除并在摘要中提示（Task 11） |

## 安全边界

- **未成年人保护**：心理/控辍类仅"预警不诊断"；学生数据仅本人/监护教师/绑定家长可见；不给学生直接答案（苏格拉底规则层拦截）
- **数据授权**：演示数据为模拟数据（seed 标注"演示数据"）；家长周报含授权说明（auth_note）
- **权限控制**：JWT + RBAC + 水平越权拦截（学生只能查本人、家长只能查绑定孩子、教师端工具需 teacher 角色、管理端工具需 admin 角色，实测学生调备课被拒）
- **防重放/防伪**：登录后 CSRF 双提交 + 防重放（X-Timestamp/X-Nonce）+ 签名校验；SSE 端点限流 10 次/分钟
- **行业边界**：诊断结果标注"仅供参考，不替代教师评价"；AI 批改/点评均需教师人工确认
- **不替代专业判断**：预警类输出均含"需人工核实"提示，不自动处置

## 运行证据

| 证据类型 | 位置/说明 |
|---|---|
| 自动化测试 | `server/` 下 `npm test`：39 用例全绿（BKT 5 / ZPD 2 / 苏格拉底 6 / 工具注册 4 / Agent 图 5 / 引用校验 1 / 越权防护 4 / 混合检索 5 / 冒烟 1），覆盖算法正确性、越权防护、事件流 |
| 端到端实测 | `server/test-agent-llm.mjs`：真实 DeepSeek 编排四端全链路验证（诊断 44% 掌握度真实数据、RAG 引用、教案生成、区域预警），SSE 事件流完整 |
| 轨迹审计 | `GET /api/v1/agent/runs/:id` 全链路回放（思考/工具参数/结果/耗时逐条） |
| 演示视频/截图 | 见 `docs/演示视频/`（录制中）与 `docs/Agent能力演示剧本.md` |
| 测试报告 | `docs/测试报告.md`（更新中） |

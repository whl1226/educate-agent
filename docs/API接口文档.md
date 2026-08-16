# 乡芽 · 乡镇教育智能体 — API 接口文档

统一前缀：`/api/v1`。统一响应包裹：`{ code, message, data, timestamp }`，`code=0` 表示成功。

| 错误码 | 含义 |
|---|---|
| 0 | 成功 |
| 40001 | 参数校验失败 |
| 40101 | 未登录 / Token 失效 |
| 40301 | 无操作权限（越权） |
| 40303 | 安全校验失败（CSRF/签名） |
| 40304 | 请求已处理，请勿重复提交（Nonce 重放） |
| 40401 | 资源不存在 |
| 40901 | 业务冲突（如今日已打卡） |
| 42901 | 请求过于频繁（限流） |
| 50001 | 系统繁忙（内部错误，对外脱敏） |

请求需携带：`Authorization: Bearer <accessToken>`、`X-CSRF-Token`（非 GET）、写操作另需 `X-Timestamp / X-Nonce / X-Signature`（见安全设计）。

---

## 1. 认证 auth

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /auth/captcha | 验证码 `{id, svg}` |
| GET | /auth/csrf | 初始化 CSRF `{csrfToken}`（先调用） |
| POST | /auth/login | 登录，body `{username,password,captchaId?,captchaAnswer?}`，限流 10/15min |
| POST | /auth/refresh | 刷新 Access（仅 CSRF 头，无需签名），限流 30/15min |
| POST | /auth/logout | 登出当前 |
| POST | /auth/logout-all | 全端登出 |
| GET | /auth/sessions | 会话列表 |
| POST | /auth/sessions/revoke | 撤销某会话 |
| POST | /auth/force-logout | 管理员强制下线 |
| POST | /auth/password/change | 修改密码 `{oldPassword,newPassword}` |
| POST | /auth/password/reset-request | 重置请求，限流 3/15min |
| POST | /auth/password/reset | 重置，限流 5/15min |
| GET | /auth/me | 当前用户 `SafeUser{id,username,displayName,role,avatar,phoneMasked,studentNo}` |

## 2. 教师 teacher

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /ai/lesson/generate | 教案生成 |
| GET | /lesson-plans | 教案库列表 |
| POST | /ai/paper/generate | 一键组卷 |
| GET | /papers | 试卷库 |
| POST | /papers/:id/deploy | 布置 |
| GET | /papers/:id/export | 导出 |
| GET | /grading/pending | 待批改列表 |
| GET | /grading/:taskId/result | 批改结果 |
| POST | /grading/:taskId/confirm | 采纳/确认 |
| POST | /grading/:taskId/essay-comment | 作文批语 |
| POST | /ai/researcher/comment | 教研员点评 |
| POST | /ai/researcher/talk-script | 讲题话术 |
| POST | /ai/researcher/advice | 教学建议 |
| POST | /reviews/:id/adopt | 采纳点评 |
| POST | /ai/speech/generate | 发言稿 |
| GET | /speech-docs | 发言稿列表 |
| GET | /back-to-school/package | 开学返校包 |
| GET | /knowledge-base | 家校知识库 |
| GET | /skills/self-assessment | 技能自评 |
| POST | /skills/report | 技能报告 |
| POST | /title/organize | 职称材料分类 |
| POST | /ai/micro/generate | 微课脚本 |
| GET | /resources | 教学资源列表 |
| POST | /resources | 新建资源 |
| GET | /collab/groups | 协作备课组 |
| POST | /collab/groups | 创建组 |
| POST | /collab/plans | 提交协作计划 |
| GET | /collab/feed | 协作动态 |
| POST | /files/ocr | 文本 OCR 转教案 |

## 3. 学生 student

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /dashboard/home | 学生首页聚合 |
| GET | /study-plan | 学习计划 |
| POST | /study-plan/generate | 生成计划 |
| POST | /study-plan/steps/:id/answer | 提交计划步骤作答 |
| GET | /error-book | 错题本 |
| GET | /error-book/review-plan | 复习计划 |
| POST | /error-book/:id/review | 错题复习确认 |
| POST | /checkins | 每日打卡（同日 40901） |
| GET | /checkins/month?month=YYYY-MM | 打卡月历 |
| POST | /voice-practice | 提交听说练习 |
| GET | /voice-practice/score | 听说成绩 |
| POST | /reading-practice | 提交朗读 |
| GET | /reading-practice/score | 朗读成绩 |
| GET | /books | 分级书库 |
| GET | /books/:id | 书籍详情 |
| POST | /reading-progress | 读书进度 |
| POST | /reading-quiz | 阅读自测 |
| GET | /mental/light-reminder | 心灵提醒 |
| GET | /code/tasks | 编程任务 |
| POST | /code/run | 代码运行 |
| POST | /tutor/sessions | 建苏格拉底会话 |
| POST | /tutor/sessions/:id/messages | 辅导提问 |
| POST | /qa/sessions | 建问答会话 |
| POST | /qa/sessions/:id/messages | 教材问答 |
| POST | /answers | 提交作答 |
| POST | /diagnosis/run | 学情诊断 |
| GET | /diagnosis/latest | 最新诊断 |
| POST | /interest/profile | 兴趣画像 |

## 4. 家长 parent

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /weekly-report | 学情周报 |
| POST | /voice-messages | 语音留言 |
| GET | /voice-messages | 留言列表 |
| POST | /parenting-tips | 育儿话术 |
| GET | /family-courses | 亲子课程 |
| POST | /family-courses/:id/complete | 完成课程 |
| GET | /big-mode/services | 大字模式服务 |

## 5. 管理端 admin

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /admin/region/overview | 区域学情看板 |
| GET | /admin/teachers/ledger | 师资台账 |
| GET | /admin/alerts | 预警列表 |
| GET | /admin/alerts/:id | 预警详情 |
| POST | /admin/alerts/:id/resolve | 处置预警 |
| GET | /admin/supervise-tasks | 督导任务 |
| POST | /admin/supervise-tasks | 创建任务 |
| GET | /admin/teacher-portraits | 教师画像 |
| GET | /admin/resource-balance | 城乡资源均衡 |
| GET | /admin/research-activities | 教研活动 |
| GET | /admin/audit-logs | 审计日志 |
| POST | /admin/ai/generate | AI 治理分析 |

## 6. 组织 org（教师/管理）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /users | 用户列表 |
| GET | /users/teachers | 教师列表 |
| GET | /classes | 我的班级 |
| GET | /classes/:id/students | 班级学生 |
| GET | /classes/:id/overview | 班级概览 `{total,answerCount7d,accuracy7d,avgMastery,pendingGrading}` |
| GET | /classes/:id/knowledge-mastery | 知识点掌握度 |
| GET | /classes/:id/risk-students | 风险学生 |
| GET | /classes/:id/trends?days=7 | 班级趋势 `{labels,counts}` |
| GET | /students/:id/mastery | 学生掌握度 |
| GET | /parents/:id/children | 家长子女 |

## 7. 文件 / 通知 / 系统

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /files/upload?category=image | 上传（魔数校验） |
| POST | /files/ocr?fileId=N | 图片 OCR |
| GET | /notifications | 通知列表 |
| POST | /notifications/read-all | 全部已读 |
| POST | /notifications/push | 推送 |
| GET | /system/health | 健康检查 |

> 完整字段结构与示例响应见 `server/data/shapes/*.json`（45 个端点实测快照）。
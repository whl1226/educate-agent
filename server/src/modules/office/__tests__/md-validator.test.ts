import { describe, expect, it } from 'vitest';
import { validateMarkdown, stripMdSymbols, stripEmoji, stripMdAndEmoji, runsToText, THEME_COLORS } from '../md-validator';

const GOOD = `---
title: 五年级语文《草船借箭》教案
format: docx
theme: forest
author: 王秀兰
---
# 一、教学目标

这是第一段内容，介绍教学目的。

## 1.1 具体目标

- 目标一
- 目标二

| 序号 | 内容 |
| --- | --- |
| 1 | 导入 |

\`\`\`js
console.log('ok');
\`\`\`
`;

describe('validateMarkdown', () => {
  it('合法文档通过并生成 IR', () => {
    const r = validateMarkdown(GOOD);
    expect(r.valid).toBe(true);
    expect(r.doc).not.toBeNull();
    expect(r.doc!.title).toContain('草船借箭');
    expect(r.doc!.format).toBe('docx');
    expect(r.doc!.theme).toBe('forest');
    const types = r.doc!.blocks.map((b) => b.type);
    expect(types).toContain('heading');
    expect(types).toContain('paragraph');
    expect(types).toContain('list');
    expect(types).toContain('table');
    expect(types).toContain('code');
    const table = r.doc!.blocks.find((b) => b.type === 'table');
    expect(table).toEqual({ type: 'table', headers: ['序号', '内容'], rows: [['1', '导入']] });
  });

  it('缺少 YAML 头 → 结构错误', () => {
    const r = validateMarkdown('# 没有头\n内容');
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.code === 'MD_META_MISSING')).toBe(true);
    expect(r.issues[0].fix).toBeTruthy();
  });

  it('缺 title → MD_EMPTY_TITLE', () => {
    const r = validateMarkdown('---\nformat: docx\n---\n内容');
    expect(r.issues.some((i) => i.code === 'MD_EMPTY_TITLE')).toBe(true);
  });

  it('非法 format → MD_BAD_FORMAT', () => {
    const r = validateMarkdown('---\ntitle: t\nformat: exe\n---\n内容');
    expect(r.issues.some((i) => i.code === 'MD_BAD_FORMAT')).toBe(true);
  });

  it('未知 YAML 字段 → MD_META_UNKNOWN_FIELD', () => {
    const r = validateMarkdown('---\ntitle: t\nformat: docx\nhack: 1\n---\n内容');
    expect(r.issues.some((i) => i.code === 'MD_META_UNKNOWN_FIELD')).toBe(true);
  });

  it('危险 HTML → MD_DANGEROUS_HTML', () => {
    const r = validateMarkdown('---\ntitle: t\nformat: docx\n---\n<script>alert(1)</script>');
    expect(r.issues.some((i) => i.code === 'MD_DANGEROUS_HTML')).toBe(true);
  });

  it('javascript: 链接 → MD_BAD_URL', () => {
    const r = validateMarkdown('---\ntitle: t\nformat: docx\n---\n[点我](javascript:alert(1))');
    expect(r.issues.some((i) => i.code === 'MD_BAD_URL')).toBe(true);
  });

  it('标题层级超限 → MD_HEADING_DEPTH', () => {
    const r = validateMarkdown('---\ntitle: t\nformat: docx\n---\n##### 五级标题');
    expect(r.issues.some((i) => i.code === 'MD_HEADING_DEPTH')).toBe(true);
  });

  it('错误带行号与修复建议（Agent 自愈所需）', () => {
    const r = validateMarkdown('# 无头文档');
    for (const i of r.issues) {
      expect(i.line).toBeGreaterThanOrEqual(1);
      expect(i.message).toBeTruthy();
      expect(i.fix).toBeTruthy();
    }
  });

  it('theme 表覆盖全部主题', () => {
    expect(Object.keys(THEME_COLORS)).toEqual(['default', 'forest', 'ocean', 'sunset', 'ink', 'kids']);
  });

  it('行内 md 符号剥离为样式 runs（text 干净、样式保留）', () => {
    const r = validateMarkdown('---\ntitle: t\nformat: docx\n---\n这是**加粗**与*斜体*与`代码`的测试');
    expect(r.valid).toBe(true);
    const p = r.doc!.blocks.find((b) => b.type === 'paragraph')!;
    expect(p.text).toBe('这是加粗与斜体与代码的测试');
    expect(p.runs).toContainEqual(expect.objectContaining({ text: '加粗', bold: true }));
    expect(p.runs).toContainEqual(expect.objectContaining({ text: '斜体', italic: true }));
    expect(p.runs).toContainEqual(expect.objectContaining({ text: '代码', code: true }));
    expect(runsToText(p.runs, '')).toBe(p.text);
  });

  it('未闭合 md 符号兜底清理（不残留 **、孤立 *）', () => {
    const r = validateMarkdown('---\ntitle: t\nformat: docx\n---\n这是**未闭合文本（孤立*号） 与 `反引号');
    expect(r.valid).toBe(true);
    const p = r.doc!.blocks.find((b) => b.type === 'paragraph')!;
    expect(p.text).not.toContain('**');
    expect(p.text).not.toContain('`');
    expect(p.text).not.toContain('*');
  });

  it('stripMdSymbols 清理表格管道与行首符号', () => {
    expect(stripMdSymbols('### 标题')).toBe('标题');
    expect(stripMdSymbols('| a | b |')).toBe('| a | b |'); // 保留表格语法（由解析器消费）
    expect(stripMdSymbols('> 引用内容')).toBe('引用内容');
    expect(stripMdSymbols('---')).toBe('');
    expect(stripMdSymbols('**a** b')).toBe('a b');
  });

  it('emoji 全量剥离（含修饰符/ZWJ/区域标识）', () => {
    expect(stripEmoji('掌握度 44% 📊 需要关注 ✅ 完成 🔴 薄弱')).toBe('掌握度 44%  需要关注  完成  薄弱');
    expect(stripEmoji('👍👍🏽 表情')).toBe(' 表情');
    expect(stripEmoji('👨‍👩‍👧‍👦 家庭')).toBe(' 家庭');
    expect(stripEmoji('🇨🇳 国旗')).toBe(' 国旗');
    expect(stripEmoji('普通文本 123')).toBe('普通文本 123');
  });

  it('md + emoji 复合清理（IR 入库链路）', () => {
    const r = validateMarkdown('---\ntitle: t\nformat: docx\n---\n**重点**：掌握度 📊 44% ⚠️ 需关注');
    expect(r.valid).toBe(true);
    const p = r.doc!.blocks.find((b) => b.type === 'paragraph')!;
    expect(p.text).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(p.text).not.toContain('**');
    expect(p.runs).toContainEqual(expect.objectContaining({ text: '重点', bold: true }));
  });

  it('端到端：$x \\to y$ 公式转换后保留箭头符号 →', () => {
    const r = validateMarkdown('---\ntitle: t\nformat: docx\n---\n公式：$x \\to y$');
    expect(r.valid).toBe(true);
    const p = r.doc!.blocks.find((b) => b.type === 'paragraph')!;
    expect(p.text).toContain('→');
  });

  it('中文标点与编号保留（EMOJI_RE 不误伤文档内容）', () => {
    const r = validateMarkdown(
      '---\ntitle: 标点测试\nformat: docx\n---\n\n你好，世界。我们要学会《论语》里「仁」与"义"，去读①、②页！\n\n（一）步骤一。（二）步骤二。',
    );
    expect(r.valid).toBe(true);
    const text = (r.doc?.blocks ?? []).map((b: any) => (b.text ?? '')).join('\n');
    expect(text).toContain('《论语》');
    expect(text).toContain('①、②');
    expect(text).toContain('（一）');
    expect(text).toContain('。');
  });
});

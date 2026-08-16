import { describe, expect, it } from 'vitest';
import { PdfRenderer, findChineseFont } from '../renderers/pdf-renderer';
import { validateMarkdown } from '../md-validator';

const DOC = validateMarkdown(`---
title: 学情分析报告
format: pdf
theme: ink
---
# 一、总体情况

五年级语文整体掌握度 44%。

| 知识点 | 掌握度 |
| --- | --- |
| 形近字辨析 | 14% |
`);

describe('PdfRenderer', () => {
  it('生成合法 PDF（%PDF 魔数）', async () => {
    const r = new PdfRenderer();
    const buf = await r.render(DOC.doc!);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('中文字体可找到（simhei）', () => {
    const p = findChineseFont();
    expect(p).toBeTruthy();
  });
});

import { describe, expect, it } from 'vitest';
import { PptxRenderer } from '../renderers/pptx-renderer';
import { validateMarkdown } from '../md-validator';

const DOC = validateMarkdown(`---
title: 单元复习课件
format: pptx
theme: ocean
---
# 第一单元 童年往事

本单元重点内容。

- 知识点一
- 知识点二

| 章节 | 要点 |
| --- | --- |
| 1 | 导入 |
`);

describe('PptxRenderer', () => {
  it('生成合法 pptx（ZIP 魔数 PK）', async () => {
    const r = new PptxRenderer();
    const buf = await r.render(DOC.doc!);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});

import { describe, expect, it } from 'vitest';
import { DocxRenderer } from '../renderers/docx-renderer';
import { validateMarkdown } from '../md-validator';

const DOC = validateMarkdown(`---
title: 测试教案
format: docx
theme: forest
---
# 一、目标

正文段落。

- 要点一
- 要点二

| 列A | 列B |
| --- | --- |
| 1 | 2 |
`);

describe('DocxRenderer', () => {
  it('生成合法 docx（ZIP 魔数 PK）', async () => {
    const r = new DocxRenderer();
    const buf = await r.render(DOC.doc!);
    expect(buf.length).toBeGreaterThan(1000);
    // DOCX = ZIP 文件，魔数 PK\x03\x04
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it('标题/段落/列表/表格均不抛错', async () => {
    const r = new DocxRenderer();
    await expect(r.render(DOC.doc!)).resolves.toBeInstanceOf(Buffer);
  });
});

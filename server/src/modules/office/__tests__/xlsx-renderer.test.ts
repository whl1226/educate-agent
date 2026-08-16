import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { XlsxRenderer } from '../renderers/xlsx-renderer';
import { validateMarkdown } from '../md-validator';

const DOC = validateMarkdown(`---
title: 五年级成绩单
format: xlsx
theme: default
---
# 成绩单

| 姓名 | 语文 | 数学 |
| --- | --- | --- |
| 李小雨 | 85 | 78 |
| 王小明 | 92 | 88 |
`);

describe('XlsxRenderer', () => {
  it('生成合法 xlsx 且内容可读回', async () => {
    const r = new XlsxRenderer();
    const buf = await r.render(DOC.doc!);
    expect(buf.length).toBeGreaterThan(1000);
    // 读回验证
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const ws = wb.getWorksheet(1)!;
    expect(ws.getCell(1, 1).value).toContain('成绩单');
    expect(ws.getCell(3, 1).value).toBe('姓名');
    expect(ws.getCell(4, 2).value).toBe('85');
  });
});

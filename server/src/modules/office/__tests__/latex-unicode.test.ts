import { describe, expect, it } from 'vitest';
import { latexToUnicode } from '../latex-unicode';

describe('latexToUnicode', () => {
  it('行内公式：乘号', () => {
    expect(latexToUnicode('面积为 $S = a \\times b$')).toBe('面积为 S = a × b');
  });
  it('行内公式：分数', () => {
    expect(latexToUnicode('$\\frac{1}{2}$')).toBe('1/2');
  });
  it('行内公式：根号与希腊字母', () => {
    expect(latexToUnicode('$\\sqrt{2}\\pi r^2$')).toBe('√(2)πr²');
  });
  it('行内公式：上下标', () => {
    expect(latexToUnicode('$x^2 + y_1$')).toBe('x² + y₁');
  });
  it('块级公式保留换行', () => {
    expect(latexToUnicode('公式：\n$$a \\div b = c$$\n说明')).toContain('a ÷ b = c');
  });
  it('未闭合 $ 不残留', () => {
    expect(latexToUnicode('价格 $5 元')).toBe('价格 5 元');
  });
  it('运算符转换', () => {
    expect(latexToUnicode('$x \\leq 5, y \\geq 3, x \\neq y$')).toBe('x ≤ 5, y ≥ 3, x ≠ y');
  });
});

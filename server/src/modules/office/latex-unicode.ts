/** LaTeX 数学子集 → Unicode 可读文本（office 文档渲染用；前端对话仍用 KaTeX 富展示） */

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ',
  lambda: 'λ', mu: 'μ', pi: 'π', rho: 'ρ', sigma: 'σ', phi: 'φ', omega: 'ω',
  Omega: 'Ω', Delta: 'Δ', Sigma: 'Σ',
};

const OPS: Record<string, string> = {
  times: '×', div: '÷', pm: '±', mp: '∓', cdot: '·', approx: '≈',
  neq: '≠', leq: '≤', geq: '≥', ll: '≪', gg: '≫', to: '→', in: '∈',
  notin: '∉', subset: '⊂', supset: '⊃', cap: '∩', cup: '∪', forall: '∀',
  exists: '∃', partial: '∂', nabla: '∇', infty: '∞', angle: '∠',
  parallel: '∥', perp: '⊥', degree: '°', percent: '%', prime: '′',
};

const SUPER: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵',
  '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻',
  'n': 'ⁿ', 'x': 'ˣ', 'a': 'ᵃ', 'm': 'ᵐ',
};

const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅',
  '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋',
  'a': 'ₐ', 'x': 'ₓ', 'i': 'ᵢ', 'n': 'ₙ',
};

/** 行内公式 $...$ 与块级 $$...$$ → Unicode 文本 */
export function latexToUnicode(raw: string): string {
  let s = String(raw ?? '');
  // 块级 $$...$$ → 保留换行包裹
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_m, body: string) => `\n${convert(body)}\n`);
  // 行内 $...$
  s = s.replace(/\$([^$\n]+)\$/g, (_m, body: string) => convert(body));
  // 兜底：清理孤立 $ 符号（防止残留破坏排版）
  s = s.replace(/\$/g, '');
  return s;
}

/** 单个公式体转换（LaTeX 子集） */
export function convert(body: string): string {
  let s = body.trim();
  // 分数：\frac{a}{b} → (a)/(b)
  s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a: string, b: string) => `(${convert(a)})/(${convert(b)})`);
  // 根式：\sqrt{a} → √(a)，\sqrt[3]{a} → √[3](a)
  s = s.replace(/\\sqrt(?:\[([^\]]+)\])?\{([^{}]*)\}/g, (_m, idx: string | undefined, a: string) => `√${idx ? `[${idx}]` : ''}(${convert(a)})`);
  // 上下标：x^{2} / x_{1}
  s = s.replace(/\^\{([^{}]*)\}/g, (_m, a: string) => `^${convert(a)}`);
  s = s.replace(/_\{([^{}]*)\}/g, (_m, a: string) => `_${convert(a)}`);
  s = s.replace(/\^([0-9a-zA-Z+\-])/g, (_m, a: string) => SUPER[a] ?? `^${a}`);
  s = s.replace(/_([0-9a-zA-Z+\-])/g, (_m, a: string) => SUB[a] ?? `_${a}`);
  // 上标块（x^{2} 已转成 ^2，再统一转 Unicode；含字母保留 ^ 记号）
  s = s.replace(/\^([0-9]+)/g, (_m, d: string) => d.split('').map((c) => SUPER[c] ?? c).join(''));
  // 希腊字母（命令后空格为 LaTeX 分隔符，随命令一并吞掉：\pi r → πr）
  for (const [k, v] of Object.entries(GREEK)) {
    s = s.replace(new RegExp(`\\\\${k}(?![a-zA-Z])\\s?`, 'g'), v);
  }
  // 运算符
  for (const [k, v] of Object.entries(OPS)) {
    s = s.replace(new RegExp(`\\\\${k}(?![a-zA-Z])`, 'g'), v);
  }
  // 空格命令
  s = s.replace(/\\quad|\\qquad|\\,|\\;/g, ' ');
  // 花括号文本 {abc} → abc
  s = s.replace(/\{([^{}]*)\}/g, '$1');
  // 残余反斜杠命令（未知命令降级为去反斜杠）
  s = s.replace(/\\([a-zA-Z]+)/g, '$1');
  // 去掉 ^ _ 残留
  s = s.replace(/[\^_]/g, '');
  // 圆括号美化：(x)/(y) → x/y（分子分母为简单量时）
  s = s.replace(/\(([0-9a-zA-Zα-ωπ√²³]+)\)\s*\/\s*\(([0-9a-zA-Zα-ωπ√²³]+)\)/g, '$1/$2');
  return s.trim();
}

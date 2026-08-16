import MarkdownIt from 'markdown-it';
import YAML from 'yaml';
import type { DocFormat, InlineRun, OfficeBlock, ParsedDoc, ValidationIssue, ValidationResult } from './office.types';
import { latexToUnicode } from './latex-unicode';

const FORMATS: DocFormat[] = ['docx', 'pptx', 'pdf', 'xlsx'];
export const THEMES = ['default', 'forest', 'ocean', 'sunset', 'ink', 'kids'] as const;
const MAX_BODY_BYTES = 20 * 1024;        // 正文 ≤20KB
const MAX_PARAGRAPHS = 200;
const MAX_HEADING_LEVEL = 4;
const MAX_LIST_DEPTH = 5;
const MAX_TABLE_COLS = 10;
const MAX_CELL_CHARS = 200;

const md = new MarkdownIt({ html: false, linkify: false });

/** Emoji 剥离（Unicode 全范围，含修饰符/ZWJ/变体选择符/区域标识；箭头区 U+2190–21FF 保留，供公式符号 →←↑ 等使用） */
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2900}-\u{297F}\u{3297}\u{3299}]/gu;

export function stripEmoji(raw: string): string {
  return String(raw ?? '').replace(EMOJI_RE, '');
}

/** 残留 Markdown 符号兜底剥离（markdown-it 合法符号已被消费，这里清理孤立/畸形残留） */
export function stripMdSymbols(raw: string): string {
  return String(raw ?? '')
    .replace(/\$\$[\s\S]*?\$\$/g, (m) => latexToUnicode(m))
    .replace(/\$[^$\n]+\$/g, (m) => latexToUnicode(m))
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}> ?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*([-*_])\s*(\1\s*){2,}\s*$/gm, '')
    .replace(/```/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 兜底：清理仍残留的孤立标记（未闭合 **、反引号、非数字间单星号、行首 #）
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/(?<!\d)\*(?!\d)/g, '')
    .replace(/^\s*#{1,6}\s?/gm, '')
    .replace(/\$/g, '');
}

/** Markdown 符号 + Emoji 一并剥离（渲染器统一入口） */
export function stripMdAndEmoji(raw: string): string {
  return stripEmoji(stripMdSymbols(raw));
}

/** inline token children → 带样式片段（bold/italic/code 结构保留，文本剥离 md 符号与 emoji） */
function inlineRuns(token: { children?: readonly MarkdownIt.Token[] | null }): InlineRun[] {
  const runs: InlineRun[] = [];
  let bold = false;
  let italic = false;
  const push = (text: string, code = false) => {
    const clean = stripMdAndEmoji(text);
    if (!clean) return;
    runs.push({ text: clean, bold: bold || undefined, italic: italic || undefined, code: code || undefined });
  };
  const walk = (children: readonly MarkdownIt.Token[] | null | undefined) => {
    if (!children) return;
    for (const ch of children) {
      switch (ch.type) {
        case 'text':
          push(ch.content);
          break;
        case 'code_inline':
          push(ch.content, true);
          break;
        case 'strong_open':
          bold = true;
          break;
        case 'strong_close':
          bold = false;
          break;
        case 'em_open':
          italic = true;
          break;
        case 'em_close':
          italic = false;
          break;
        case 'softbreak':
        case 'hardbreak':
          push('\n');
          break;
        default:
          walk(ch.children);
          break;
      }
    }
  };
  walk(token.children);
  return runs;
}

/** runs → 纯文本（供渲染器简单场景/兜底） */
export function runsToText(runs: InlineRun[] | undefined, fallback: string): string {
  if (!runs || !runs.length) return fallback;
  return runs.map((r) => r.text).join('');
}

/** 提取 YAML 元数据头（--- ... ---），返回 { meta, body, yamlLine } */
function splitMeta(raw: string): { meta: string; body: string; yamlLine: number } {
  const lines = raw.split('\n');
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end > 0) return { meta: lines.slice(1, end).join('\n'), body: lines.slice(end + 1).join('\n'), yamlLine: 1 };
  }
  return { meta: '', body: raw, yamlLine: 1 };
}

/** 校验 YAML 头（结构层） */
function validateMeta(metaText: string, issues: ValidationIssue[]): { title?: string; format?: DocFormat; theme?: string; author?: string | null } {
  const out: { title?: string; format?: DocFormat; theme?: string; author?: string | null } = {};
  if (!metaText.trim()) {
    issues.push({ code: 'MD_META_MISSING', line: 1, message: '缺少 YAML 元数据头', fix: '文档必须以 --- 开头，包含 title 与 format 字段' });
    return out;
  }
  let parsed: unknown;
  try {
    parsed = YAML.parse(metaText);
  } catch (e) {
    issues.push({ code: 'MD_META_PARSE', line: 1, message: `YAML 头解析失败: ${(e as Error).message}`, fix: '检查 YAML 语法（冒号后空格、引号配对）' });
    return out;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    issues.push({ code: 'MD_META_NOT_OBJECT', line: 1, message: 'YAML 头必须是键值对', fix: '使用 title:/format:/theme: 字段' });
    return out;
  }
  const p = parsed as Record<string, unknown>;
  // 未知字段拒绝
  for (const k of Object.keys(p)) {
    if (!['title', 'format', 'theme', 'author'].includes(k)) {
      issues.push({ code: 'MD_META_UNKNOWN_FIELD', line: 1, message: `未知字段: ${k}`, fix: `仅允许 title/format/theme/author，删除 ${k}` });
    }
  }
  if (typeof p.title === 'string' && p.title.trim()) {
    if (p.title.length > 80) issues.push({ code: 'MD_TITLE_TOO_LONG', line: 1, message: `标题过长(${p.title.length}字)`, fix: '标题控制在 80 字以内' });
    else out.title = p.title.trim();
  } else {
    issues.push({ code: 'MD_EMPTY_TITLE', line: 1, message: '缺少 title 字段', fix: '在 YAML 头添加 title: 文档标题' });
  }
  if (typeof p.format === 'string' && FORMATS.includes(p.format as DocFormat)) {
    out.format = p.format as DocFormat;
  } else {
    issues.push({ code: 'MD_BAD_FORMAT', line: 1, message: `format 必须是 ${FORMATS.join('/')}`, fix: `设置 format: ${FORMATS[0]}` });
  }
  if (p.theme !== undefined) {
    if (typeof p.theme === 'string' && (THEMES as readonly string[]).includes(p.theme)) out.theme = p.theme;
    else issues.push({ code: 'MD_BAD_THEME', line: 1, message: `theme 必须是 ${THEMES.join('/')}`, fix: `设置 theme: default 或删除该字段` });
  }
  if (p.author !== undefined) {
    if (typeof p.author === 'string' && p.author.length <= 50) out.author = p.author;
    else issues.push({ code: 'MD_BAD_AUTHOR', line: 1, message: 'author 必须是 ≤50 字的字符串', fix: '修正 author 字段' });
  }
  return out;
}

/** 安全校验（第三层）：HTML 剥离、URL 白名单、大小限制 */
function validateSafety(body: string, issues: ValidationIssue[]) {
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    issues.push({ code: 'MD_BODY_TOO_LARGE', line: 1, message: `正文超过 ${MAX_BODY_BYTES / 1024}KB`, fix: '精简内容后重试' });
  }
  const dangerousTags = /<(script|iframe|object|embed|link|meta|style)\b/i;
  if (dangerousTags.test(body)) {
    issues.push({ code: 'MD_DANGEROUS_HTML', line: 1, message: '正文包含危险 HTML 标签', fix: '删除 script/iframe 等标签，仅使用 Markdown 语法' });
  }
  const urlMatches = body.match(/\[[^\]]*\]\((https?:\/\/[^)\s]+|file:\/\/[^)\s]+|javascript:[^)\s]+)\)/g) ?? [];
  for (const m of urlMatches) {
    if (/file:\/\/|javascript:/i.test(m)) {
      issues.push({ code: 'MD_BAD_URL', line: 1, message: `非法链接协议: ${m.slice(0, 60)}`, fix: '仅允许 http/https 链接' });
      break;
    }
  }
}

/** markdown-it 表格 token 流：table_open/thead_open/tr_open/th_open|td_open/inline.../table_close */
interface TableParseState {
  headers: string[];
  rows: string[][];
  currentRow: string[] | null;
  currentCell: string | null;
  inHeader: boolean;
}

/** Markdown token → IR（同时做语法校验） */
function tokensToBlocks(body: string, issues: ValidationIssue[]): OfficeBlock[] {
  const blocks: OfficeBlock[] = [];
  const tokens = md.parse(body, {});
  let paragraphCount = 0;
  let currentParagraph: string | null = null;
  let currentParagraphRuns: InlineRun[] = [];
  let currentHeading: number | null = null;
  let headingText = '';
  let headingRuns: InlineRun[] = [];
  let listStack: { ordered: boolean; items: string[]; itemRuns: InlineRun[][]; current: string[]; currentRuns: InlineRun[] }[] = [];
  let inTable: TableParseState | null = null;

  const lineOf = (map: [number, number] | null): number => (map && map.length ? map[0] + 1 : 1);

  for (const t of tokens) {
    const map = t.map;

    if (t.type === 'fence' || t.type === 'code_block') {
      blocks.push({ type: 'code', lang: t.info?.split(/\s+/)[0] ?? null, code: t.content.trimEnd() });
      paragraphCount++;
      continue;
    }
    if (t.type === 'paragraph_open') {
      paragraphCount++;
      if (paragraphCount > MAX_PARAGRAPHS) {
        issues.push({ code: 'MD_TOO_MANY_PARAS', line: lineOf(map), message: `段落数超过 ${MAX_PARAGRAPHS}`, fix: '精简内容' });
        break;
      }
      currentParagraph = '';
      currentParagraphRuns = [];
      continue;
    }
    if (t.type === 'paragraph_close') {
      // 列表项/表格单元格内部也有 paragraph_open，但内容已由对应状态机收集
      if (currentParagraph !== null && listStack.length === 0 && !inTable) {
        const text = stripMdAndEmoji(currentParagraph).trim();
        if (text) blocks.push({ type: 'paragraph', text, runs: currentParagraphRuns.length ? currentParagraphRuns : undefined });
      }
      currentParagraph = null;
      currentParagraphRuns = [];
      continue;
    }
    if (t.type === 'heading_open') {
      const level = Number(t.tag.slice(1));
      if (level > MAX_HEADING_LEVEL) {
        issues.push({ code: 'MD_HEADING_DEPTH', line: lineOf(map), message: `标题层级 ${level} 超过 ${MAX_HEADING_LEVEL}`, fix: `将 ${'#'.repeat(level)} 降为 ${'#'.repeat(MAX_HEADING_LEVEL)} 以内` });
      }
      currentHeading = level;
      headingText = '';
      headingRuns = [];
      continue;
    }
    if (t.type === 'heading_close') {
      if (currentHeading !== null) {
        const text = stripMdAndEmoji(headingText).trim();
        if (text) blocks.push({ type: 'heading', level: currentHeading, text, runs: headingRuns.length ? headingRuns : undefined });
      }
      currentHeading = null;
      headingText = '';
      headingRuns = [];
      continue;
    }
    if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      if (listStack.length >= MAX_LIST_DEPTH) {
        issues.push({ code: 'MD_LIST_DEPTH', line: lineOf(map), message: `列表嵌套超过 ${MAX_LIST_DEPTH} 层`, fix: '减少列表嵌套层级' });
      }
      listStack.push({ ordered: t.type === 'ordered_list_open', items: [], itemRuns: [], current: [], currentRuns: [] });
      continue;
    }
    if (t.type === 'bullet_list_close' || t.type === 'ordered_list_close') {
      const top = listStack.pop();
      if (top && top.items.length) {
        blocks.push({ type: 'list', ordered: top.ordered, items: top.items, itemRuns: top.itemRuns.length ? top.itemRuns : undefined });
      }
      continue;
    }
    if (t.type === 'list_item_open') {
      if (listStack.length) {
        listStack[listStack.length - 1].current = [];
        listStack[listStack.length - 1].currentRuns = [];
      }
      continue;
    }
    if (t.type === 'list_item_close') {
      if (listStack.length) {
        const top = listStack[listStack.length - 1];
        const text = stripMdAndEmoji(top.current.join('\n')).trim();
        if (text) {
          top.items.push(text);
          top.itemRuns.push(top.currentRuns);
        }
        top.current = [];
        top.currentRuns = [];
      }
      continue;
    }
    if (t.type === 'table_open') {
      inTable = { headers: [], rows: [], currentRow: null, currentCell: null, inHeader: false };
      continue;
    }
    if (t.type === 'thead_open') {
      if (inTable) inTable.inHeader = true;
      continue;
    }
    if (t.type === 'thead_close') {
      if (inTable) inTable.inHeader = false;
      continue;
    }
    if (t.type === 'tr_open') {
      if (inTable) inTable.currentRow = [];
      continue;
    }
    if (t.type === 'tr_close') {
      if (inTable && inTable.currentRow) {
        if (inTable.inHeader) inTable.headers = inTable.currentRow;
        else inTable.rows.push(inTable.currentRow);
        inTable.currentRow = null;
      }
      continue;
    }
    if (t.type === 'th_open' || t.type === 'td_open') {
      if (inTable) inTable.currentCell = '';
      continue;
    }
    if (t.type === 'th_close' || t.type === 'td_close') {
      if (inTable && inTable.currentCell !== null) {
        const text = stripMdAndEmoji(inTable.currentCell).trim();
        if (text.length > MAX_CELL_CHARS) {
          issues.push({ code: 'MD_CELL_TOO_LONG', line: lineOf(map), message: `单元格内容超过 ${MAX_CELL_CHARS} 字`, fix: '精简单元格内容' });
        }
        if (inTable.currentRow) inTable.currentRow.push(text);
        inTable.currentCell = null;
      }
      continue;
    }
    if (t.type === 'table_close') {
      if (inTable) {
        if (inTable.headers.length && inTable.headers.length > MAX_TABLE_COLS) {
          issues.push({ code: 'MD_TABLE_COLS', line: lineOf(map), message: `表格列数 ${inTable.headers.length} 超过 ${MAX_TABLE_COLS}`, fix: '减少列数' });
        } else if (inTable.headers.length) {
          blocks.push({ type: 'table', headers: inTable.headers, rows: inTable.rows });
        }
        inTable = null;
      }
      continue;
    }
    if (t.type === 'inline') {
      const text = t.content.trim();
      if (!text) continue;
      const runs = inlineRuns(t);
      if (inTable && inTable.currentCell !== null) {
        inTable.currentCell += text;
        continue;
      }
      if (currentHeading !== null) {
        headingText += text;
        headingRuns.push(...runs);
        continue;
      }
      if (listStack.length) {
        listStack[listStack.length - 1].current.push(text);
        listStack[listStack.length - 1].currentRuns.push(...runs);
        continue;
      }
      if (currentParagraph !== null) {
        currentParagraph += (currentParagraph ? '\n' : '') + text;
        currentParagraphRuns.push(...runs);
      }
    }
  }
  return blocks;
}

/** 主入口：三层校验 → ParsedDoc | issues */
export function validateMarkdown(raw: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { meta, body, yamlLine } = splitMeta(raw);

  // 第一层：结构（YAML 头）
  const metaOut = validateMeta(meta, issues);

  // 第三层：安全（正文）
  validateSafety(body, issues);

  // 第二层：语法（markdown-it 解析 → IR）
  const blocks = tokensToBlocks(body, issues);

  if (issues.length) {
    return { valid: false, doc: null, issues: issues.map((i) => ({ ...i, line: i.line || yamlLine })) };
  }
  return {
    valid: true,
    doc: {
      title: metaOut.title ?? '未命名文档',
      format: metaOut.format ?? 'docx',
      theme: metaOut.theme ?? 'default',
      author: metaOut.author ?? null,
      blocks,
      raw,
    },
    issues: [],
  };
}

/** 供渲染器/测试使用的主题色表 */
export const THEME_COLORS: Record<string, { primary: string; secondary: string; accent: string }> = {
  default: { primary: '#2f6f4f', secondary: '#5a8f74', accent: '#e8a33d' },
  forest: { primary: '#1e512e', secondary: '#4e9f3d', accent: '#d8e9a8' },
  ocean: { primary: '#1c4e80', secondary: '#4a90c2', accent: '#7fd1c8' },
  sunset: { primary: '#b0413e', secondary: '#e07a5f', accent: '#f2cc8f' },
  ink: { primary: '#2c2c2c', secondary: '#595959', accent: '#c9a227' },
  kids: { primary: '#5e8c61', secondary: '#f2a541', accent: '#e86a92' },
};

/** 行内文本片段（markdown-it children 解析结果：样式已提取，符号已剥离） */
export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

/** 统一中间表示（Markdown 解析后的文档树，四种渲染器共享） */
export type OfficeBlock =
  | { type: 'heading'; level: number; text: string; runs?: InlineRun[] }
  | { type: 'paragraph'; text: string; runs?: InlineRun[] }
  | { type: 'list'; ordered: boolean; items: string[]; itemRuns?: InlineRun[][] }
  | { type: 'table'; headers: string[]; rows: string[][]; headerRuns?: InlineRun[][]; rowRuns?: InlineRun[][][] }
  | { type: 'code'; lang: string | null; code: string };

export interface ParsedDoc {
  title: string;
  format: 'docx' | 'pptx' | 'pdf' | 'xlsx';
  theme: string;
  author: string | null;
  blocks: OfficeBlock[];
  /** 原始 markdown（落盘/调试用） */
  raw: string;
}

export type DocFormat = ParsedDoc['format'];

/** 校验错误（带行号与修复建议，供 Agent 自愈重试） */
export interface ValidationIssue {
  code: string;
  line: number;
  message: string;
  fix: string;
}

export interface ValidationResult {
  valid: boolean;
  doc: ParsedDoc | null;
  issues: ValidationIssue[];
}

/** 渲染器接口：IR → Buffer（渲染器不关心文件存储） */
export interface DocumentRenderer {
  readonly format: DocFormat;
  render(doc: ParsedDoc): Promise<Buffer>;
}

/** 生成请求（工具入参） */
export interface GenerateDocumentInput {
  format: DocFormat;
  title?: string;
  content_md: string;
  theme?: string;
  author?: string;
}

declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: Record<string, unknown>;
    version: string;
  }
  function pdfParse(data: Buffer, options?: unknown): Promise<PdfParseResult>;
  export = pdfParse;
}

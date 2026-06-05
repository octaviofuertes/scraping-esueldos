declare module 'pdf-parse' {
  type PdfParseResult = {
    text: string;
    numpages?: number;
    info?: unknown;
    metadata?: unknown;
    version?: string;
  };

  const pdfParse: (buffer: Buffer) => Promise<PdfParseResult>;
  export = pdfParse;
}

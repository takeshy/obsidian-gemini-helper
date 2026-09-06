// PDF reading lives in the shared library so every plugin extracts the same text,
// with the same page labels, caching and page-range support.
export {
  extractPdfPages,
  extractPdfText,
  extractPdfTextWithOffsets,
  formatExtractedPdfText,
  computePdfPageLabel,
  readPdfAttachment,
  MAX_EXTRACTED_PDF_CHARS,
  MAX_NATIVE_PDF_BYTES,
  type PdfPages,
  type PdfExtractResult,
  type PdfAttachment,
} from "obsidian-llm-hub-common/vault";

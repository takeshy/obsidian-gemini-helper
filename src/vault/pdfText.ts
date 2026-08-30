import { TFile, loadPdfJs, type App } from "obsidian";

interface PdfJsTextItem {
  str?: unknown;
  hasEOL?: unknown;
}

interface PdfJsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<{ getTextContent(): Promise<{ items: PdfJsTextItem[] }> }>;
  destroy?(): Promise<void>;
}

interface PdfJsLib {
  getDocument(source: { data: ArrayBuffer }): { promise: Promise<PdfJsDocument> };
}

/** Join a page's text items, honouring PDF.js end-of-line markers so lists and tables survive. */
function joinTextItems(items: PdfJsTextItem[]): string {
  let text = "";
  for (const item of items) {
    if (typeof item.str === "string") text += item.str;
    text += item.hasEOL === true ? "\n" : " ";
  }
  return text.replace(/[ \t]+\n/g, "\n").trim();
}

/**
 * Extract the text layer from a vault PDF using Obsidian's bundled PDF.js.
 * Returns null when the PDF has no text layer (e.g. a scan) or could not be read;
 * failures are logged so a password-protected or corrupt file stays diagnosable.
 */
export async function extractPdfText(app: App, file: TFile): Promise<string | null> {
  let pdf: PdfJsDocument | null = null;
  try {
    const buffer = await app.vault.readBinary(file);
    const pdfJs = await loadPdfJs() as PdfJsLib;
    pdf = await pdfJs.getDocument({ data: buffer }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = joinTextItems(content.items);
      if (text) pages.push(`[Page ${pageNumber}]\n${text}`);
    }
    return pages.length > 0 ? pages.join("\n\n") : null;
  } catch (error) {
    console.error(`[gemini-helper] Failed to extract text from PDF "${file.path}"`, error);
    return null;
  } finally {
    // PDF.js keeps the parsed document alive in its worker until it is destroyed.
    try {
      await pdf?.destroy?.();
    } catch (error) {
      console.error(`[gemini-helper] Failed to release PDF "${file.path}"`, error);
    }
  }
}

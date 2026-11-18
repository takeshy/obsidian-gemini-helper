interface MacClipboard {
  availableFormats(): string[];
  readImage(): { isEmpty(): boolean; toPNG(): Uint8Array<ArrayBuffer> };
}

// Some macOS apps put a native bitmap (often TIFF) on the pasteboard without
// exposing a File to the textarea. Electron can decode it directly to PNG.
export function readMacClipboardImage(): File | null {
  try {
    const electron = (window as { require?: (id: string) => { clipboard?: MacClipboard } }).require?.("electron");
    const clipboard = electron?.clipboard;
    if (!clipboard?.readImage) return null;
    const formats = clipboard.availableFormats();
    // Preserve text, copied files and their original encodings in the DOM paste event.
    const bitmapFormats = ["image/png", "image/tiff", "public.png", "public.tiff", "NSTIFFPboardType"];
    if (formats.length && !formats.every(format => bitmapFormats.includes(format))) return null;
    const image = clipboard.readImage();
    if (image.isEmpty()) return null;
    return new File([image.toPNG()], "clipboard.png", { type: "image/png" });
  } catch {
    // Fall through to normal paste if the native clipboard is unavailable.
    return null;
  }
}

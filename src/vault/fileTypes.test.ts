import { describe, expect, it } from "vitest";
import { TFile } from "obsidian";
import {
  ensureMarkdownExtensionIfMissing,
  isMarkdownPath,
  isVaultTextFile,
  normalizeLookupTerm,
  splitFileName,
} from "./fileTypes";

function makeFile(path: string): TFile {
  const file = new TFile();
  const name = path.split("/").pop() ?? path;
  const lastDot = name.lastIndexOf(".");
  file.path = path;
  file.name = name;
  file.basename = lastDot > 0 ? name.slice(0, lastDot) : name;
  file.extension = lastDot > 0 ? name.slice(lastDot + 1) : "";
  return file;
}

describe("fileTypes", () => {
  it("recognizes text-based vault file extensions", () => {
    expect(isVaultTextFile(makeFile("Board.canvas"))).toBe(true);
    expect(isVaultTextFile(makeFile("View.base"))).toBe(true);
    expect(isVaultTextFile(makeFile("Data.json"))).toBe(true);
    expect(isVaultTextFile(makeFile("Image.png"))).toBe(false);
  });

  it("adds .md only when the path has no explicit extension", () => {
    expect(ensureMarkdownExtensionIfMissing("Daily")).toBe("Daily.md");
    expect(ensureMarkdownExtensionIfMissing("Board.canvas")).toBe("Board.canvas");
  });

  it("checks markdown paths by extension", () => {
    expect(isMarkdownPath("Daily.md")).toBe(true);
    expect(isMarkdownPath("Board.canvas")).toBe(false);
  });

  it("splits file names without losing non-markdown extensions", () => {
    expect(splitFileName("Board.canvas")).toEqual({ stem: "Board", extension: ".canvas" });
    expect(splitFileName("Daily")).toEqual({ stem: "Daily", extension: "" });
  });

  it("normalizes known text extensions for lookup", () => {
    expect(normalizeLookupTerm("Folder/Board.canvas")).toBe("folder/board");
    expect(normalizeLookupTerm("Folder/Image.png")).toBe("folder/image.png");
  });
});

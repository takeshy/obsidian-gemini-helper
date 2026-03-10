import { describe, it, expect } from "vitest";
import { normalizeYamlText } from "./parser";

describe("normalizeYamlText", () => {
  describe("list marker conversion", () => {
    it("converts * list markers to - when followed by YAML key", () => {
      const input = `name: test
nodes:

* id: step1
  type: command

* id: step2
  type: dialog`;

      const result = normalizeYamlText(input);
      expect(result).toContain("- id: step1");
      expect(result).toContain("- id: step2");
      expect(result).not.toContain("* id:");
    });

    it("converts indented * list markers with YAML keys", () => {
      const input = `items:
  * name: a
  * name: b`;

      const result = normalizeYamlText(input);
      expect(result).toContain("  - name: a");
      expect(result).toContain("  - name: b");
    });

    it("does not convert * for non-YAML content (Markdown bullets)", () => {
      const input = `* A clear title
* Section headings
* Output Markdown only`;

      const result = normalizeYamlText(input);
      expect(result).toContain("* A clear title");
      expect(result).toContain("* Section headings");
      expect(result).toContain("* Output Markdown only");
    });

    it("does not convert * inside quoted strings", () => {
      const input = `message: "use * for emphasis"`;
      const result = normalizeYamlText(input);
      expect(result).toBe(input);
    });
  });

  describe("block scalar indentation fix", () => {
    it("fixes block scalar content at same indent as key", () => {
      const input = `- id: step1
  type: command
  prompt: |
  This is content
  that needs indentation
  saveTo: result`;

      const result = normalizeYamlText(input);
      expect(result).toContain("    This is content");
      expect(result).toContain("    that needs indentation");
      expect(result).toContain("  saveTo: result");
    });

    it("preserves blank lines within block scalar content", () => {
      const input = `- id: step1
  prompt: |
  First paragraph.

  Second paragraph.
  saveTo: result`;

      const result = normalizeYamlText(input);
      expect(result).toContain("    First paragraph.");
      expect(result).toContain("    Second paragraph.");
      // Blank line preserved
      const lines = result.split("\n");
      const firstIdx = lines.findIndex((l) => l.includes("First paragraph."));
      expect(lines[firstIdx + 1].trim()).toBe("");
    });

    it("does not re-indent already properly indented block scalars", () => {
      const input = `- id: step1
  prompt: |
    This is already properly indented
    No changes needed
  saveTo: result`;

      const result = normalizeYamlText(input);
      expect(result).toBe(input);
    });

    it("identifies trailing YAML properties via backwards scan", () => {
      const input = `- id: step1
  prompt: |
  Create something.
  saveTo: result
  comment: "done"`;

      const result = normalizeYamlText(input);
      expect(result).toContain("    Create something.");
      expect(result).toContain("  saveTo: result");
      expect(result).toContain('  comment: "done"');
    });

    it("does not treat uppercase words with colon as end of block scalar", () => {
      const input = `- id: step1
  prompt: |
  Requirements:
  Summary:
  More text here
  saveTo: result`;

      const result = normalizeYamlText(input);
      expect(result).toContain("    Requirements:");
      expect(result).toContain("    Summary:");
      expect(result).toContain("    More text here");
      expect(result).toContain("  saveTo: result");
    });

    it("does not treat multi-word keys as end of block scalar", () => {
      const input = `- id: step1
  prompt: |
  Some Content:
  Text Content:
  More text here
  saveTo: result`;

      const result = normalizeYamlText(input);
      expect(result).toContain("    Some Content:");
      expect(result).toContain("    Text Content:");
      expect(result).toContain("    More text here");
      expect(result).toContain("  saveTo: result");
    });

    it("stops re-indentation at new list item at lower indent", () => {
      const input = `- id: step1
  prompt: |
  Content here
- id: step2
  type: dialog`;

      const result = normalizeYamlText(input);
      expect(result).toContain("    Content here");
      expect(result).toContain("- id: step2");
    });

    it("does not break on Markdown * bullets inside block scalar", () => {
      const input = `- id: step1
  prompt: |
  Use the following:
  * Item one
  * Item two
  saveTo: result`;

      const result = normalizeYamlText(input);
      expect(result).toContain("    Use the following:");
      expect(result).toContain("    * Item one");
      expect(result).toContain("    * Item two");
      expect(result).toContain("  saveTo: result");
    });

    it("handles folded block scalar (>)", () => {
      const input = `- id: step1
  prompt: >
  Folded content
  continues here
  saveTo: result`;

      const result = normalizeYamlText(input);
      expect(result).toContain("    Folded content");
      expect(result).toContain("    continues here");
      expect(result).toContain("  saveTo: result");
    });

    it("handles block scalar with chomping indicator (|+, |-)", () => {
      const input = `- id: step1
  prompt: |+
  Keep trailing newlines
  saveTo: result`;

      const result = normalizeYamlText(input);
      expect(result).toContain("    Keep trailing newlines");
      expect(result).toContain("  saveTo: result");
    });

    it("does not break on JS object keys inside code block scalar", () => {
      const input = `- id: compute-report
  type: script
  code: |
  var today = new Date();
  return {
  monday: formatYMD(targetMonday),
  friday: formatYMD(targetFriday),
  reportTitle: 'Weekly Report',
  weekNumber: weekNumber
  };
  saveTo: reportMeta
  timeout: "10000"`;

      const result = normalizeYamlText(input);
      // JS code lines should be re-indented (not treated as YAML keys)
      expect(result).toContain("    var today = new Date();");
      expect(result).toContain("    return {");
      expect(result).toContain("    monday: formatYMD(targetMonday),");
      expect(result).toContain("    friday: formatYMD(targetFriday),");
      expect(result).toContain("    reportTitle: 'Weekly Report',");
      expect(result).toContain("    weekNumber: weekNumber");
      expect(result).toContain("    };");
      // Sibling YAML keys preserved at original indent
      expect(result).toContain("  saveTo: reportMeta");
      expect(result).toContain('  timeout: "10000"');
    });

    it("handles JS object with keys matching YAML whitelist (notes, name, path)", () => {
      const input = `- id: filter-notes
  type: script
  code: |
  var result = [];
  for (var i = 0; i < files.length; i++) {
  var note = files[i];
  var fullPath = note.path || '';
  var fileName = fullPath.split('/').pop();
  if (fileName >= monday) {
  result.push({
  path: fullPath,
  name: fileName
  });
  }
  }
  return {
  notes: result,
  count: result.length
  };
  saveTo: targetNotes
  timeout: "10000"

- id: next-step
  type: variable
  name: idx
  value: "0"`;

      const result = normalizeYamlText(input);
      // All JS code lines re-indented (notes, name, path are in whitelist but inside JS)
      expect(result).toContain("    var result = [];");
      expect(result).toContain("    result.push({");
      expect(result).toContain("    path: fullPath,");
      expect(result).toContain("    name: fileName");
      expect(result).toContain("    });");
      expect(result).toContain("    return {");
      expect(result).toContain("    notes: result,");
      expect(result).toContain("    count: result.length");
      expect(result).toContain("    };");
      // Trailing YAML properties at original indent
      expect(result).toContain("  saveTo: targetNotes");
      expect(result).toContain('  timeout: "10000"');
      // Next node unaffected
      expect(result).toContain("- id: next-step");
      expect(result).toContain('  value: "0"');
    });

    it("handles multiple block scalars in sequence across nodes", () => {
      const input = `* id: step1
  type: script
  code: |
  var x = { name: 'test', value: 42 };
  return x;
  saveTo: result1

* id: step2
  type: command
  prompt: |
  Analyze this:
  {{result1}}
  saveTo: result2`;

      const result = normalizeYamlText(input);
      // First code block
      expect(result).toContain("    var x = { name: 'test', value: 42 };");
      expect(result).toContain("    return x;");
      expect(result).toContain("  saveTo: result1");
      // Second prompt block
      expect(result).toContain("    Analyze this:");
      expect(result).toContain("    {{result1}}");
      expect(result).toContain("  saveTo: result2");
    });

    it("handles the full infographic workflow with * bullets in prompt", () => {
      const input = `name: infographic-markdown
nodes:

* id: read-current-file
  type: prompt-file
  saveTo: content
  saveFileTo: fileInfo

* id: generate-markdown-infographic
  type: command
  prompt: |
  Convert the following note using:

  * A clear title
  * Section headings
  * Bullet lists

  Requirements:

  * Output Markdown only
  * Preserve the meaning

  Source content:
  {{content}}
  saveTo: markdownInfographic

* id: save-markdown-note
  type: note
  path: "{{fileInfo.name}}-infographic"
  content: "{{markdownInfographic}}"

* id: done
  type: dialog
  title: Done
  message: "Saved"`;

      const result = normalizeYamlText(input);

      // Top-level * converted to - (YAML key pattern)
      expect(result).toContain("- id: read-current-file");
      expect(result).toContain("- id: generate-markdown-infographic");
      expect(result).toContain("- id: save-markdown-note");
      expect(result).toContain("- id: done");

      // Block scalar content re-indented, * bullets preserved
      expect(result).toContain("    Convert the following note using:");
      expect(result).toContain("    * A clear title");
      expect(result).toContain("    * Section headings");
      expect(result).toContain("    Requirements:");
      expect(result).toContain("    * Output Markdown only");
      expect(result).toContain("    Source content:");
      expect(result).toContain("    {{content}}");

      // Property after block scalar preserved at original indent
      expect(result).toContain("  saveTo: markdownInfographic");

      // Other nodes unaffected
      expect(result).toContain('  path: "{{fileInfo.name}}-infographic"');
      expect(result).toContain("  title: Done");
    });
  });
});

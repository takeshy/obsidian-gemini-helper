// Minimal obsidian mock for unit tests
export class App {}
export class TFile {
  path = "";
  name = "";
  extension = "";
  basename = "";
}
export class TFolder {
  path = "";
  name = "";
}
export function requestUrl(_options: unknown): Promise<unknown> {
  throw new Error("requestUrl is not available in tests");
}
export function parseYaml(_text: string): unknown {
  throw new Error("parseYaml is not available in tests");
}
export function stringifyYaml(_obj: unknown): string {
  throw new Error("stringifyYaml is not available in tests");
}

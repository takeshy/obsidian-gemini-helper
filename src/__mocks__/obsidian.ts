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
export function normalizePath(path: string): string {
  return path.split("/").filter(Boolean).join("/");
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

// Classes the shared modals extend or construct. They only need to exist for imports to resolve;
// tests that exercise a modal's behavior stub what they need.
export class Component {
  load(): void {}
  unload(): void {}
}
export class Modal {
  app: App;
  contentEl = { empty() {}, createDiv() { return {}; }, createEl() { return {}; }, addClass() {} } as unknown as HTMLElement;
  modalEl = { addClass() {}, appendChild() {} } as unknown as HTMLElement;
  containerEl = { addClass() {} } as unknown as HTMLElement;
  constructor(app: App) {
    this.app = app;
  }
  open(): void {}
  close(): void {}
}
export class FuzzySuggestModal<T> extends Modal {
  getItems(): T[] { return []; }
  getItemText(_item: T): string { return ""; }
  onChooseItem(_item: T): void {}
}
export class Setting {
  settingEl = { createDiv() { return {}; } } as unknown as HTMLElement;
  setName(): this { return this; }
  setDesc(): this { return this; }
  addText(): this { return this; }
  addDropdown(): this { return this; }
  addToggle(): this { return this; }
  addButton(): this { return this; }
}
export class Notice {
  constructor(_message: string, _timeout?: number) {}
}
export class Menu {
  addItem(): this { return this; }
  showAtMouseEvent(): void {}
}
export const MarkdownRenderer = {
  render(): Promise<void> { return Promise.resolve(); },
};
export function setIcon(_el: unknown, _icon: string): void {}
export const Platform = { isMobile: false, isDesktop: true };

// The shared CryptView extends this; tests only need the class to exist.
export class ItemView extends Component {
  leaf: unknown;
  contentEl = { empty() {}, addClass() {}, createDiv() { return {}; } } as unknown as HTMLElement;
  constructor(leaf: unknown) {
    super();
    this.leaf = leaf;
  }
}
export class TextFileView extends ItemView {
  data = "";
  requestSave(): void {}
}

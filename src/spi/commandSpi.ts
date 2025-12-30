import { MarkdownView } from "obsidian";
import type { GeminiHelperPlugin } from "src/plugin";
import {
  type CommandInfo,
  type CommandExecutionContext,
  type CommandExecutionResult,
  type ModelType,
  DEFAULT_MODEL,
  isModelAllowedForPlan,
} from "src/types";

/**
 * CommandSpi - スラッシュコマンドの外部連携用SPI
 *
 * 外部プラグインから以下のようにアクセス可能:
 * ```typescript
 * const geminiPlugin = app.plugins.plugins['gemini-helper'] as GeminiHelperPlugin;
 * const commands = geminiPlugin.commandSpi.listCommands();
 * const result = await geminiPlugin.commandSpi.prepareCommand('translate', {
 *   selection: '翻訳したいテキスト',
 * });
 * console.log(result.resolvedPrompt);
 * ```
 */
export class CommandSpi {
  constructor(private plugin: GeminiHelperPlugin) {}

  /**
   * 全コマンドの一覧を取得
   */
  listCommands(): CommandInfo[] {
    return this.plugin.settings.slashCommands.map((cmd) => ({
      id: cmd.id,
      name: cmd.name,
      promptTemplate: cmd.promptTemplate,
      description: cmd.description,
      model: cmd.model,
      searchSetting: cmd.searchSetting,
    }));
  }

  /**
   * IDでコマンドを取得
   */
  getCommand(id: string): CommandInfo | null {
    const cmd = this.plugin.settings.slashCommands.find((c) => c.id === id);
    if (!cmd) return null;
    return {
      id: cmd.id,
      name: cmd.name,
      promptTemplate: cmd.promptTemplate,
      description: cmd.description,
      model: cmd.model,
      searchSetting: cmd.searchSetting,
    };
  }

  /**
   * 名前でコマンドを取得
   */
  getCommandByName(name: string): CommandInfo | null {
    const cmd = this.plugin.settings.slashCommands.find((c) => c.name === name);
    if (!cmd) return null;
    return {
      id: cmd.id,
      name: cmd.name,
      promptTemplate: cmd.promptTemplate,
      description: cmd.description,
      model: cmd.model,
      searchSetting: cmd.searchSetting,
    };
  }

  /**
   * プロンプトテンプレートの変数を解決
   *
   * @param template - テンプレート文字列 (例: "{selection}を英語に翻訳して")
   * @param context - 実行コンテキスト（{content}や{selection}の値を指定可能）
   * @returns 変数解決後のプロンプト
   */
  async resolvePrompt(
    template: string,
    context: CommandExecutionContext = {}
  ): Promise<string> {
    let result = template;

    // Resolve {content}
    if (result.includes("{content}")) {
      let contentText: string;

      if (context.content !== undefined) {
        // 外部から指定された場合はそのまま使用
        contentText = context.content;
      } else {
        // アクティブノートから取得
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (activeFile) {
          const content = await this.plugin.app.vault.read(activeFile);
          contentText = `From "${activeFile.path}":\n${content}`;
        } else {
          contentText = "[No active note]";
        }
      }

      result = result.replace(/\{content\}/g, contentText);
    }

    // Resolve {selection}
    if (result.includes("{selection}")) {
      let selectionText: string;

      if (context.selection !== undefined) {
        // 外部から指定された場合
        if (context.selectionLocation) {
          // 位置情報がある場合は引用形式で
          const loc = context.selectionLocation;
          const lineInfo =
            loc.startLine === loc.endLine
              ? `Line ${loc.startLine}`
              : `Lines ${loc.startLine}-${loc.endLine}`;
          const quotedSelection = context.selection
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
          selectionText = `From "${loc.filePath}" (${lineInfo}):\n${quotedSelection}`;
        } else {
          // 位置情報がない場合はそのまま使用
          selectionText = context.selection;
        }
      } else {
        // Obsidianから選択範囲を取得
        let selection = "";
        let locationInfo: {
          filePath: string;
          startLine: number;
          endLine: number;
        } | null = null;

        // まずアクティブビューから取得を試みる
        const activeView =
          this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          const editor = activeView.editor;
          selection = editor.getSelection();
          if (selection && activeView.file) {
            const fromPos = editor.getCursor("from");
            const toPos = editor.getCursor("to");
            locationInfo = {
              filePath: activeView.file.path,
              startLine: fromPos.line + 1,
              endLine: toPos.line + 1,
            };
          }
        }

        // フォールバック: キャッシュされた選択範囲を使用
        if (!selection) {
          selection = this.plugin.getLastSelection();
          locationInfo = this.plugin.getSelectionLocation();
          // 使用後にクリア
          this.plugin.clearLastSelection();
        }

        // 選択テキストを構築
        if (selection && locationInfo) {
          const lineInfo =
            locationInfo.startLine === locationInfo.endLine
              ? `Line ${locationInfo.startLine}`
              : `Lines ${locationInfo.startLine}-${locationInfo.endLine}`;
          const quotedSelection = selection
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
          selectionText = `From "${locationInfo.filePath}" (${lineInfo}):\n${quotedSelection}`;
        } else {
          // 選択がない場合はアクティブノートの内容にフォールバック
          const activeFile = this.plugin.app.workspace.getActiveFile();
          if (activeFile) {
            const content = await this.plugin.app.vault.read(activeFile);
            selectionText = `From "${activeFile.path}":\n${content}`;
          } else {
            selectionText = "[No selection or active note]";
          }
        }
      }

      result = result.replace(/\{selection\}/g, selectionText);
    }

    return result;
  }

  /**
   * コマンドを準備（解決後のプロンプトとモデル・検索設定を返す）
   *
   * @param idOrName - コマンドIDまたは名前
   * @param context - 実行コンテキスト
   * @returns 解決後のプロンプト、モデル、検索設定
   * @throws コマンドが見つからない場合
   */
  async prepareCommand(
    idOrName: string,
    context: CommandExecutionContext = {}
  ): Promise<CommandExecutionResult> {
    // コマンドを検索（IDで検索後、名前でフォールバック）
    let command = this.getCommand(idOrName);
    if (!command) {
      command = this.getCommandByName(idOrName);
    }
    if (!command) {
      throw new Error(`Command not found: ${idOrName}`);
    }

    // プロンプトを解決
    const resolvedPrompt = await this.resolvePrompt(
      command.promptTemplate,
      context
    );

    // モデルを決定
    let model: ModelType;
    if (context.model) {
      // コンテキストで指定されたモデルを優先
      model = isModelAllowedForPlan(this.plugin.settings.apiPlan, context.model)
        ? context.model
        : DEFAULT_MODEL;
    } else if (
      command.model &&
      isModelAllowedForPlan(this.plugin.settings.apiPlan, command.model)
    ) {
      // コマンドのデフォルトモデル
      model = command.model;
    } else {
      // 現在選択中のモデル
      model = this.plugin.getSelectedModel();
    }

    // 検索設定を決定
    let searchSetting: string | null;
    if (context.searchSetting !== undefined) {
      // コンテキストで指定された設定を優先
      searchSetting = context.searchSetting;
    } else if (command.searchSetting !== undefined) {
      // コマンドのデフォルト設定
      searchSetting =
        command.searchSetting === "" ? null : command.searchSetting;
    } else {
      // 現在選択中の設定
      searchSetting = this.plugin.workspaceState.selectedRagSetting;
    }

    return {
      resolvedPrompt,
      model,
      searchSetting,
    };
  }
}

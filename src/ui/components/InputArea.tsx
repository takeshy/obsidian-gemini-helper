import { CollapsedInput } from "obsidian-llm-hub-common";
import ModelSelector from "./ModelSelector";
import { InputArea as SharedInputArea } from "obsidian-llm-hub-common";
import { Composer, Autocomplete, Attachments, VaultToolControl, EnabledMcpServers, InputButtons, SearchSelector, ModelRow, ModelDropdown } from "obsidian-llm-hub-common";
import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent, forwardRef, useImperativeHandle } from "react";
import { Eye } from "lucide-react";
import { Notice, Platform, type App } from "obsidian";
import { isImageGenerationModel, type ModelInfo, type ModelType, type Attachment, type SlashCommand, type McpServerConfig, type VaultToolMode, type ReasoningEffort } from "src/types";
import type { SkillMetadata } from "src/core/skillsLoader";
import type { OkfBundle } from "src/core/okfLoader";
import SkillSelector from "./SkillSelector";
import OkfSelector from "./OkfSelector";
import { t } from "src/i18n";
import { isCaretOnFirstLine, isCaretOnLastLine } from "./chat/chatUtils";
import {
  acceptedAttachmentTypes,
  detectComposerTrigger,
  fileToAttachment,
  isAttachmentRejection,
} from "obsidian-llm-hub-common/chat";
import type { VoiceChatSettings } from "obsidian-llm-hub-common/chat";

// Built-in command definition (not user-configurable)
interface BuiltInCommand {
  id: string;
  name: string;
  description: string;
  isBuiltIn: true;
}

interface InputAreaProps {
  onSend: (content: string, attachments?: Attachment[], skillPath?: string) => void | Promise<void>;
  onStop?: () => void;
  isLoading: boolean;
  model: ModelType;
  onModelChange: (model: ModelType) => void;
  availableModels: ModelInfo[];
  allowWebSearch: boolean;
  webSearchEnabled: boolean;
  onWebSearchChange: (enabled: boolean) => void;
  ragEnabled: boolean;
  ragSettings: string[];
  selectedRagSetting: string | null;
  onRagSettingChange: (setting: string | null) => void;
  vaultToolMode: VaultToolMode;
  onVaultToolModeChange: (mode: VaultToolMode) => void;
  vaultToolModeOnlyNone: boolean; // When true, only "none" option is available
  reasoningEffort: ReasoningEffort;
  reasoningEffortOptions: ReasoningEffort[]; // Empty when the model has no configurable thinking
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  mcpServers: McpServerConfig[]; // MCP server configurations
  onMcpServerToggle: (serverName: string, enabled: boolean) => void; // Per-server toggle handler
  okfBundles: OkfBundle[]; // Discovered OKF knowledge bundles (empty when OKF is off)
  activeOkfBundleIds: string[]; // Bundle ids active for this chat
  onToggleOkfBundle: (id: string) => void; // Toggle a bundle on/off for this chat
  onVaultToolMenuOpen?: () => void; // Called when the vault tool menu opens (refresh bundles)
  slashCommands: SlashCommand[];
  onSlashCommand: (command: SlashCommand) => string;
  availableSkills: SkillMetadata[];
  activeSkillPaths: string[];
  onToggleSkill: (folderPath: string) => void;
  onCompact?: () => void; // Built-in /compact command handler
  messageCount?: number; // Number of messages (to enable/disable /compact)
  isCompacting?: boolean; // Whether compact is in progress
  vaultFiles: string[];
  hasSelection: boolean;
  app: App;
  maxPreviousMessages: number;
  onMaxPreviousMessagesChange: (count: number) => void;
  inputHistory: string[];
  onInputHistoryAdd: (prompt: string) => void;
  voiceChatSettings: VoiceChatSettings;
  onAutoReadAloudChange: (enabled: boolean) => void;
}

export interface InputAreaHandle {
  setInputValue: (value: string) => void;
  getInputValue: () => string;
  focus: () => void;
}

// Mention candidates (special variables + vault files)
interface MentionItem {
  value: string;
  description: string;
  kind: "variable" | "mention" | "wikilink";
}

// 対応ファイル形式
/** Least restricted first: the Vault tool button reads as inactive only on the first. */
const VAULT_TOOL_MODES = [
  { id: "all" as VaultToolMode, label: t("input.vaultToolAll"), description: t("input.vaultToolAllDesc") },
  { id: "noSearch" as VaultToolMode, label: t("input.vaultToolNoSearch"), description: t("input.vaultToolNoSearchDesc") },
  { id: "readOnly" as VaultToolMode, label: t("input.vaultToolReadOnly"), description: t("input.vaultToolReadOnlyDesc") },
  { id: "none" as VaultToolMode, label: t("input.vaultToolNone"), description: t("input.vaultToolNoneDesc") },
];

const InputArea = forwardRef<InputAreaHandle, InputAreaProps>(function InputArea({
  onSend,
  onStop,
  isLoading,
  model,
  onModelChange,
  availableModels,
  allowWebSearch,
  webSearchEnabled,
  onWebSearchChange,
  ragEnabled,
  ragSettings,
  selectedRagSetting,
  onRagSettingChange,
  vaultToolMode,
  onVaultToolModeChange,
  vaultToolModeOnlyNone,
  reasoningEffort,
  reasoningEffortOptions,
  onReasoningEffortChange,
  mcpServers,
  onMcpServerToggle,
  okfBundles,
  activeOkfBundleIds,
  onToggleOkfBundle,
  onVaultToolMenuOpen,
  slashCommands,
  onSlashCommand,
  availableSkills,
  activeSkillPaths,
  onToggleSkill,
  onCompact,
  messageCount = 0,
  isCompacting = false,
  vaultFiles,
  hasSelection,
  app,
  maxPreviousMessages,
  onMaxPreviousMessagesChange,
  inputHistory,
  onInputHistoryAdd,
  voiceChatSettings,
  onAutoReadAloudChange,
}, ref) {
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [filteredCommands, setFilteredCommands] = useState<(SlashCommand | BuiltInCommand)[]>([]);
  // Mention autocomplete state
  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [filteredMentions, setFilteredMentions] = useState<MentionItem[]>([]);
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const [showVaultToolMenu, setShowVaultToolMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionAutocompleteRef = useRef<HTMLDivElement>(null);
  const vaultToolMenuRef = useRef<HTMLDivElement>(null);
  const historyIndexRef = useRef<number | null>(null);
  const historyDraftRef = useRef("");

  // Scroll to selected mention item
  useEffect(() => {
    if (showMentionAutocomplete && mentionAutocompleteRef.current) {
      const container = mentionAutocompleteRef.current;
      const activeItem = container.children[mentionIndex] as HTMLElement;
      if (activeItem) {
        activeItem.scrollIntoView({ block: "nearest" });
      }
    }
  }, [mentionIndex, showMentionAutocomplete]);

  // Close vault tool menu when clicking outside
  useEffect(() => {
    if (!showVaultToolMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (vaultToolMenuRef.current && !vaultToolMenuRef.current.contains(e.target as Node)) {
        setShowVaultToolMenu(false);
      }
    };
    activeDocument.addEventListener("mousedown", handleClickOutside);
    return () => activeDocument.removeEventListener("mousedown", handleClickOutside);
  }, [showVaultToolMenu]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    setInputValue: (value: string) => {
      setInput(value);
      historyIndexRef.current = null;
      historyDraftRef.current = "";
    },
    getInputValue: () => input,
    focus: () => textareaRef.current?.focus(),
  }));

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Use Obsidian's setCssProps for dynamic height adjustment
      textarea.setCssProps({ height: "auto" });
      const height = `${Math.min(textarea.scrollHeight, 200)}px`;
      textarea.setCssProps({ height });
    }
  }, [input]);

  // Build mention candidates
  const buildMentionCandidates = (query: string): MentionItem[] => {
    const hasActiveNote = !!app.workspace.getActiveFile();
    const variables: MentionItem[] = [
      // Only show {selection} if there's an active selection
      ...(hasSelection ? [{ value: "{selection}", description: t("input.selectionVariable"), kind: "variable" as const }] : []),
      // Only show {content} if there's an active note
      ...(hasActiveNote ? [{ value: "{content}", description: t("input.contentVariable"), kind: "variable" as const }] : []),
    ];
    const files: MentionItem[] = vaultFiles.map((f) => ({
      value: f,
      description: t("input.vaultFile"),
      kind: "mention",
    }));
    const all = [...variables, ...files];
    if (!query) return all.slice(0, 10);
    const lowerQuery = query.toLowerCase();
    return all.filter((item) => item.value.toLowerCase().includes(lowerQuery)).slice(0, 10);
  };

  const buildWikilinkCandidates = (query: string): MentionItem[] => {
    const lowerQuery = query.toLowerCase();
    const files = vaultFiles
      .filter((file) => !lowerQuery || file.toLowerCase().includes(lowerQuery))
      .slice(0, 10)
      .map((file) => ({
        value: file,
        description: t("input.vaultFile"),
        kind: "wikilink" as const,
      }));
    return files;
  };

  const handleSubmit = () => {
    if ((input.trim() || pendingAttachments.length > 0) && !isLoading) {
      // Intercept /compact command
      if (input.trim() === "/compact" && onCompact) {
        if (messageCount >= 2) {
          setInput("");
          onCompact();
        }
        return;
      }
      // Intercept /skillFolder command — send with skill path as metadata
      if (input.trim().startsWith("/")) {
        const trimmed = input.trim();
        for (const skill of availableSkills) {
          const folderName = skill.folderPath.split("/").pop() || "";
          const prefix = `/${folderName}`;
          if (trimmed.toLowerCase().startsWith(prefix.toLowerCase()) &&
              (trimmed.length === prefix.length || trimmed[prefix.length] === " ")) {
            const userMessage = trimmed.slice(prefix.length).trim();
            onInputHistoryAdd(input);
            void onSend(userMessage, pendingAttachments.length > 0 ? pendingAttachments : undefined, skill.folderPath);
            setInput("");
            setPendingAttachments([]);
            historyIndexRef.current = null;
            historyDraftRef.current = "";
            return;
          }
        }
      }
      if (input.trim()) onInputHistoryAdd(input);
      void onSend(input, pendingAttachments.length > 0 ? pendingAttachments : undefined);
      setInput("");
      setPendingAttachments([]);
      historyIndexRef.current = null;
      historyDraftRef.current = "";
    }
  };

  const handleVoiceSubmit = (content: string) => {
    if (!content.trim() || isLoading) return;
    onInputHistoryAdd(content);
    void onSend(content, pendingAttachments.length > 0 ? pendingAttachments : undefined);
    setInput("");
    setPendingAttachments([]);
    historyIndexRef.current = null;
    historyDraftRef.current = "";
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInput(value);
    historyIndexRef.current = null;

    // Check for slash command trigger (only at start of input)
    if (value.startsWith("/")) {
      const query = value.slice(1).toLowerCase();

      // Build built-in commands list
      const builtInCommands: BuiltInCommand[] = [];
      if (onCompact && messageCount >= 2) {
        builtInCommands.push({
          id: "__compact__",
          name: "compact",
          description: t("command.compact"),
          isBuiltIn: true,
        });
      }

      // Add all skills as built-in commands (use folder name as command name)
      for (const skill of availableSkills) {
        const folderName = skill.folderPath.split("/").pop() || "";
        builtInCommands.push({
          id: `__skill__${skill.folderPath}`,
          name: folderName,
          description: `${skill.name}${skill.description ? ` - ${skill.description}` : ""}`,
          isBuiltIn: true,
        });
      }

      // Filter both user-defined and built-in commands
      const userMatches = slashCommands.filter((cmd) =>
        cmd.name.toLowerCase().startsWith(query)
      );
      const builtInMatches = builtInCommands.filter((cmd) =>
        cmd.name.toLowerCase().startsWith(query)
      );
      const matches: (SlashCommand | BuiltInCommand)[] = [...userMatches, ...builtInMatches];
      setFilteredCommands(matches);
      setShowAutocomplete(matches.length > 0);
      setAutocompleteIndex(0);
      setShowMentionAutocomplete(false);
      return;
    } else {
      setShowAutocomplete(false);
    }

    // Which menu the text calls for is decided in the shared library, so the
    // three plugins cannot disagree about when one opens.
    const trigger = detectComposerTrigger(value, cursorPos);
    if (trigger && trigger.kind !== "command") {
      const mentions = trigger.kind === "wikilink"
        ? buildWikilinkCandidates(trigger.query)
        : buildMentionCandidates(trigger.query);
      setFilteredMentions(mentions);
      setMentionStartPos(trigger.startPos);
      setShowMentionAutocomplete(mentions.length > 0);
      setMentionIndex(0);
      return;
    }
    setShowMentionAutocomplete(false);
  };

  const selectCommand = (command: SlashCommand | BuiltInCommand) => {
    setShowAutocomplete(false);
    if ("isBuiltIn" in command && command.isBuiltIn) {
      // Handle built-in commands
      if (command.id === "__compact__" && onCompact) {
        setInput("");
        onCompact();
      }
      // Handle skill — send immediately with skill path
      if (command.id.startsWith("__skill__")) {
        const folderPath = command.id.slice("__skill__".length);
        const userMessage = input.replace(/^\/\S*\s*/, "").trim();
        if (input.trim()) onInputHistoryAdd(input);
        void onSend(userMessage, pendingAttachments.length > 0 ? pendingAttachments : undefined, folderPath);
        setInput("");
        setPendingAttachments([]);
        historyIndexRef.current = null;
        historyDraftRef.current = "";
      }
      return;
    }
    const resolvedPrompt = onSlashCommand(command as SlashCommand);
    setInput(resolvedPrompt);
    textareaRef.current?.focus();
  };

  const selectMention = (mention: MentionItem) => {
    // Replace @query / [[query with the selected value
    const cursorPos = textareaRef.current?.selectionStart || input.length;
    const before = input.substring(0, mentionStartPos);
    const after = input.substring(cursorPos);
    const inserted = mention.kind === "wikilink" ? `[[${mention.value}]]` : `${mention.value} `;
    const newInput = before + inserted + after;
    setInput(newInput);
    setShowMentionAutocomplete(false);
    // Set cursor position after the inserted mention
    window.setTimeout(() => {
      const newPos = mentionStartPos + inserted.length;
      textareaRef.current?.setSelectionRange(newPos, newPos);
      textareaRef.current?.focus();
    }, 0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash command autocomplete
    if (showAutocomplete) {
      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        setAutocompleteIndex((prev) =>
          Math.min(prev + 1, filteredCommands.length - 1)
        );
        return;
      }
      if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        setAutocompleteIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" && !e.nativeEvent.isComposing && filteredCommands.length > 0) {
        e.preventDefault();
        selectCommand(filteredCommands[autocompleteIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowAutocomplete(false);
        return;
      }
    }

    // Mention autocomplete
    if (showMentionAutocomplete) {
      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        setMentionIndex((prev) =>
          Math.min(prev + 1, filteredMentions.length - 1)
        );
        return;
      }
      if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        setMentionIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      // Ctrl+Shift+O to preview (open) the selected file
      if (e.key === "O" && e.ctrlKey && e.shiftKey && filteredMentions.length > 0) {
        e.preventDefault();
        const mention = filteredMentions[mentionIndex];
        if (mention && mention.kind !== "variable") {
          void app.workspace.openLinkText(mention.value, "", true);
          // Return focus to textarea after opening
          window.setTimeout(() => textareaRef.current?.focus(), 100);
        }
        return;
      }
      if (e.key === "Enter" && !e.nativeEvent.isComposing && filteredMentions.length > 0) {
        e.preventDefault();
        selectMention(filteredMentions[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        setShowMentionAutocomplete(false);
        return;
      }
    }

    if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && inputHistory.length > 0
      && e.currentTarget.selectionStart === e.currentTarget.selectionEnd) {
      const caret = e.currentTarget.selectionStart;
      if (e.key === "ArrowUp" && isCaretOnFirstLine(input, caret)) {
        e.preventDefault();
        const nextIndex = historyIndexRef.current === null
          ? inputHistory.length - 1
          : Math.max(0, historyIndexRef.current - 1);
        if (historyIndexRef.current === null) historyDraftRef.current = input;
        historyIndexRef.current = nextIndex;
        setInput(inputHistory[nextIndex]);
        return;
      }
      if (e.key === "ArrowDown" && historyIndexRef.current !== null && isCaretOnLastLine(input, caret)) {
        e.preventDefault();
        const nextIndex = historyIndexRef.current + 1;
        if (nextIndex >= inputHistory.length) {
          historyIndexRef.current = null;
          setInput(historyDraftRef.current);
        } else {
          historyIndexRef.current = nextIndex;
          setInput(inputHistory[nextIndex]);
        }
        return;
      }
    }

    // IME変換中はEnterで送信しない
    // モバイルではEnterで送信しない（Shift+Enterが難しいため）
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !Platform.isMobile) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const attachment = await processFile(file);
      if (attachment) {
        setPendingAttachments(prev => [...prev, attachment]);
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const processFile = async (file: File): Promise<Attachment | null> => {
    const result = await fileToAttachment(file);
    if (isAttachmentRejection(result)) {
      if (result.reason === "too-large") new Notice(t("input.fileTooLarge", { name: file.name }));
      return null;
    }
    return result;
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const getAllAcceptedTypes = () => {
    return acceptedAttachmentTypes();
  };

  return (
    <SharedInputArea classPrefix="gemini-helper" modifiers={[isCollapsed && "collapsed"]} collapsed={isCollapsed}
      beforeInput={<>
      {/* MCP servers enabled for this chat */}
      {!isCollapsed && (
        <EnabledMcpServers
          classPrefix="gemini-helper"
          disabled={isLoading || vaultToolModeOnlyNone}
          onDisable={(id) => onMcpServerToggle(id, false)}
          servers={mcpServers.filter((server) => server.enabled).map((server) => ({
            id: server.name,
            name: server.name,
            title: t("input.mcpServerEnabled", { name: server.name }),
            removeTitle: t("input.mcpServerDisable", { name: server.name }),
          }))}
        />
      )}

      {/* Pending attachments display */}
      {!isCollapsed && pendingAttachments.length > 0 && (
        <Attachments classPrefix="gemini-helper" attachments={pendingAttachments} pending onRemove={removeAttachment} removeLabel={t("input.removeAttachment")} />
      )}

      </>}
      accessories={<>
          {/* Slash command autocomplete */}
          {showAutocomplete && (
          <Autocomplete classPrefix="gemini-helper"
            items={filteredCommands.map(cmd => ({ id: cmd.id, label: "id" in cmd && (cmd as BuiltInCommand).id?.startsWith("__skill__") ? `✨ /${cmd.name}` : `/${cmd.name}`, description: "description" in cmd ? cmd.description : undefined }))}
            activeIndex={autocompleteIndex} onSelect={index => selectCommand(filteredCommands[index])} onHover={setAutocompleteIndex} />
        )}

        {/* Mention autocomplete */}
        {showMentionAutocomplete && (
          <Autocomplete classPrefix="gemini-helper" containerRef={mentionAutocompleteRef}
            items={filteredMentions.map(mention => ({ id: mention.value, label: mention.kind === "wikilink" ? `[[${mention.value}]]` : mention.value, description: mention.description, action: mention.kind !== "variable" ? (<button
                    className="gemini-helper-preview-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      void app.workspace.openLinkText(mention.value, "", true);
                      window.setTimeout(() => textareaRef.current?.focus(), 100);
                    }}
                    title={t("input.openFile")}
                  >
                    <Eye size={12} />
                  </button>) : undefined }))}
            activeIndex={mentionIndex} onSelect={index => selectMention(filteredMentions[index])} onHover={setMentionIndex} />
        )}

        <InputButtons
          classPrefix="gemini-helper"
          attach={{
            title: t("input.attach"),
            accept: getAllAcceptedTypes(),
            inputRef: fileInputRef,
            disabled: isLoading,
            onOpenPicker: () => fileInputRef.current?.click(),
            onSelect: (event) => {
              void handleFileSelect(event);
            },
          }}
        >

          <VaultToolControl<VaultToolMode>
            classPrefix="gemini-helper"
            containerRef={vaultToolMenuRef}
            title={t("input.vaultToolTitle")}
            open={showVaultToolMenu}
            onToggle={setShowVaultToolMenu}
            onOpen={onVaultToolMenuOpen}
            disabled={isLoading || isImageGenerationModel(model)}
            modes={VAULT_TOOL_MODES}
            mode={vaultToolMode}
            onModeChange={onVaultToolModeChange}
            lockedTo={vaultToolModeOnlyNone ? "none" : undefined}
            mcp={{
              label: t("input.mcpServersLabel"),
              onToggle: onMcpServerToggle,
              servers: mcpServers.map((server) => {
                const toolCount = server.toolHints?.length || 0;
                return {
                  id: server.name,
                  name: server.name,
                  enabled: server.enabled,
                  hint: toolCount > 0
                    ? t("input.mcpToolHint", { count: String(toolCount), tools: server.toolHints?.slice(0, 3).join(", ") + (toolCount > 3 ? ", ..." : "") })
                    : "",
                  toolsTitle: server.toolHints?.join(", ") || "",
                };
              }),
            }}
            historyLimit={{
              label: t("input.historyLimit"),
              value: maxPreviousMessages,
              onChange: onMaxPreviousMessagesChange,
            }}
            autoReadAloud={{
              label: t("input.autoReadAloud"),
              enabled: voiceChatSettings.autoReadAloud,
              onChange: onAutoReadAloudChange,
            }}
          />
        </InputButtons>

        </>}
      composer={<Composer classPrefix="gemini-helper" textareaRef={textareaRef}
          textarea={{ value: input,
          onChange: handleInputChange,
          onKeyDown: handleKeyDown,
          placeholder: isCompacting ? t("chat.compacting") : (Platform.isMobile ? t("input.placeholderMobile") : t("input.placeholder")),
          disabled: isCompacting }}
          isLoading={isLoading} isCompacting={isCompacting} compactingLabel={t("chat.compacting")}
          canSend={!!input.trim() || pendingAttachments.length > 0}
          voiceSubmit={{
            enabled: voiceChatSettings.submitOnPaste && !isLoading,
            phrase: voiceChatSettings.submitPhrase,
            onSubmit: handleVoiceSubmit,
          }}
          onSend={handleSubmit} onStop={onStop}
          sendLabel={t("input.send")} stopLabel={t("input.stop")}
          collapse={Platform.isMobile ? { collapsed: isCollapsed, onToggle: () => setIsCollapsed(!isCollapsed), label: isCollapsed ? t("input.expand") : t("input.collapse") } : undefined}
        />}
      footer={<>

      {/* Collapsed state: show only expand button */}
      {isCollapsed && Platform.isMobile && (
        <CollapsedInput classPrefix="gemini-helper" label={t("input.expand")} onExpand={() => setIsCollapsed(false)} />
      )}

      {!isCollapsed && (
        <ModelRow classPrefix="gemini-helper">
          <ModelSelector models={availableModels} value={model} onChange={onModelChange} disabled={isLoading} />
          {reasoningEffortOptions.length > 0 && (
            <ModelDropdown
              classPrefix="gemini-helper"
              className="gemini-helper-effort-select"
              value={reasoningEffort}
              onChange={(value) => onReasoningEffortChange(value as ReasoningEffort)}
              disabled={isLoading}
              title={t("input.reasoningEffort")}
              options={reasoningEffortOptions.map((effort) => ({ value: effort, label: effort }))}
            />
          )}
          <SearchSelector
            classPrefix="gemini-helper"
            ownerDocument={activeDocument}
            disabled={isLoading}
            labels={{
              webSearch: t("input.webSearch"),
              rag: (name) => t("input.rag", { name }),
              ragNone: t("input.rag", { name: t("common.none") }),
              none: t("input.searchNone"),
            }}
            webSearch={{
              checked: webSearchEnabled,
              disabled: !allowWebSearch,
              // Gemini answers with grounding or with the vault index, never both.
              combinable: false,
            }}
            rag={{
              settings: ragSettings,
              selected: selectedRagSetting,
              disabled: !ragEnabled || isImageGenerationModel(model) || model.toLowerCase().includes("gemma-4"),
            }}
            onChange={(selection) => {
              onWebSearchChange(selection.webSearch);
              onRagSettingChange(selection.ragSetting);
            }}
          />
        </ModelRow>
      )}
      {!isCollapsed && availableSkills.length > 0 && (
        <SkillSelector
          skills={availableSkills}
          activeSkillPaths={activeSkillPaths}
          onToggleSkill={onToggleSkill}
          disabled={isLoading}
          app={app}
        />
      )}
      {!isCollapsed && okfBundles.length > 0 && (
        <OkfSelector
          bundles={okfBundles}
          activeBundleIds={activeOkfBundleIds}
          onToggleBundle={onToggleOkfBundle}
          disabled={isLoading}
        />
      )}
    </>}
    />
  );
});

export default InputArea;

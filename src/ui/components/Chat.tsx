import { Trash2 } from "lucide-react";
import { ChatHeader } from "obsidian-llm-hub-common";
import { ChatLayout, HistoryList, HeaderButton, SidebarWidthButton, SaveNoteButton } from "obsidian-llm-hub-common";
import {
	useState,
	useEffect,
	useRef,
	useImperativeHandle,
	forwardRef,
	useCallback,
	useMemo,
} from "react";
import { TFile, Notice, Platform } from "obsidian";
import { Plus, History, Lock } from "lucide-react";
import type { GeminiHelperPlugin } from "src/plugin";
import {
	getAvailableModels,
	isModelAllowedForPlan,
	getDefaultModelForPlan,
	type Message,
	type ModelType,
	type Attachment,
	type SlashCommand,
	type VaultToolNoneReason,
	type McpAppInfo,
	type KnowledgeSource,
	type ReasoningEffort,
	isImageGenerationModel,
	modelAcceptsPdf,
	DEFAULT_WORKSPACE_FOLDER,
} from "src/types";
import { getGeminiClient, getReasoningEffortOptions } from "src/core/gemini";
import { tracing } from "src/core/tracingHooks";
import { getEnabledVaultTools, getSlashCommandSearchSelection, isVaultToolAllowed } from "obsidian-llm-hub-common/core";
import { HOST_EXECUTES_RAG_SYNC_STATUS } from "src/vault/toolExecutor";
import { skillWorkflowTool } from "src/core/skillTools";
import { handleExecuteJavascriptTool, EXECUTE_JAVASCRIPT_TOOL } from "src/core/sandboxExecutor";
import { fetchMcpTools, createMcpToolExecutor, isMcpTool, type McpToolDefinition, type McpToolExecutor } from "src/core/mcpTools";
import { createToolExecutor } from "src/vault/toolExecutor";
import {
	applyEdit,
	discardEdit,
} from "src/vault/notes";
import MessageList from "./MessageList";
import InputArea, { type InputAreaHandle } from "./InputArea";
import {
	isEncryptedFile,
} from "obsidian-llm-hub-common/core";
import { cryptoCache } from "src/core/cryptoCache";
import { formatError } from "obsidian-llm-hub-common/core";
import {
	accumulateStreamChunk,
	createConfirmingToolExecutor,
	createStreamAccumulation,
	pendingStatusFields,
	runChatTurn,
	withRateLimitRetry,
	useAutoReadAloud,
	useReadAloudRate,
	useVoiceConversation,
	buildReadAloudSystemPrompt,
	type ChatTurnOutcome,
} from "obsidian-llm-hub-common/chat";
import { runSkillWorkflow } from "obsidian-llm-hub-common/workflow";
import { extractPdfText } from "src/vault/pdfText";
import {
	resolveMessageVariables as resolveMessageVariablesShared,
	useChatHistories,
	useChatStreamSessions,
	generateChatId,
	chatFilePath,
	type ChatStorageHost,
	type CommandVariableSources,
} from "obsidian-llm-hub-common/chat";
import { discoverSkills, loadSkill, buildSkillSystemPrompt, collectSkillWorkflows, type SkillMetadata, type LoadedSkill, type SkillWorkflowRef } from "src/core/skillsLoader";
import { resolveAgentPluginMcpServers } from "src/core/agentPlugins";
import { buildBuiltinOkfSystemPrompt, buildOkfSystemPrompt, discoverOkfBundles, getBuiltinOkfBundle, isBuiltinOkfBundleId, type OkfBundle } from "src/core/okfLoader";
import { executeReadOkfDocumentTool, READ_OKF_DOCUMENT_TOOL, READ_OKF_DOCUMENT_TOOL_NAME } from "src/core/okfDocumentTool";
import { GET_WORKFLOW_SPEC_TOOL, GET_WORKFLOW_SPEC_TOOL_NAME, handleGetWorkflowSpec } from "src/workflow/workflowSpec";
import { DEFAULT_BUILTIN_SKILL_IDS, builtinFolderPath, getBuiltinSkillMetadata } from "src/core/builtinSkills";
import { runtimeSkillPath } from "src/core/runtimeSkills";
import { promptForValue } from "./workflow/ValuePromptModal";
import { promptForDialog } from "./workflow/DialogPromptModal";
import { t } from "src/i18n";
import { PAID_RATE_LIMIT_RETRY_DELAYS_MS, buildErrorMessage, limitConversationHistory, shouldUseImageModel, type ChatHistory } from "./chat/chatUtils";
import {
	parseMarkdownToMessages,
	formatHistoryDate,
} from "./chat/chatHistory";
import { resolveEffectiveSkillPaths } from "./chat/contextSkills";

export interface ChatRef {
	getActiveChat: () => TFile | null;
	setActiveChat: (chat: TFile | null) => void;
	askSelection: (selection: { text: string; sourcePath?: string }) => void;
	setDraft: (content: string) => void;
}

const MARKDOWN_SKILL_PATH = builtinFolderPath("obsidian-markdown");
const DASHBOARD_SKILL_PATH = runtimeSkillPath("dashboard-hub", "dashboard");
const CANVAS_SKILL_PATH = builtinFolderPath("json-canvas");
const BASE_SKILL_PATH = builtinFolderPath("base");
const CONTEXT_SKILL_BY_EXTENSION: Record<string, string> = {
	dashboard: DASHBOARD_SKILL_PATH,
	canvas: CANVAS_SKILL_PATH,
	base: BASE_SKILL_PATH,
};
const CONTEXT_BUILTIN_SKILL_PATHS = new Set([
	MARKDOWN_SKILL_PATH,
	DASHBOARD_SKILL_PATH,
	CANVAS_SKILL_PATH,
	BASE_SKILL_PATH,
]);

// Files that can be @-mentioned: Markdown plus PDFs (text layer extracted on demand).
// Extensions are compared lower-cased to match the vault-layer lookups.
const MENTIONABLE_EXTENSIONS = new Set(["md", "pdf"]);

const isMentionableFile = (file: TFile): boolean =>
	MENTIONABLE_EXTENSIONS.has(file.extension.toLowerCase());

// File mentions stay as bare vault paths whenever the model has vault tools
// (see resolveMessageVariables), so it has to fetch their contents itself.
const FILE_MENTION_TOOL_PROMPT = "\n\nA bare vault-relative path in the user's message (for example `folder/note.md` or `folder/document.pdf`) is a file the user referenced by mention, not a literal string. Its content is not inlined into the message. Call read_note with that exact path before answering anything that depends on it.";

interface ChatProps {
	plugin: GeminiHelperPlugin;
	onToggleSidebarWidth: () => boolean;
}

const Chat = forwardRef<ChatRef, ChatProps>(({ plugin, onToggleSidebarWidth }, ref) => {
	const [messages, setMessages] = useState<Message[]>([]);
	const [maxPreviousMessages, setMaxPreviousMessages] = useState(() => {
		const saved = plugin.workspaceState.maxPreviousMessages;
		return typeof saved === "number" ? Math.max(0, Math.min(99, Math.trunc(saved))) : 99;
	});
	const [sentPromptHistory, setSentPromptHistory] = useState<string[]>(() => {
		const saved = plugin.workspaceState.sentPromptHistory;
		return Array.isArray(saved)
			? saved.filter(prompt => typeof prompt === "string" && prompt.trim()).slice(-100)
			: [];
	});
	const [activeChat, setActiveChat] = useState<TFile | null>(null);
	// Where this plugin keeps its chats. Everything that reads or writes them is shared.
	const chatStorageHost: ChatStorageHost = {
		app: plugin.app,
		getChatHistoryFolder: () => plugin.settings.workspaceFolder || DEFAULT_WORKSPACE_FOLDER,
		getManualChatSaveFolder: () => plugin.settings.manualChatSaveFolder,
		isHistoryEnabled: () => plugin.settings.saveChatHistory,
		getMaxSavedChatHistories: () => plugin.settings.maxSavedChatHistories,
		getEncryption: () => plugin.settings.encryption,
	};
	const {
		chatHistories,
		currentChatId,
		setCurrentChatId,
		saveNoteState,
		loadChatHistories,
		saveChatToDisk,
		saveCurrentChat,
		deleteChat: deleteChatFromHistory,
		saveAsNote,
		decryptChat,
	} = useChatHistories(chatStorageHost);
	const [showHistory, setShowHistory] = useState(false);
	const [isSidebarWide, setIsSidebarWide] = useState(false);
	const [isCompacting, setIsCompacting] = useState(false);
	const [currentModel, setCurrentModel] = useState<ModelType>(plugin.getSelectedModel());
	const [apiPlan, setApiPlan] = useState(plugin.settings.apiPlan);
	const [ragEnabledState, setRagEnabledState] = useState(plugin.settings.ragEnabled);
	const [ragSettingNames, setRagSettingNames] = useState<string[]>(plugin.getRagSettingNames());
	const [selectedRagSetting, setSelectedRagSetting] = useState<string | null>(
		plugin.workspaceState.selectedRagSetting
	);
	const [webSearchEnabled, setWebSearchEnabled] = useState(plugin.workspaceState.webSearchEnabled === true);
	// Vault tool mode: "all" = use all tools, "noSearch" = exclude search_notes/list_notes, "none" = no vault tools
	const supportsWebSearch = (model: string) =>
		!model.toLowerCase().includes("gemma-4")
		&& !/^gemini-3\.1-flash-lite-image(?:-|$)/i.test(model);
	const [vaultToolMode, setVaultToolMode] = useState<"all" | "noSearch" | "readOnly" | "none">("all");
	// Reason why vault tools are "none" - determines whether MCP should also be disabled
	const [, setVaultToolNoneReason] = useState<VaultToolNoneReason | null>(null);
	// MCP servers state: local copy with per-server enabled state (for chat session)
	const [mcpServers, setMcpServers] = useState(() =>
		[...plugin.settings.mcpServers]
	);
	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const {
		isLoading,
		setIsLoading,
		streamingContent,
		setStreamingContent,
		streamingThinking,
		setStreamingThinking,
		abortControllerRef,
		activeSessionIdRef,
		createStreamSession,
		leaveCurrentChat,
	} = useChatStreamSessions({
		setMessages,
		saveChatToDisk,
		currentChatId,
		// A backgrounded stream owns the executor it is still using; just let go of it.
		onDetachStream: () => { mcpExecutorRef.current = null; },
		onLeaveIdle: () => {
			if (mcpExecutorRef.current) {
				void mcpExecutorRef.current.cleanup();
				mcpExecutorRef.current = null;
			}
		},
	});
	const inputAreaRef = useRef<InputAreaHandle>(null);
	const [voiceChatSettings, setVoiceChatSettings] = useState(() => ({ ...plugin.settings.voiceChat }));
	useAutoReadAloud(messages, isLoading, voiceChatSettings.autoReadAloud);
	useReadAloudRate(voiceChatSettings.readAloudRate);
	const handleAutoReadAloudChange = useCallback((enabled: boolean) => {
		setVoiceChatSettings((previous) => {
			const next = { ...previous, autoReadAloud: enabled };
			plugin.settings.voiceChat = next;
			void plugin.saveSettings();
			return next;
		});
	}, [plugin]);
	// The transcript arrives as a paste from speech-popup, so the session only
	// has to open the popup again once each answer lands.
	const voiceConversation = useVoiceConversation(messages, isLoading, {
		command: voiceChatSettings.speechPopupCommand,
		readAloud: voiceChatSettings.autoReadAloud,
		onError: (message: string) => { new Notice(message); },
		onOpened: () => inputAreaRef.current?.focus(),
		onStarted: () => handleAutoReadAloudChange(true),
	});
	const pendingExternalSelectionRef = useRef<{ text: string; sourcePath?: string } | null>(null);
	const currentSlashCommandRef = useRef<SlashCommand | null>(null);
	// A slash command with confirmEdits off writes without asking.
	const autoApplyEdits = () => currentSlashCommandRef.current?.confirmEdits === false;
	const mcpExecutorRef = useRef<McpToolExecutor | null>(null);
	// Preserve the plugin-level last active chat across the component's first render
	// so the mount-time restore effect can read it before sync-back starts.
	const initialLastActiveChatIdRef = useRef<string | null>(plugin.lastActiveChatId);
	const hasCompletedInitialRestoreRef = useRef(false);
	const [vaultFiles, setVaultFiles] = useState<string[]>([]);
	const [currentDashboard, setCurrentDashboard] = useState<TFile | null>(null);
	const [activeContextSkillPath, setActiveContextSkillPath] = useState<string | null>(null);
	const [disabledContextSkillPaths, setDisabledContextSkillPaths] = useState<Set<string>>(
		() => new Set(),
	);
	const [hasSelection, setHasSelection] = useState(false);
	const [hasApiKey, setHasApiKey] = useState(!!plugin.settings.googleApiKey);
	const [decryptingChatId, setDecryptingChatId] = useState<string | null>(null);
	const [decryptPassword, setDecryptPassword] = useState("");
	// Pending feedback for edit rejection (to be sent after state update)
	const [pendingEditFeedback, setPendingEditFeedback] = useState<{ filePath: string; request: string } | null>(null);
	// Per-model thinking level (persisted in workspace state; "default" entries are omitted)
	const [reasoningEffortByModel, setReasoningEffortByModel] = useState<Record<string, ReasoningEffort>>(
		() => ({ ...(plugin.workspaceState.reasoningEffortByModel ?? {}) }),
	);

	// Agent Skills state (initialise with built-in skills so they are available synchronously)
	const [availableSkills, setAvailableSkills] = useState<SkillMetadata[]>(getBuiltinSkillMetadata);
	const [activeSkillPaths, setActiveSkillPaths] = useState<string[]>(
		() => DEFAULT_BUILTIN_SKILL_IDS.map(builtinFolderPath)
	);
	const effectiveActiveSkillPaths = useMemo(() => resolveEffectiveSkillPaths(
		activeSkillPaths,
		activeContextSkillPath,
		disabledContextSkillPaths,
		CONTEXT_BUILTIN_SKILL_PATHS,
	), [activeSkillPaths, activeContextSkillPath, disabledContextSkillPaths]);
	const getEffectiveSkillPathsForSend = useCallback((skillPath?: string) => resolveEffectiveSkillPaths(
		activeSkillPaths,
		activeContextSkillPath,
		disabledContextSkillPaths,
		CONTEXT_BUILTIN_SKILL_PATHS,
		skillPath,
	), [activeSkillPaths, activeContextSkillPath, disabledContextSkillPaths]);
	// OKF knowledge bundles discovered under the configured root directory.
	const [okfBundles, setOkfBundles] = useState<OkfBundle[]>([]);
	const [activeOkfBundleIds, setActiveOkfBundleIds] = useState<string[]>([]);

	// Check if configuration is ready (API key set)
	const isConfigReady = hasApiKey;

	const allowWebSearch = supportsWebSearch(currentModel);
	const allowRag = ragEnabledState;

	// Resolve the thinking level selected for a model ("default" leaves it to the API)
	const getReasoningEffort = (model: string): ReasoningEffort => {
		const saved = reasoningEffortByModel[model] ?? "default";
		return getReasoningEffortOptions(model).includes(saved) ? saved : "default";
	};
	const reasoningEffortOptions = getReasoningEffortOptions(currentModel);
	const selectedReasoningEffort = getReasoningEffort(currentModel);

	// Build available models list
	const availableModels = getAvailableModels(apiPlan);

	useImperativeHandle(ref, () => ({
		getActiveChat: () => activeChat,
		setActiveChat: (chat: TFile | null) => setActiveChat(chat),
		askSelection: (selection: { text: string; sourcePath?: string }) => {
			const text = selection.text.trim();
			if (!text) return;
			pendingExternalSelectionRef.current = { text, sourcePath: selection.sourcePath };
			inputAreaRef.current?.setInputValue("{selection}");
		},
		setDraft: (content: string) => {
			inputAreaRef.current?.setInputValue(content);
			inputAreaRef.current?.focus();
		},
	}));

	// Load chat histories on mount, and restore last active chat if available
	useEffect(() => {
		// Capture session ID at mount time so we can detect if the user
		// navigated elsewhere before the async restore completes.
		const mountSessionId = activeSessionIdRef.current;
		void loadChatHistories().then(async () => {
			try {
				// Skip restore if the user already started a new chat or loaded one
				if (activeSessionIdRef.current !== mountSessionId) return;

				const lastId = initialLastActiveChatIdRef.current;
				if (!lastId) return;

				const basePath = chatFilePath(chatStorageHost, lastId);
				let filePath = basePath;
				let exists = await plugin.app.vault.adapter.exists(filePath);
				if (!exists) {
					filePath = basePath + ".encrypted";
					exists = await plugin.app.vault.adapter.exists(filePath);
				}
				if (!exists) return;
				// Re-check after async gap
				if (activeSessionIdRef.current !== mountSessionId) return;

				const content = await plugin.app.vault.adapter.read(filePath);
				if (isEncryptedFile(content)) return; // Cannot auto-restore encrypted chats

				const parsed = parseMarkdownToMessages(content);
				if (parsed?.messages && parsed.messages.length > 0) {
					// Final check before touching state
					if (activeSessionIdRef.current !== mountSessionId) return;
					setMessages(parsed.messages);
					setCurrentChatId(lastId);
				}
			} catch (e) {
				console.warn("Failed to restore last active chat:", e);
			} finally {
				hasCompletedInitialRestoreRef.current = true;
			}
		});
	}, [loadChatHistories]);

	// Sync currentChatId -> plugin.lastActiveChatId (in-memory, cleared on restart)
	useEffect(() => {
		if (!hasCompletedInitialRestoreRef.current) return;
		plugin.lastActiveChatId = currentChatId;
	}, [currentChatId, plugin]);

	// Discover skills (on mount + when skills-changed is emitted)
	const refreshSkills = useCallback(() => {
		void discoverSkills(plugin.app).then(setAvailableSkills);
	}, [plugin]);

	useEffect(() => {
		refreshSkills();
		plugin.settingsEmitter.on("skills-changed", refreshSkills);
		return () => {
			plugin.settingsEmitter.off("skills-changed", refreshSkills);
		};
	}, [plugin, refreshSkills]);

	// Resolve the enabled OKF knowledge source from settings, if any.
	const getOkfSource = useCallback((): KnowledgeSource | null => {
		const source = (plugin.settings.knowledgeSources || []).find(s => s.enabled && s.path.trim());
		return source ?? null;
	}, [plugin]);

	// Resolve the configured OKF root directory, if OKF is enabled in settings.
	const getOkfRoot = useCallback((): string | null => {
		return getOkfSource()?.path.trim() || null;
	}, [getOkfSource]);

	// Persist the active bundle selection onto the OKF source so it survives restarts.
	const saveActiveOkfBundleIds = useCallback((activeBundleIds: string[]) => {
		const source = getOkfSource();
		if (!source) return;
		const externalBundleIds = activeBundleIds.filter(id => !isBuiltinOkfBundleId(id));
		plugin.settings.knowledgeSources = (plugin.settings.knowledgeSources || []).map(item =>
			item.id === source.id ? { ...item, activeBundleIds: externalBundleIds } : item
		);
		void plugin.saveSettings();
	}, [getOkfSource, plugin]);

	const refreshOkfBundles = useCallback(async () => {
		const builtinBundle = getBuiltinOkfBundle();
		const source = getOkfSource();
		if (!source) {
			setOkfBundles([builtinBundle]);
			setActiveOkfBundleIds(prev => prev.filter(id => isBuiltinOkfBundleId(id)));
			return;
		}
		const root = source.path.trim();
		const savedActiveBundleIds = source.activeBundleIds;
		const bundles = await discoverOkfBundles(plugin.app, root).catch(() => [] as OkfBundle[]);
		const allBundles = [builtinBundle, ...bundles];
		setOkfBundles(allBundles);
		setActiveOkfBundleIds(prev => {
			const validIds = new Set(allBundles.map(b => b.id));
			if (savedActiveBundleIds) {
				const builtinSelection = prev.filter(id => isBuiltinOkfBundleId(id));
				return [...builtinSelection, ...savedActiveBundleIds.filter(id => validIds.has(id))];
			}
			return prev.filter(id => validIds.has(id));
		});
	}, [plugin, getOkfSource]);

	useEffect(() => {
		void refreshOkfBundles();
		const handler = () => { void refreshOkfBundles(); };
		plugin.settingsEmitter.on("settings-updated", handler);
		return () => {
			plugin.settingsEmitter.off("settings-updated", handler);
		};
	}, [plugin, refreshOkfBundles]);

	// Cleanup MCP executor on unmount
	useEffect(() => {
		return () => {
			if (mcpExecutorRef.current) {
				void mcpExecutorRef.current.cleanup();
				mcpExecutorRef.current = null;
			}
		};
	}, []);

	// Load vault files for @ mention suggestions
	useEffect(() => {
		const updateVaultFiles = () => {
			const files = plugin.app.vault.getFiles()
				.filter(isMentionableFile)
				.map(file => file.path);
			setVaultFiles(files.sort());
		};
		updateVaultFiles();

		// Update on vault changes
		const onVaultChange = () => updateVaultFiles();
		plugin.app.vault.on("create", onVaultChange);
		plugin.app.vault.on("delete", onVaultChange);
		plugin.app.vault.on("rename", onVaultChange);

		return () => {
			plugin.app.vault.off("create", onVaultChange);
			plugin.app.vault.off("delete", onVaultChange);
			plugin.app.vault.off("rename", onVaultChange);
		};
	}, [plugin]);

	useEffect(() => {
		const readLeafFile = (leaf: { view?: unknown }): TFile | null => {
			const file = (leaf.view as { file?: TFile | null } | undefined)?.file;
			return file instanceof TFile ? file : null;
		};

		const findContext = (): { dashboardFile: TFile | null; skillPath: string | null } => {
			let dashboardFile: TFile | null = null;
			let skillPath: string | null = null;

			const considerOpenFile = (file: TFile | null) => {
				if (!file) return;
				if (file.extension === "dashboard" && !dashboardFile) {
					dashboardFile = file;
				}
				const contextSkill = CONTEXT_SKILL_BY_EXTENSION[file.extension];
				if (contextSkill && !skillPath) {
					skillPath = contextSkill;
				}
			};

			const activeFile = plugin.app.workspace.getActiveFile();
			considerOpenFile(activeFile);

			plugin.app.workspace.iterateAllLeaves((leaf) => {
				considerOpenFile(readLeafFile(leaf));
			});

			if (!dashboardFile) {
				const dashboards = plugin.app.vault
					.getFiles()
					.filter(file => file.extension === "dashboard")
					.sort((a, b) => b.stat.mtime - a.stat.mtime);
				dashboardFile = dashboards[0] ?? null;
			}

			return { dashboardFile, skillPath };
		};

		const refreshContext = () => {
			const context = findContext();
			setCurrentDashboard(context.dashboardFile);
			setActiveContextSkillPath(context.skillPath);
		};

		refreshContext();

		const onVaultChange = () => refreshContext();
		const onLeafChange = () => refreshContext();
		plugin.app.vault.on("create", onVaultChange);
		plugin.app.vault.on("delete", onVaultChange);
		plugin.app.vault.on("rename", onVaultChange);
		plugin.app.workspace.on("active-leaf-change", onLeafChange);

		return () => {
			plugin.app.vault.off("create", onVaultChange);
			plugin.app.vault.off("delete", onVaultChange);
			plugin.app.vault.off("rename", onVaultChange);
			plugin.app.workspace.off("active-leaf-change", onLeafChange);
		};
	}, [plugin]);

	// Update hasSelection and focus input when chat gains focus
	useEffect(() => {
		const handleLeafChange = () => {
			// Small delay to let selection capture complete
			window.setTimeout(() => {
				const selection = plugin.getLastSelection();
				setHasSelection(!!selection);
				// Skip auto-focus on mobile - iOS doesn't allow programmatic focus without user interaction
				if (!Platform.isMobile) {
					inputAreaRef.current?.focus();
				}
			}, 50);
		};

		plugin.settingsEmitter.on("chat-activated", handleLeafChange);
		return () => {
			plugin.settingsEmitter.off("chat-activated", handleLeafChange);
		};
	}, [plugin]);

	// Auto-scroll to bottom when messages change
	useEffect(() => {
		// Delay scroll to ensure MarkdownRenderer has finished rendering
		const timer = window.setTimeout(() => {
			const container = messagesContainerRef.current;
			if (container) {
				container.scrollTop = container.scrollHeight;
			}
		}, 150);
		return () => window.clearTimeout(timer);
	}, [messages, streamingContent]);

	// Handle iOS keyboard visibility using focus events
	const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
	const [isDecryptInputFocused, setIsDecryptInputFocused] = useState(false);
	useEffect(() => {
		if (!Platform.isMobile) return;

		const handleFocusIn = (e: FocusEvent) => {
			const target = e.target as HTMLElement;
			// Track focus on textarea within our chat input area
			if (target.tagName === "TEXTAREA" && target.closest(".gemini-helper-input-container")) {
				setIsKeyboardVisible(true);
				setIsDecryptInputFocused(false);
			}
			// Track focus on decrypt form password input
			if (target.tagName === "INPUT" && target.closest(".gemini-helper-decrypt-form")) {
				setIsKeyboardVisible(true);
				setIsDecryptInputFocused(true);
			}
		};

		const handleFocusOut = (e: FocusEvent) => {
			const target = e.target as HTMLElement;
			// Track focusout from textarea within our chat input area
			if (target.tagName === "TEXTAREA" && target.closest(".gemini-helper-input-container")) {
				// Small delay to avoid flickering
				window.setTimeout(() => {
					const active = activeDocument.activeElement as HTMLElement | null;
					const isStillInInput = active?.tagName === "TEXTAREA" && active?.closest(".gemini-helper-input-container");
					const isInDecryptForm = active?.tagName === "INPUT" && active?.closest(".gemini-helper-decrypt-form");
					if (!isStillInInput && !isInDecryptForm) {
						setIsKeyboardVisible(false);
					}
				}, 100);
			}
			// Track focusout from decrypt form password input
			if (target.tagName === "INPUT" && target.closest(".gemini-helper-decrypt-form")) {
				window.setTimeout(() => {
					const active = activeDocument.activeElement as HTMLElement | null;
					const isStillInDecrypt = active?.tagName === "INPUT" && active?.closest(".gemini-helper-decrypt-form");
					const isInChatInput = active?.tagName === "TEXTAREA" && active?.closest(".gemini-helper-input-container");
					if (!isStillInDecrypt && !isInChatInput) {
						setIsKeyboardVisible(false);
						setIsDecryptInputFocused(false);
					} else if (isInChatInput) {
						setIsDecryptInputFocused(false);
					}
				}, 100);
			}
		};

		activeDocument.addEventListener("focusin", handleFocusIn);
		activeDocument.addEventListener("focusout", handleFocusOut);

		return () => {
			activeDocument.removeEventListener("focusin", handleFocusIn);
			activeDocument.removeEventListener("focusout", handleFocusOut);
		};
	}, []);

	// Listen for workspace state changes
	useEffect(() => {
		const handleWorkspaceStateLoaded = () => {
			setRagSettingNames(plugin.getRagSettingNames());
			setSelectedRagSetting(plugin.workspaceState.selectedRagSetting);
			setWebSearchEnabled(plugin.workspaceState.webSearchEnabled === true);
			setReasoningEffortByModel({ ...(plugin.workspaceState.reasoningEffortByModel ?? {}) });
		};

		const handleRagSettingChanged = (name: string | null) => {
			setSelectedRagSetting(name);
		};
		const handleWebSearchChanged = (enabled: boolean) => {
			setWebSearchEnabled(enabled);
		};

		plugin.settingsEmitter.on("workspace-state-loaded", handleWorkspaceStateLoaded);
		plugin.settingsEmitter.on("rag-setting-changed", handleRagSettingChanged);
		plugin.settingsEmitter.on("web-search-changed", handleWebSearchChanged);

		return () => {
			plugin.settingsEmitter.off("workspace-state-loaded", handleWorkspaceStateLoaded);
			plugin.settingsEmitter.off("rag-setting-changed", handleRagSettingChanged);
			plugin.settingsEmitter.off("web-search-changed", handleWebSearchChanged);
		};
	}, [plugin]);

	useEffect(() => {
		const handleSettingsUpdated = () => {
			setApiPlan(plugin.settings.apiPlan);
			setCurrentModel(plugin.getSelectedModel());
			setRagEnabledState(plugin.settings.ragEnabled);
			setHasApiKey(!!plugin.settings.googleApiKey);
			// Sync MCP servers from settings
			setMcpServers([...plugin.settings.mcpServers]);
			setVoiceChatSettings({ ...plugin.settings.voiceChat });
		};
		plugin.settingsEmitter.on("settings-updated", handleSettingsUpdated);
		return () => {
			plugin.settingsEmitter.off("settings-updated", handleSettingsUpdated);
		};
	}, [plugin, selectedRagSetting]);

	useEffect(() => {
		if (!isModelAllowedForPlan(apiPlan, currentModel)) {
			const defaultModel = getDefaultModelForPlan(apiPlan);
			setCurrentModel(defaultModel);
			void plugin.selectModel(defaultModel);
		}
	}, [apiPlan, currentModel, plugin]);

	// Handle pending edit feedback (send after state update to avoid closure issues)
	useEffect(() => {
		if (pendingEditFeedback && !isLoading) {
			const { filePath, request } = pendingEditFeedback;
			setPendingEditFeedback(null);

			// Build simple feedback message (chat already shows the original request and AI's proposal)
			const feedbackMessage = request.trim()
				? `${t("message.editFeedbackHeader", { filePath })}\n\n${t("message.editFeedbackUserRequest")}\n\n${request}`
				: `${t("message.editFeedbackHeader", { filePath })}\n\n${t("message.editFeedbackRetry")}`;

			void sendMessage(feedbackMessage);
		}
	}, [pendingEditFeedback, isLoading]);

	// Gemma 4 cannot combine Google Search with Function Calling in one request
	const isGemma4 = (model: string) => model.toLowerCase().includes("gemma-4");

	// `persist` is false for slash-command overrides: they last for the message,
	// and must not rewrite the workspace's remembered search preferences.
	const handleWebSearchChange = (enabled: boolean, modelForSupport = currentModel, persist = true) => {
		const nextEnabled = enabled && supportsWebSearch(modelForSupport);
		if (nextEnabled) setSelectedRagSetting(null);
		setWebSearchEnabled(nextEnabled);
		if (persist) void plugin.selectWebSearchEnabled(nextEnabled);
	};

	const handleReasoningEffortChange = (effort: ReasoningEffort) => {
		setReasoningEffortByModel(prev => {
			const next = { ...prev };
			if (effort === "default") delete next[currentModel];
			else next[currentModel] = effort;
			return next;
		});
		void plugin.setReasoningEffort(currentModel, effort);
	};

	// Handle RAG setting change from UI
	const handleRagSettingChange = (name: string | null, persist = true) => {
		if (name) setWebSearchEnabled(false);
		setSelectedRagSetting(name);
		if (persist) void plugin.selectRagSetting(name);
	};

	// Handle vault tool mode change from UI
	const handleVaultToolModeChange = (mode: "all" | "noSearch" | "readOnly" | "none") => {
		setVaultToolMode(mode);
		setVaultToolNoneReason(mode === "none" ? "manual" : null);
	};

	// Handle per-server MCP toggle from UI
	const handleMcpServerToggle = (serverName: string, enabled: boolean) => {
		setMcpServers(servers => {
			const updated = servers.map(s => s.name === serverName ? { ...s, enabled } : s);
			plugin.settings.mcpServers = updated;
			void plugin.saveSettings();
			return updated;
		});
	};

	// Handle model change from UI
	const handleModelChange = (model: ModelType) => {
		setCurrentModel(model);
		const shouldClearRag = isImageGenerationModel(model) && selectedRagSetting !== null;
		if (shouldClearRag) {
			setSelectedRagSetting(null);
			// Serialize the workspace writes so a slower model-only write cannot
			// restore the RAG selection after it has been cleared.
			void plugin.selectModel(model).then(() => plugin.selectRagSetting(null));
		} else {
			void plugin.selectModel(model);
		}

		// Auto-adjust search setting and vault tool mode for special models
		if (isImageGenerationModel(model)) {
			// Image models do not use File Search RAG; it was cleared above.
			setVaultToolMode("all");
			setVaultToolNoneReason(null);
		} else if (isGemma4(model)) {
			// Gemma 4: file_search and Web Search are not supported here
			if (selectedRagSetting) {
				handleRagSettingChange(null);
			}
			if (webSearchEnabled) handleWebSearchChange(false, model);
		} else {
			// Normal models: restore vault tools
			setVaultToolMode("all");
			setVaultToolNoneReason(null);
		}
	};

	// Both resolvers live in the shared library; the host only supplies its selection
	// sources, PDF extraction and vault-tool scope.
	const commandVariableSources = (): CommandVariableSources => ({
		takeExternalSelection: () => {
			const pending = pendingExternalSelectionRef.current;
			pendingExternalSelectionRef.current = null;
			return pending;
		},
		getLastSelection: () => plugin.getLastSelection(),
		getSelectionLocation: () => plugin.getSelectionLocation(),
	});

	const resolveMessageVariables = (content: string, inlineFileMentions: boolean): Promise<string> =>
		resolveMessageVariablesShared(plugin.app, content, {
			...commandVariableSources(),
			inlineFileMentions,
			vaultToolAllowedFolders: plugin.settings.aiVaultToolAllowedFolders,
			maxNoteChars: plugin.settings.maxNoteChars,
			readMentionText: (file) => file.extension.toLowerCase() === "pdf"
				? extractPdfText(plugin.app, file.path)
				: plugin.app.vault.read(file),
		});

	// Handle slash command selection
	const handleSlashCommand = (command: SlashCommand): string => {
		// Track the current slash command for auto-apply logic
		currentSlashCommandRef.current = command;
		const commandSearch = getSlashCommandSearchSelection(command);

		// Optionally change model
		const nextModel = command.model && isModelAllowedForPlan(apiPlan, command.model)
			? command.model
			: currentModel;
		if (nextModel !== currentModel) {
			setCurrentModel(nextModel);
			if (isImageGenerationModel(nextModel) && selectedRagSetting !== null && commandSearch === null) {
				handleRagSettingChange(null, false);
			}
		}

		// Slash overrides are temporary and must not overwrite workspace preferences.
		// Commands saved before the split still carry the single-choice value, which
		// getSlashCommandSearchSelection reads for us.
		if (commandSearch !== null) {
			if (commandSearch.webSearch) {
				handleWebSearchChange(true, nextModel, false);
				handleRagSettingChange(null, false);
			} else {
				handleWebSearchChange(false, nextModel, false);
				handleRagSettingChange(commandSearch.ragSetting, false);
			}
		}

		// Optionally change vault tool mode (null = keep current)
		// Slash commands are input helpers, so vaultToolMode="none" uses "manual" reason (MCP unchanged)
		if (command.vaultToolMode !== null && command.vaultToolMode !== undefined) {
			setVaultToolMode(command.vaultToolMode);
			setVaultToolNoneReason(command.vaultToolMode === "none" ? "manual" : null);
		}

		// Optionally change MCP server enabled state (null = keep current)
		if (command.enabledMcpServers !== null && command.enabledMcpServers !== undefined) {
			const enabledSet = new Set(command.enabledMcpServers);
			setMcpServers(servers => servers.map(s => ({
				...s,
				enabled: enabledSet.has(s.name)
			})));
		}

		// Return template as-is, variables will be resolved on send
		return command.promptTemplate;
	};

	// Start new chat
	// Start new chat (works even while a stream is running — the old stream
	// continues in the background and saves its result to history when done).
	const startNewChat = () => {
		leaveCurrentChat();

		setMessages([]);
		setCurrentChatId(null);
		// Keep the user's currently selected skills when starting a new chat
		// (skills are a session-level selection, not per-chat state).
		setStreamingContent("");
		setStreamingThinking("");
		setShowHistory(false);
	};

	// Decrypt and load encrypted chat
	const decryptAndLoadChat = async (chatId: string, password: string) => {
		leaveCurrentChat();
		try {
			const parsed = await decryptChat(chatId, password);
			setMessages(parsed.messages);
			setCurrentChatId(chatId);
			setStreamingContent("");
			setStreamingThinking("");
			setDecryptingChatId(null);
			setDecryptPassword("");
			setShowHistory(false);
			new Notice(t("chat.decrypted"));
		} catch (error) {
			console.error("Decryption failed:", formatError(error));
			new Notice(t("chat.decryptFailed"));
		}
	};

	// Load a chat from history
	const loadChat = (history: ChatHistory) => {
		leaveCurrentChat();
		if (history.isEncrypted) {
			// If password is cached, try to decrypt automatically
			const cachedPassword = cryptoCache.getPassword();
			if (cachedPassword) {
				void decryptAndLoadChat(history.id, cachedPassword);
				return;
			}
			// Show decryption UI
			setDecryptingChatId(history.id);
			setDecryptPassword("");
			return;
		}
		setMessages(history.messages);
		setCurrentChatId(history.id);
		setStreamingContent("");
		setStreamingThinking("");
		setShowHistory(false);
	};

	// Delete a chat from history
	const deleteChat = async (chatId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		await deleteChatFromHistory(chatId);
		if (currentChatId === chatId) {
			startNewChat();
		}
		new Notice(t("chat.chatDeleted"));
	};

	// Send message to Gemini
	/** What the preparation works out and the rest of the turn needs. */
	interface GeminiTurnContext {
		client: ReturnType<typeof getGeminiClient> & object;
		allowedModel: ModelType;
		autoSwitchedToImage: boolean;
		originalModel: ModelType;
	}

	const sendMessage = async (content: string, attachments?: Attachment[], skillPath?: string) => {
		if ((!content.trim() && !skillPath && (!attachments || attachments.length === 0)) || isLoading) return;

		// Kept out here so the teardown can reach it even when the stream was
		// pushed to the background mid-turn.
		const mcpCleanupRef: { executor: McpToolExecutor | null } = { executor: null };
		// The confirming tool executor is built once the turn is running; this is
		// how the feedback it collected gets back out to the finished turn.
		let takeEditFeedback: (() => { filePath: string; request: string } | null) | null = null;

		await runChatTurn<GeminiTurnContext>({
			messages, setMessages, setIsLoading, setStreamingContent, setStreamingThinking,
			abortControllerRef, createStreamSession,
			describeError: (error) => buildErrorMessage(error, apiPlan),
		}, {
			prepare: async () => {

				const client = getGeminiClient();
				if (!client) {
					new Notice(t("chat.clientNotInitialized"));
					return null;
				}

				// Set the current model (fallback if not allowed for plan)
				let allowedModel = isModelAllowedForPlan(apiPlan, currentModel)
					? currentModel
					: getDefaultModelForPlan(apiPlan);

				// Auto-switch to image model when image generation keywords detected
				let autoSwitchedToImage = false;
				const originalModel = allowedModel;
				if (!isImageGenerationModel(allowedModel) && shouldUseImageModel(content)) {
					if (isModelAllowedForPlan(apiPlan, "gemini-3.1-flash-image")) {
						allowedModel = "gemini-3.1-flash-image";
						autoSwitchedToImage = true;
					} else if (isModelAllowedForPlan(apiPlan, "gemini-3-pro-image")) {
						allowedModel = "gemini-3-pro-image";
						autoSwitchedToImage = true;
					}
					// If neither is available, keep current model
				}

				if (allowedModel !== currentModel && !autoSwitchedToImage) {
					setCurrentModel(allowedModel);
					void plugin.selectModel(allowedModel);
				}
				client.setModel(allowedModel);

				// Resolve variables in the content ({selection}, {content}, file paths)
				const resolvedContent = await resolveMessageVariables(
					content,
					vaultToolMode === "none" || isImageGenerationModel(allowedModel),
				);

				// When skill is invoked without message, use skill name as trigger
				let displayContent = resolvedContent.trim();
				if (!displayContent && skillPath) {
					const skillMeta = availableSkills.find(s => s.folderPath === skillPath);
					displayContent = skillMeta ? `/${skillMeta.name}` : "/skill";
				}

				// Add user message
				const userMessage: Message = {
					role: "user",
					content: displayContent || (attachments ? `[${attachments.length} file(s) attached]` : ""),
					timestamp: Date.now(),
					attachments,
				};

				return {
					userMessage,
					trace: {
						name: "chat-message",
						sessionId: currentChatId ?? undefined,
						input: resolvedContent,
						metadata: {
							model: allowedModel,
							ragEnabled: allowRag && !isImageGenerationModel(allowedModel),
							webSearchEnabled,
							toolsEnabled: !isImageGenerationModel(allowedModel),
							isImageGeneration: isImageGenerationModel(allowedModel),
							pluginVersion: plugin.manifest.version,
						},
					},
					context: { client, allowedModel, autoSwitchedToImage, originalModel },
				};
			},

			run: async (turn, { client, allowedModel }) => {
				const { isActive, abortController, traceId, userMessage } = turn;
				let result: ChatTurnOutcome | undefined;
				const runStreamOnce = async () => {
					const { settings } = plugin;
					const toolsEnabled = !isImageGenerationModel(allowedModel);
					const vaultToolsEnabled = toolsEnabled && vaultToolMode !== "none";
					const obsidianTools = vaultToolsEnabled ? getEnabledVaultTools({
						allowWrite: true,
						allowDelete: true,
						ragSyncStatus: HOST_EXECUTES_RAG_SYNC_STATUS && allowRag,
					}) : [];

					// Activate skill if invoked via slash command
					const effectiveSkillPaths = getEffectiveSkillPathsForSend(skillPath);

					// Load active skills (needed for both workflow tools and system prompt).
					// Vault skills are returned in lazy form (empty instructions/references);
					// the chat LLM fetches SKILL.md via the read_note tool when it needs it.
					let loadedSkillsList: LoadedSkill[] = [];
					if (effectiveSkillPaths.length > 0) {
						const activeMetadata = availableSkills.filter(s => effectiveSkillPaths.includes(s.folderPath));
						if (activeMetadata.length > 0) {
							loadedSkillsList = activeMetadata.map(m => loadSkill(plugin.app, m));
						}
					}

					// Fetch MCP tools from enabled servers
					const enabledMcpServers = resolveAgentPluginMcpServers(mcpServers, effectiveSkillPaths, settings.agentPlugins).filter(s => s.enabled);
					const mcpTools: McpToolDefinition[] = toolsEnabled && enabledMcpServers.length > 0
						? await fetchMcpTools(enabledMcpServers)
						: [];

					// Cleanup previous MCP executor if exists
					if (mcpExecutorRef.current) {
						void mcpExecutorRef.current.cleanup();
						mcpExecutorRef.current = null;
					}

					// Create MCP tool executor
					const mcpToolExecutor = mcpTools.length > 0
						? createMcpToolExecutor(mcpTools, traceId)
						: undefined;

					// Store for session reuse and background cleanup
					mcpExecutorRef.current = mcpToolExecutor ?? null;
					mcpCleanupRef.executor = mcpToolExecutor ?? null;

					// Merge Obsidian tools and MCP tools
					const allTools = [...obsidianTools, ...mcpTools];

					// Apply the Vault access mode to the built-in tools (MCP tools are independent).
					const tools = allTools.filter(tool => isMcpTool(tool) || isVaultToolAllowed(tool.name, vaultToolMode));

					// Add run_skill_workflow tool if any active skill has workflows
					if (vaultToolsEnabled && loadedSkillsList.some(s => s.workflows.length > 0)) {
						tools.push(skillWorkflowTool);
					}

					// Add execute_javascript tool
					if (vaultToolsEnabled) {
						tools.push(EXECUTE_JAVASCRIPT_TOOL);
						tools.push(GET_WORKFLOW_SPEC_TOOL);
					}

					if (vaultToolsEnabled && activeOkfBundleIds.length > 0) {
						tools.push(READ_OKF_DOCUMENT_TOOL);
					}

					// Create context for RAG tools (Obsidian tools only)
					const obsidianToolExecutor = vaultToolsEnabled
						? createToolExecutor(plugin.app, {
							ragSyncState: { files: plugin.ragState.files, lastFullSync: plugin.ragState.lastFullSync },
							ragFilterConfig: {
								includeFolders: plugin.ragState.includeFolders,
								excludePatterns: plugin.ragState.excludePatterns,
							},
							listNotesLimit: settings.listNotesLimit,
							maxNoteChars: settings.maxNoteChars,
							limitVaultToolScope: true,
							vaultToolAllowedFolders: settings.aiVaultToolAllowedFolders,
							// Models that take a document part read the PDF itself; the rest
							// (Gemma 4) fall back to its text layer. runStreamOnce lifts the
							// document out of the tool result before the JSON is serialized.
							pdfInputMode: modelAcceptsPdf(allowedModel) ? "native" : "extract-text",
						})
						: undefined;

					// Filled in by the confirming executor below.
					// Track MCP Apps with UI for message display
					const collectedMcpApps: McpAppInfo[] = [];

					// Build skill workflow map for tool execution
					const skillWorkflowMap = loadedSkillsList.length > 0
						? collectSkillWorkflows(loadedSkillsList)
						: new Map<string, { skill: LoadedSkill; workflowRef: SkillWorkflowRef; vaultPath: string }>();

					// Combined tool executor that routes to Obsidian, MCP, or Skill Workflow based on tool name
					const baseToolExecutor = (obsidianToolExecutor || mcpToolExecutor || skillWorkflowMap.size > 0 || activeOkfBundleIds.length > 0)
						? async (name: string, args: Record<string, unknown>) => {
							// MCP tools start with "mcp_"
							if (name.startsWith("mcp_") && mcpToolExecutor) {
								const mcpResult = await mcpToolExecutor.execute(name, args);
								// Collect MCP App info if available
								if (mcpResult.mcpApp) {
									collectedMcpApps.push(mcpResult.mcpApp);
								}
								// Return result in expected format for compatibility
								if (mcpResult.error) {
									return { error: mcpResult.error };
								}
								return { result: mcpResult.result };
							}
							// Skill workflow tool
							if (name === "run_skill_workflow" && skillWorkflowMap.size > 0) {
								return await runSkillWorkflow(
									plugin.app,
									args.workflowId as string,
									args.variables as string | undefined,
									skillWorkflowMap,
									// The same folders the chat's own Vault tools are held to:
									// a workflow the model triggers is the same permission.
									{ vaultToolAllowedFolders: settings.aiVaultToolAllowedFolders },
								);
							}
							// JavaScript sandbox tool
							if (name === "execute_javascript") {
								return await handleExecuteJavascriptTool(args);
							}
							// Workflow spec lookup tool
							if (name === GET_WORKFLOW_SPEC_TOOL_NAME) {
								return handleGetWorkflowSpec(args, plugin);
							}
							if (name === READ_OKF_DOCUMENT_TOOL_NAME) {
								return executeReadOkfDocumentTool(
									plugin.app,
									getOkfRoot(),
									activeOkfBundleIds,
									typeof args.bundleId === "string" ? args.bundleId : "",
									typeof args.path === "string" ? args.path : "",
								);
							}
							// Otherwise use Obsidian tool executor
							if (obsidianToolExecutor) {
								if (!isVaultToolAllowed(name, vaultToolMode)) return { error: `Vault tool is disabled in ${vaultToolMode} mode: ${name}` };
								return await obsidianToolExecutor(name, args);
							}
							return { error: `Unknown tool: ${name}` };
						}
						: undefined;

					// The propose_* and bulk_* tools need the user's confirmation before
					// anything is written; the shared wrapper drives it and records what
					// happened for the badges on the finished message.
					const confirming = baseToolExecutor
						? createConfirmingToolExecutor(baseToolExecutor, plugin.app, autoApplyEdits, () => abortController.abort())
						: null;
					const toolExecutor = confirming?.executeToolCall;
					const processedEdits = confirming?.processedEdits ?? [];
					const processedDeletes = confirming?.processedDeletes ?? [];
					const processedRenames = confirming?.processedRenames ?? [];
					const pendingAdditionalRequestRef = confirming?.pendingAdditionalRequest ?? { current: null };
					takeEditFeedback = () => {
						const requestInfo = pendingAdditionalRequestRef.current;
						pendingAdditionalRequestRef.current = null;
						return requestInfo;
					};

						// Check if Web Search or Image Generation model is selected
					const isImageGeneration = isImageGenerationModel(allowedModel);
					const isWebSearch = supportsWebSearch(allowedModel) && webSearchEnabled;
					const requestRagEnabled = allowRag && !isImageGeneration;

					// Pass RAG store IDs if RAG is enabled and a setting is selected (not web search)
					const ragStoreIds = requestRagEnabled && selectedRagSetting
						? plugin.getStoreIdsForRagSetting(plugin.getRagSetting(selectedRagSetting))
						: [];
					if (requestRagEnabled && selectedRagSetting && ragStoreIds.length === 0) {
						throw new Error(`Selected RAG setting "${selectedRagSetting}" has no File Search store. Sync or configure the store before using RAG.`);
					}
					const ragMetadataFilter = requestRagEnabled && selectedRagSetting
						? (plugin.getRagSetting(selectedRagSetting)?.metadataFilter || undefined)
						: undefined;

					let systemPrompt = "You are a helpful AI assistant integrated with Obsidian.";

					if (vaultToolsEnabled) {
						systemPrompt += `

		Available tools allow you to:
		- Read vault files, including PDFs
		- Create new text-based vault files
		- Update existing text-based vault files
		- Search for text-based vault files by name or content
		- List text-based vault files and folders
		- Get information about the active vault file`;
						systemPrompt += FILE_MENTION_TOOL_PROMPT;
					}

					// Add RAG sync status info if server RAG is enabled (uses FileSearchManager)
					if (requestRagEnabled && vaultToolsEnabled) {
								systemPrompt += `
		- Check RAG sync status only when users explicitly ask whether files are synced or imported. Do not use it to answer questions about file content. Use get_rag_sync_status to:
		  - Check a specific file's sync status (when it was imported, if it has changes)
		  - List unsynced files in a directory
		  - Get a summary of the vault's overall sync status`;
							}

					if (ragStoreIds.length > 0) {
						systemPrompt += `
		- A semantic search file store is selected. Use semantic search for questions that may rely on vault knowledge, synced documents, PDFs, or images. Prefer retrieved evidence over guessing.`;
					}

					systemPrompt += `

		Always be helpful and provide clear, concise responses. When working with vault files, confirm actions and provide relevant feedback.`;

					if (settings.systemPrompt) {
						systemPrompt += `\n\nAdditional instructions: ${settings.systemPrompt}`;
					}

					// Inject active agent skills into system prompt
					let skillsUsedNames: string[] = [];
					if (loadedSkillsList.length > 0) {
						const skillPrompt = buildSkillSystemPrompt(loadedSkillsList);
						if (skillPrompt) {
							systemPrompt += skillPrompt;
							skillsUsedNames = loadedSkillsList.map(s => s.name);
						}
					}

					const builtinOkfActive = activeOkfBundleIds.some(id => isBuiltinOkfBundleId(id));
					if (builtinOkfActive) {
						systemPrompt += buildBuiltinOkfSystemPrompt();
					}

					const okfRoot = getOkfRoot();
					const externalOkfBundleIds = activeOkfBundleIds.filter(id => !isBuiltinOkfBundleId(id));
					if (okfRoot && externalOkfBundleIds.length > 0) {
						systemPrompt += await buildOkfSystemPrompt(plugin.app, okfRoot, externalOkfBundleIds);
					}

					if (plugin.settings.voiceChat.autoReadAloud) systemPrompt += buildReadAloudSystemPrompt();

					const allMessages = limitConversationHistory([...messages, userMessage], maxPreviousMessages);

					// Use streaming with tools
					// Everything the stream says, gathered by the shared accumulator.
					const stream = createStreamAccumulation();
					const startTime = Date.now();

					let stopped = false;

					// Resolve previous interaction ID for Interactions API conversation chaining.
					// Only chain when the most recent assistant message (array tail) carries an
					// interactionId.  If it doesn't (old chat history, image generation response,
					// CLI response, etc.) we fall back to local history replay in gemini.ts.
					const previousInteractionId = (() => {
						for (let i = messages.length - 1; i >= 0; i--) {
							if (messages[i].role === "assistant") {
								return messages[i].interactionId;  // undefined if absent → fallback
							}
						}
						return undefined;
					})();

					// Some models cannot combine google_search with function calling.
					const effectiveTools = tools;

					// Use image generation stream or regular chat stream
					const chunkStream = isImageGeneration
						? client.generateImageStream(allMessages, allowedModel, systemPrompt, isWebSearch, ragStoreIds, traceId)
						: client.chatWithToolsStream(
							allMessages,
							effectiveTools,
							systemPrompt,
							effectiveTools.length > 0 ? toolExecutor : undefined,
							ragStoreIds,
							isWebSearch,
							{
								ragTopK: settings.ragTopK,
								functionCallLimits: {
									maxFunctionCalls: settings.maxFunctionCalls,
									functionCallWarningThreshold: settings.functionCallWarningThreshold,
									requestLimitExtension: async ({ used, currentLimit, extensionAmount, remaining }) => {
										if (!isActive() || abortController.signal.aborted) return false;
										const confirmLabel = t("chat.extendToolLimitConfirm", { extensionAmount });
										const result = await promptForDialog(
											plugin.app,
											t("chat.extendToolLimitTitle"),
											t("chat.extendToolLimitMessage", { used, currentLimit, extensionAmount, remaining }),
											[],
											false,
											confirmLabel,
											t("common.cancel"),
											false,
											t("chat.extendToolLimitInput"),
											{ input: String(extensionAmount) }
										);
										if (result?.button !== confirmLabel) return false;
										const requested = Number.parseInt(result.input ?? "", 10);
										return Number.isFinite(requested) && requested > 0 ? requested : false;
									},
								},
								disableTools: effectiveTools.length === 0 && !isWebSearch,
								reasoningEffort: getReasoningEffort(allowedModel),
								ragMetadataFilter,
								traceId,
								previousInteractionId,
							}
						);

					for await (const chunk of chunkStream) {
						// Check if stopped
						if (abortController.signal.aborted) {
							stopped = true;
							break;
						}

					accumulateStreamChunk(stream, chunk);
					if (isActive()) {
						if (chunk.type === "text") setStreamingContent(stream.text);
						else if (chunk.type === "thinking") setStreamingThinking(stream.thinking);
					}
					}

					// If stopped, add partial message if any content was received
					const fullContent = stopped && stream.text
						? `${stream.text}\n\n${t("chat.generationStopped")}`
						: stream.text;

					// Always clear the slash command ref after message processing
					currentSlashCommandRef.current = null;

					// Add assistant message
					const assistantMessage: Message = {
						role: "assistant",
						content: fullContent,
						timestamp: Date.now(),
						model: allowedModel,
						toolsUsed: stream.toolsUsed.length > 0 ? stream.toolsUsed : undefined,
						skillsUsed: skillsUsedNames.length > 0 ? skillsUsedNames : undefined,
						...pendingStatusFields({ edits: processedEdits, deletes: processedDeletes, renames: processedRenames }),
						toolCalls: stream.toolCalls.length > 0 ? stream.toolCalls : undefined,
						toolResults: stream.toolResults.length > 0 ? stream.toolResults : undefined,
						ragUsed: stream.ragUsed || undefined,
						ragSources: stream.ragSources.length > 0 ? stream.ragSources : undefined,
						ragContexts: stream.ragContexts.length > 0 ? stream.ragContexts : undefined,
						webSearchUsed: stream.webSearchUsed || undefined,
						webSearchSources: stream.webSearchSources.length > 0 ? stream.webSearchSources : undefined,
						imageGenerationUsed: stream.imageGenerationUsed || undefined,
						generatedImages: stream.generatedImages.length > 0 ? stream.generatedImages : undefined,
						thinking: stream.thinking || undefined,
						mcpApps: collectedMcpApps.length > 0 ? collectedMcpApps : undefined,
						usage: stream.usage,
						elapsedMs: Date.now() - startTime,
						interactionId: stream.interactionId,
					};

					result = {
						message: assistantMessage,
						output: fullContent,
						metadata: {
							toolsUsed: stream.toolsUsed.length > 0 ? stream.toolsUsed : undefined,
							ragUsed: stream.ragUsed,
							ragSources: stream.ragSources.length > 0 ? stream.ragSources : undefined,
							ragContexts: stream.ragContexts.length > 0 ? stream.ragContexts : undefined,
							webSearchUsed: stream.webSearchUsed,
							imageGenerationUsed: stream.imageGenerationUsed,
							stopped,
						},
						status: {
							value: stopped ? 0.5 : 1,
							comment: stopped ? "stopped by user" : "completed",
						},
					};
				};

				const outcome = await withRateLimitRetry(runStreamOnce, {
					// Only the paid plan has a rate limit worth waiting out.
					delays: apiPlan === "paid" ? PAID_RATE_LIMIT_RETRY_DELAYS_MS : [],
					isAborted: () => abortController.signal.aborted,
					onRetry: ({ attempt, total, delayMs }) => {
						// The failed attempt left partial output on screen.
						if (isActive()) {
							setStreamingContent("");
							setStreamingThinking("");
						}
						new Notice(t("chat.rateLimitRetrying", {
							seconds: String(Math.ceil(delayMs / 1000)),
							attempt: String(attempt),
							max: String(total),
						}));
					},
				});
				if (outcome === "aborted") {
					// The abandoned attempt left partial output on screen.
					if (isActive()) {
						setStreamingContent("");
						setStreamingThinking("");
					}
					return {
						message: null,
						metadata: { status: "aborted" },
						status: { value: 0.5, comment: "aborted during retry" },
					};
				}
				return result ?? { message: null };
			},

			// "Request changes" in the edit confirmation modal: send the feedback
			// back to the model now that this turn is saved.
			onSaved: () => {
				const requestInfo = takeEditFeedback?.();
				if (requestInfo) setPendingEditFeedback(requestInfo);
			},

			onSettled: (turn, { client, autoSwitchedToImage, originalModel }) => {
				if (autoSwitchedToImage) client.setModel(originalModel);
				// The stream owns the executor once it is backgrounded.
				if (!turn.isActive() && mcpCleanupRef.executor) {
					void mcpCleanupRef.executor.cleanup().catch(() => {});
				}
			},
		});
	};

	// Stop message generation
	const stopMessage = () => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}
		// Always reset loading state to ensure user can continue
		// even if abort signal is not properly handled by the stream
		setIsLoading(false);
		abortControllerRef.current = null;
	};

	// Compact/compress conversation history
	// Saves current chat as-is, then starts a new chat with the summary as context
	const handleCompact = async () => {
		if (messages.length < 2 || isLoading || isCompacting) return;

		const client = getGeminiClient();
		if (!client) {
			new Notice(t("chat.clientNotInitialized"));
			return;
		}

		setIsCompacting(true);

		try {
			// Save current chat first (preserves full history)
			await saveCurrentChat(messages);

			// Build conversation text for summarization
			const conversationText = messages.map(msg => {
				const role = msg.role === "user" ? "User" : "Assistant";
				return `${role}: ${msg.content}`;
			}).join("\n\n");

			// Create summarization request
			const summaryPrompt: Message = {
				role: "user",
				content: `Summarize the following conversation concisely. Preserve key information, decisions, file paths, and context that would be needed to continue the conversation. Output the summary in the same language as the conversation.\n\n---\n${conversationText}\n---`,
				timestamp: Date.now(),
			};

			const compactTraceId = tracing.traceStart("chat-compact", {
				sessionId: currentChatId ?? undefined,
				input: `Compacting ${messages.length} messages`,
				metadata: { messageCount: messages.length, pluginVersion: plugin.manifest.version },
			});
			const summary = await client.chat([summaryPrompt], "You are a conversation summarizer. Output only the summary without any preamble.", compactTraceId);

			if (!summary.trim()) {
				tracing.traceEnd(compactTraceId, { metadata: { error: "empty summary" } });
				tracing.score(compactTraceId, { name: "status", value: 0, comment: "empty summary" });
				new Notice(t("chat.compactFailed"));
				return;
			}

			tracing.traceEnd(compactTraceId, { output: summary });
			tracing.score(compactTraceId, { name: "status", value: 1, comment: "completed" });

			// Start a new chat with user's compact request and AI's summary
			const now = Date.now();
			const userMessage: Message = {
				role: "user",
				content: "/compact",
				timestamp: now,
			};
			const compactedMessage: Message = {
				role: "assistant",
				content: `[${t("chat.compactedContext")}]\n\n${summary}`,
				timestamp: now + 1,
			};

			const newMessages = [userMessage, compactedMessage];
			const newChatId = generateChatId();
			setCurrentChatId(newChatId);
			setMessages(newMessages);

			// Save as a new chat with explicit new ID (avoids stale closure of currentChatId)
			await saveCurrentChat(newMessages, { chatId: newChatId });

			new Notice(t("chat.compacted", { before: String(messages.length), after: "2" }));
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : t("chat.unknownError");
			new Notice(t("chat.compactFailed") + ": " + errorMsg);
		} finally {
			setIsCompacting(false);
		}
	};

	// Handle apply edit button click
	const handleApplyEdit = async (messageIndex: number) => {
		try {
			const result = await applyEdit(plugin.app);

			if (result.success) {
				// Update message status
				setMessages((prev) => {
					const newMessages = [...prev];
					const pendingEdit = newMessages[messageIndex].pendingEdit;
					if (pendingEdit) {
						newMessages[messageIndex] = {
							...newMessages[messageIndex],
							pendingEdit: {
								...pendingEdit,
								status: "applied",
							},
						};
					}
					return newMessages;
				});
				new Notice(result.message || t("message.appliedChanges"));
			} else {
				new Notice(result.error || t("message.applyChanges"));
			}
		} catch {
			new Notice(t("message.applyChanges"));
		}
	};

	// Handle discard edit button click
	const handleDiscardEdit = (messageIndex: number) => {
		try {
			const result = discardEdit(plugin.app);

			if (result.success) {
				// Update message status
				setMessages((prev) => {
					const newMessages = [...prev];
					const pendingEdit = newMessages[messageIndex].pendingEdit;
					if (pendingEdit) {
						newMessages[messageIndex] = {
							...newMessages[messageIndex],
							pendingEdit: {
								...pendingEdit,
								status: "discarded",
							},
						};
					}
					return newMessages;
				});
				new Notice(result.message || t("message.discardedChanges"));
			} else {
				new Notice(result.error || t("message.discardChanges"));
			}
		} catch {
			new Notice(t("message.discardChanges"));
		}
	};

	const handleOpenDashboard = useCallback(() => {
		if (!currentDashboard) return;
		void plugin.app.workspace.getLeaf(true).openFile(currentDashboard);
	}, [plugin, currentDashboard]);

	const handleCreateDashboard = useCallback(() => {
		void promptForValue(plugin.app, t("dashboard.createNamePrompt"), "Dashboard", false).then((name) => {
			if (name === null) return;
			void plugin.createDashboard(name).then((file) => {
				if (file) {
					setCurrentDashboard(file);
					setActiveContextSkillPath(DASHBOARD_SKILL_PATH);
					return;
				}
				window.setTimeout(() => {
					const activeFile = plugin.app.workspace.getActiveFile();
					if (activeFile?.extension === "dashboard") {
						setCurrentDashboard(activeFile);
						setActiveContextSkillPath(DASHBOARD_SKILL_PATH);
					}
				}, 100);
			});
		});
	}, [plugin]);

	const handleAskGeminiHelperHelp = useCallback(() => {
		const builtinOkfBundle = getBuiltinOkfBundle();
		setActiveOkfBundleIds(prev =>
			prev.includes(builtinOkfBundle.id) ? prev : [...prev, builtinOkfBundle.id]
		);
		inputAreaRef.current?.setInputValue(t("chat.helpQuestionDraft"));
		inputAreaRef.current?.focus();
	}, []);

	return (
		<ChatLayout classPrefix="gemini-helper" modifiers={[isKeyboardVisible && "keyboard-visible", isDecryptInputFocused && "decrypt-input-focused"]}>
			<ChatHeader classPrefix="gemini-helper">
					<SidebarWidthButton
						classPrefix="gemini-helper"
						wide={isSidebarWide}
						title={isSidebarWide ? t("chat.narrowSidebar") : t("chat.widenSidebar")}
						onClick={() => setIsSidebarWide(onToggleSidebarWidth())}
					/>
					<SaveNoteButton
						classPrefix="gemini-helper"
						state={saveNoteState}
						disabled={messages.length === 0}
						title={saveNoteState === "saved" ? t("chat.savedAsNote", { path: "" }) : t("chat.saveAsNote")}
						onClick={() => { void saveAsNote(messages); }}
					/>
					<HeaderButton classPrefix="gemini-helper" title={t("chat.newChat")} onClick={startNewChat}>
						<Plus size={16} />
					</HeaderButton>
					<HeaderButton classPrefix="gemini-helper" title={t("chat.chatHistory")} onClick={() => setShowHistory(!showHistory)}>
						<History size={16} />
					</HeaderButton>
				</ChatHeader>

			{showHistory && <HistoryList classPrefix="gemini-helper"
        entries={chatHistories.map(history => ({ ...history, dateLabel: formatHistoryDate(history.updatedAt), encrypted: history.isEncrypted }))}
        currentId={currentChatId} emptyLabel={t("chat.noChatHistory")} deleteLabel={t("common.delete")}
        onSelect={history => { void loadChat(history); }}
        onDelete={(history, event) => { void deleteChat(history.id, event); }}
        panel deleteIcon={<Trash2 size={12} />} lockIcon={<Lock size={14} className="gemini-helper-lock-icon" />}
        renderExtra={history => (decryptingChatId === history.id && (
								<div className="gemini-helper-decrypt-form">
									<input
										type="password"
										placeholder={t("chat.decryptPassword.placeholder")}
										value={decryptPassword}
										onChange={(e) => setDecryptPassword(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter" && decryptPassword) {
												void decryptAndLoadChat(history.id, decryptPassword);
											}
										}}
									/>
									<button
										onClick={() => {
											if (decryptPassword) {
												void decryptAndLoadChat(history.id, decryptPassword);
											}
										}}
									>
										{t("chat.decrypt")}
									</button>
									<button
										onClick={() => {
											setDecryptingChatId(null);
											setDecryptPassword("");
										}}
										title={t("common.cancel")}
										className="gemini-helper-decrypt-cancel"
									>
										×
									</button>
								</div>
							))}
      />}

			{isConfigReady ? (
				<>
					<MessageList
						ref={messagesContainerRef}
						messages={messages}
						streamingContent={streamingContent}
						streamingThinking={streamingThinking}
						isLoading={isLoading}
						onApplyEdit={handleApplyEdit}
						onDiscardEdit={handleDiscardEdit}
						app={plugin.app}
						currentDashboard={currentDashboard ? {
							basename: currentDashboard.basename,
							path: currentDashboard.path,
						} : null}
						onOpenDashboard={currentDashboard ? handleOpenDashboard : undefined}
						onCreateDashboard={handleCreateDashboard}
						onAskGeminiHelperHelp={handleAskGeminiHelperHelp}
					/>

					<InputArea
						ref={inputAreaRef}
						onSend={(content, attachments, skillPath) => {
							void sendMessage(content, attachments, skillPath);
						}}
						onStop={stopMessage}
						isLoading={isLoading}
						model={currentModel}
						onModelChange={handleModelChange}
						availableModels={availableModels}
						allowWebSearch={allowWebSearch}
						webSearchEnabled={webSearchEnabled}
						onWebSearchChange={handleWebSearchChange}
						ragEnabled={allowRag}
						ragSettings={allowRag ? ragSettingNames : []}
						selectedRagSetting={selectedRagSetting}
						onRagSettingChange={handleRagSettingChange}
						vaultToolMode={vaultToolMode}
						onVaultToolModeChange={handleVaultToolModeChange}
						vaultToolModeOnlyNone={false}
						reasoningEffort={selectedReasoningEffort}
						reasoningEffortOptions={reasoningEffortOptions}
						onReasoningEffortChange={handleReasoningEffortChange}
						mcpServers={mcpServers}
						onMcpServerToggle={handleMcpServerToggle}
						okfBundles={okfBundles}
						activeOkfBundleIds={activeOkfBundleIds}
						onToggleOkfBundle={(id) => {
							setActiveOkfBundleIds(prev => {
								const next = prev.includes(id)
									? prev.filter(b => b !== id)
									: [...prev, id];
								saveActiveOkfBundleIds(next);
								return next;
							});
						}}
						onVaultToolMenuOpen={() => { void refreshOkfBundles(); }}
						slashCommands={plugin.settings.slashCommands}
						onSlashCommand={handleSlashCommand}
						availableSkills={availableSkills}
						activeSkillPaths={effectiveActiveSkillPaths}
						onToggleSkill={(folderPath) => {
							if (folderPath === activeContextSkillPath && CONTEXT_BUILTIN_SKILL_PATHS.has(folderPath)) {
								setDisabledContextSkillPaths(prev => {
									const next = new Set(prev);
									if (next.has(folderPath)) next.delete(folderPath);
									else next.add(folderPath);
									return next;
								});
								setActiveSkillPaths(prev =>
									prev.filter(path => !CONTEXT_BUILTIN_SKILL_PATHS.has(path))
								);
								return;
							}
							if (
								activeContextSkillPath
								&& !disabledContextSkillPaths.has(activeContextSkillPath)
								&& CONTEXT_BUILTIN_SKILL_PATHS.has(folderPath)
							) return;
							setActiveSkillPaths(prev =>
								prev.includes(folderPath)
									? prev.filter(p => p !== folderPath)
									: [...prev, folderPath]
							);
						}}
						onCompact={() => { void handleCompact(); }}
						messageCount={messages.length}
						isCompacting={isCompacting}
						vaultFiles={vaultFiles}
						hasSelection={hasSelection}
						app={plugin.app}
						maxPreviousMessages={maxPreviousMessages}
						onMaxPreviousMessagesChange={(count) => {
							setMaxPreviousMessages(count);
							plugin.workspaceState.maxPreviousMessages = count;
							void plugin.saveWorkspaceState();
						}}
						inputHistory={sentPromptHistory}
						onInputHistoryAdd={(prompt) => {
							setSentPromptHistory(previous => {
								const next = [...previous, prompt].slice(-100);
								plugin.workspaceState.sentPromptHistory = next;
								void plugin.saveWorkspaceState();
								return next;
							});
						}}
						voiceChatSettings={voiceChatSettings}
						voiceConversation={voiceConversation}
						onAutoReadAloudChange={handleAutoReadAloudChange}
					/>
				</>
			) : (
				<div className="gemini-helper-config-required">
					<div className="gemini-helper-config-message">
						<h4>{t("chat.configRequired")}</h4>
						<p>{t("chat.configRequiredDesc")}</p>
						<ul>
							<li><strong>{t("chat.configApiKey")}</strong> - {t("chat.configApiKeyDesc")}</li>
						</ul>
						<p>{t("chat.openSettings")}</p>
					</div>
				</div>
			)}
		</ChatLayout>
	);
});

Chat.displayName = "Chat";

export default Chat;

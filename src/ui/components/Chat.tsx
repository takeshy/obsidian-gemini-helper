import {
	useState,
	useEffect,
	useRef,
	useImperativeHandle,
	forwardRef,
	useCallback,
} from "react";
import { TFile, Notice, MarkdownView, Platform } from "obsidian";
import { Plus, History, ChevronDown, Lock, FileText, Loader2, Check } from "lucide-react";
import type { GeminiHelperPlugin } from "src/plugin";
import {
	getAvailableModels,
	isModelAllowedForPlan,
	getDefaultModelForPlan,
	type Message,
	type ModelType,
	type Attachment,
	type PendingEditInfo,
	type PendingDeleteInfo,
	type PendingRenameInfo,
	type SlashCommand,
	type GeneratedImage,
	type VaultToolNoneReason,
	type McpAppInfo,
	isImageGenerationModel,
	DEFAULT_WORKSPACE_FOLDER,
} from "src/types";
import { getGeminiClient } from "src/core/gemini";
import { tracing } from "src/core/tracingHooks";
import { getEnabledTools, skillWorkflowTool } from "src/core/tools";
import { handleExecuteJavascriptTool, EXECUTE_JAVASCRIPT_TOOL } from "src/core/sandboxExecutor";
import { fetchMcpTools, createMcpToolExecutor, isMcpTool, type McpToolDefinition, type McpToolExecutor } from "src/core/mcpTools";
import { createToolExecutor } from "src/vault/toolExecutor";
import {
	getPendingEdit,
	applyEdit,
	discardEdit,
	getPendingDelete,
	applyDelete,
	discardDelete,
	getPendingRename,
	applyRename,
	discardRename,
	getPendingBulkEdit,
	applyBulkEdit,
	discardBulkEdit,
	getPendingBulkDelete,
	applyBulkDelete,
	discardBulkDelete,
	getPendingBulkRename,
	applyBulkRename,
	discardBulkRename,
} from "src/vault/notes";
import {
	promptForConfirmation,
	promptForDeleteConfirmation,
	promptForRenameConfirmation,
	promptForBulkEditConfirmation,
	promptForBulkDeleteConfirmation,
	promptForBulkRenameConfirmation,
} from "./workflow/EditConfirmationModal";
import MessageList from "./MessageList";
import InputArea, { type InputAreaHandle } from "./InputArea";
import {
	isEncryptedFile,
	decryptFileContent,
} from "src/core/crypto";
import { cryptoCache } from "src/core/cryptoCache";
import { formatError } from "src/utils/error";
import { discoverSkills, loadSkill, buildSkillSystemPrompt, collectSkillWorkflows, type SkillMetadata, type LoadedSkill, type SkillWorkflowRef } from "src/core/skillsLoader";
import { GET_WORKFLOW_SPEC_TOOL, GET_WORKFLOW_SPEC_TOOL_NAME, handleGetWorkflowSpec } from "src/workflow/workflowSpec";
import { DEFAULT_BUILTIN_SKILL_IDS, builtinFolderPath, getBuiltinSkillMetadata } from "src/core/builtinSkills";
import { parseWorkflowFromMarkdown } from "src/workflow/parser";
import { WorkflowExecutor } from "src/workflow/executor";
import { WorkflowExecutionModal } from "./workflow/WorkflowExecutionModal";
import { promptForFile, promptForAnyFile, promptForNewFilePath } from "./workflow/FilePromptModal";
import { promptForValue } from "./workflow/ValuePromptModal";
import { promptForSelection } from "./workflow/SelectionPromptModal";
import { promptForDialog } from "./workflow/DialogPromptModal";
import { showMcpApp } from "./workflow/McpAppModal";
import { promptForPassword } from "src/ui/passwordPrompt";
import { t } from "src/i18n";
import {
	shouldUseImageModel,
	PAID_RATE_LIMIT_RETRY_DELAYS_MS,
	sleep,
	isRateLimitError,
	buildErrorMessage,
	type ChatHistory,
} from "./chat/chatUtils";
import {
	messagesToMarkdown,
	parseMarkdownToMessages,
	formatHistoryDate,
} from "./chat/chatHistory";

export interface ChatRef {
	getActiveChat: () => TFile | null;
	setActiveChat: (chat: TFile | null) => void;
}

const MAX_BACKGROUND_STREAMS = 3;

interface ChatProps {
	plugin: GeminiHelperPlugin;
}

const Chat = forwardRef<ChatRef, ChatProps>(({ plugin }, ref) => {
	const [messages, setMessages] = useState<Message[]>([]);
	const [activeChat, setActiveChat] = useState<TFile | null>(null);
	const [currentChatId, setCurrentChatId] = useState<string | null>(null);
	const [chatHistories, setChatHistories] = useState<ChatHistory[]>([]);
	const [showHistory, setShowHistory] = useState(false);
	const [saveNoteState, setSaveNoteState] = useState<"idle" | "saving" | "saved">("idle");
	const [isLoading, setIsLoading] = useState(false);
	const [isCompacting, setIsCompacting] = useState(false);
	const [streamingContent, setStreamingContent] = useState("");
	const [streamingThinking, setStreamingThinking] = useState("");
	const [currentModel, setCurrentModel] = useState<ModelType>(plugin.getSelectedModel());
	const [apiPlan, setApiPlan] = useState(plugin.settings.apiPlan);
	const [ragEnabledState, setRagEnabledState] = useState(plugin.settings.ragEnabled);
	const [ragSettingNames, setRagSettingNames] = useState<string[]>(plugin.getRagSettingNames());
	const [selectedRagSetting, setSelectedRagSetting] = useState<string | null>(
		plugin.workspaceState.selectedRagSetting
	);
	// Vault tool mode: "all" = use all tools, "noSearch" = exclude search_notes/list_notes, "none" = no vault tools
	// Gemma 4 + Web Search: must disable function calling tools
	const initialGemma4WebSearch = plugin.getSelectedModel().toLowerCase().includes("gemma-4")
		&& plugin.workspaceState.selectedRagSetting === "__websearch__";
	const [vaultToolMode, setVaultToolMode] = useState<"all" | "noSearch" | "none">(initialGemma4WebSearch ? "none" : "all");
	// Reason why vault tools are "none" - determines whether MCP should also be disabled
	const [, setVaultToolNoneReason] = useState<VaultToolNoneReason | null>(initialGemma4WebSearch ? "manual" : null);
	// MCP servers state: local copy with per-server enabled state (for chat session)
	const [mcpServers, setMcpServers] = useState(() =>
		initialGemma4WebSearch
			? plugin.settings.mcpServers.map(s => ({ ...s, enabled: false }))
			: [...plugin.settings.mcpServers]
	);
	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const abortControllerRef = useRef<AbortController | null>(null);
	const inputAreaRef = useRef<InputAreaHandle>(null);
	const currentSlashCommandRef = useRef<SlashCommand | null>(null);
	const mcpExecutorRef = useRef<McpToolExecutor | null>(null);
	// Session ID to track which chat session owns the UI; incremented on startNewChat/loadChat
	// so background streams can detect they've been detached from the UI.
	const activeSessionIdRef = useRef(0);
	// AbortControllers for background (detached) streams, capped at MAX_BACKGROUND_STREAMS.
	const backgroundAbortControllersRef = useRef<AbortController[]>([]);
	// Chat IDs that have been deleted — background streams check this to avoid
	// resurrecting a deleted chat when they complete.
	const deletedChatIdsRef = useRef<Set<string>>(new Set());
	// Preserve the plugin-level last active chat across the component's first render
	// so the mount-time restore effect can read it before sync-back starts.
	const initialLastActiveChatIdRef = useRef<string | null>(plugin.lastActiveChatId);
	const hasCompletedInitialRestoreRef = useRef(false);
	const [vaultFiles, setVaultFiles] = useState<string[]>([]);
	const [hasSelection, setHasSelection] = useState(false);
	const [hasApiKey, setHasApiKey] = useState(!!plugin.settings.googleApiKey);
	const [decryptingChatId, setDecryptingChatId] = useState<string | null>(null);
	const [decryptPassword, setDecryptPassword] = useState("");
	// Pending feedback for edit rejection (to be sent after state update)
	const [pendingEditFeedback, setPendingEditFeedback] = useState<{ filePath: string; request: string } | null>(null);
	// Thinking toggles for Flash / Flash Lite models
	const [thinkFlash, setThinkFlash] = useState(false);
	const [thinkFlashLite, setThinkFlashLite] = useState(true);

	// Agent Skills state (initialise with built-in skills so they are available synchronously)
	const [availableSkills, setAvailableSkills] = useState<SkillMetadata[]>(getBuiltinSkillMetadata);
	const [activeSkillPaths, setActiveSkillPaths] = useState<string[]>(
		() => DEFAULT_BUILTIN_SKILL_IDS.map(builtinFolderPath)
	);

	// Check if configuration is ready (API key set)
	const isConfigReady = hasApiKey;

	const allowWebSearch = true;
	const allowRag = ragEnabledState;

	// Resolve thinking toggle for a given model name
	const getThinkingToggle = (model: string): boolean | undefined => {
		const m = model.toLowerCase();
		if (m.includes("flash-lite")) return thinkFlashLite ? true : undefined;
		if (m.includes("flash") && !m.includes("pro")) return thinkFlash ? true : undefined;
		return undefined;
	};

	// Build available models list
	const availableModels = getAvailableModels(apiPlan);

	useImperativeHandle(ref, () => ({
		getActiveChat: () => activeChat,
		setActiveChat: (chat: TFile | null) => setActiveChat(chat),
	}));

	// Generate chat ID
	const generateChatId = () => `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

	// Get chat history folder path
	const getChatHistoryFolder = () => {
		return plugin.settings.workspaceFolder || DEFAULT_WORKSPACE_FOLDER;
	};

	// Get chat file path
	const getChatFilePath = (chatId: string) => {
		return `${getChatHistoryFolder()}/${chatId}.md`;
	};

	// Save current chat as a note file (in vault root)
	const handleSaveAsNote = useCallback(async () => {
		if (saveNoteState !== "idle" || messages.length === 0) return;
		setSaveNoteState("saving");
		try {
			const chatTitle = messages[0].content.slice(0, 50) + (messages[0].content.length > 50 ? "..." : "");
			const markdown = await messagesToMarkdown(messages, chatTitle, messages[0].timestamp, plugin.settings.encryption);
			const now = new Date();
			const pad = (n: number) => String(n).padStart(2, "0");
			const fileName = `chat-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.md`;
			await plugin.app.vault.create(fileName, markdown);
			new Notice(t("chat.savedAsNote", { path: fileName }));
			setSaveNoteState("saved");
			setTimeout(() => setSaveNoteState("idle"), 3000);
		} catch (error) {
			new Notice(t("common.error") + ": " + formatError(error));
			setSaveNoteState("idle");
		}
	}, [saveNoteState, messages, plugin]);

	// Load chat histories from folder
	const loadChatHistories = useCallback(async () => {
		if (!plugin.settings.saveChatHistory) {
			setChatHistories([]);
			return;
		}

		try {
			const folder = getChatHistoryFolder();
			const folderExists = await plugin.app.vault.adapter.exists(folder);

			if (!folderExists) {
				setChatHistories([]);
				return;
			}

			const listed = await plugin.app.vault.adapter.list(folder);
			const files = listed.files.filter(f => f.endsWith(".md") || f.endsWith(".md.encrypted"));
			const histories: ChatHistory[] = [];

			for (const filePath of files) {
				try {
					const content = await plugin.app.vault.adapter.read(filePath);
					const stat = await plugin.app.vault.adapter.stat(filePath);
					const fileName = filePath.split("/").pop() || "";
					const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

					// Extract chatId from filename (handles both .md and .md.encrypted)
					const chatId = fileName.replace(/\.md(\.encrypted)?$/, "");
					const ctime = stat?.ctime ?? 0;
					const mtime = stat?.mtime ?? 0;

					// Check if content is encrypted (YAML frontmatter format)
					if (isEncryptedFile(content)) {
						histories.push({
							id: chatId,
							title: t("chat.encryptedChat"),
							messages: [],
							createdAt: ctime,
							updatedAt: mtime,
							isEncrypted: true,
						});
					} else if (frontmatterMatch) {
						const titleMatch = frontmatterMatch[1].match(/title:\s*"([^"]+)"/);
						const createdAtMatch = frontmatterMatch[1].match(/createdAt:\s*(\d+)/);
						const updatedAtMatch = frontmatterMatch[1].match(/updatedAt:\s*(\d+)/);
						const title = titleMatch ? titleMatch[1] : chatId;
						const createdAt = createdAtMatch ? parseInt(createdAtMatch[1]) : ctime;
						const updatedAt = updatedAtMatch ? parseInt(updatedAtMatch[1]) : mtime;

						// Parse messages from content
						const parsed = parseMarkdownToMessages(content);

						histories.push({
							id: chatId,
							title,
							messages: parsed?.messages || [],
							createdAt,
							updatedAt,
							isEncrypted: false,
						});
					}
				} catch {
					// Failed to load chat, skip
				}
			}

			setChatHistories(histories.sort((a, b) => b.updatedAt - a.updatedAt));
		} catch {
			setChatHistories([]);
		}
	}, [plugin]);

	// Save chat to Markdown file (low-level: uses functional updater to avoid stale closures)
	const saveChatToDisk = useCallback(async (
		msgs: Message[],
		chatId: string,
		opts: { foreground?: boolean } = {},
	) => {
		if (msgs.length === 0) return;
		if (!plugin.settings.saveChatHistory) return;
		// Skip if this chat was deleted while the stream was running
		if (deletedChatIdsRef.current.has(chatId)) return;

		const { foreground = false } = opts;
		const title = msgs[0].content.slice(0, 50) + (msgs[0].content.length > 50 ? "..." : "");
		const folder = getChatHistoryFolder();

		try {
			if (!(await plugin.app.vault.adapter.exists(folder))) {
				await plugin.app.vault.adapter.mkdir(folder);
			}
		} catch {
			// Folder might already exist
		}

		// Use functional updater to read the latest chatHistories without
		// depending on the outer closure (avoids stale-closure races).
		setChatHistories(prev => {
			const existing = prev.find(h => h.id === chatId);
			const createdAt = existing?.createdAt || Date.now();

			// Fire-and-forget the async disk write; state update is synchronous
			void (async () => {
				try {
					const markdown = await messagesToMarkdown(msgs, title, createdAt, plugin.settings.encryption);
					const basePath = getChatFilePath(chatId);
					const encrypted = isEncryptedFile(markdown);
					const filePath = encrypted ? basePath + ".encrypted" : basePath;
					const oldPath = encrypted ? basePath : basePath + ".encrypted";

					if (await plugin.app.vault.adapter.exists(oldPath)) {
						await plugin.app.vault.adapter.remove(oldPath);
					}
					await plugin.app.vault.adapter.write(filePath, markdown);
				} catch (e) {
					console.warn("Failed to write chat file:", chatId, e);
				}
			})();

			const newHistory: ChatHistory = {
				id: chatId,
				title,
				messages: msgs,
				createdAt,
				updatedAt: Date.now(),
			};

			const idx = prev.findIndex(h => h.id === chatId);
			let updated: ChatHistory[];
			if (idx >= 0) {
				updated = [...prev];
				updated[idx] = newHistory;
			} else {
				updated = [newHistory, ...prev];
			}
			return updated.slice(0, 50);
		});

		if (foreground) {
			setCurrentChatId(chatId);
		}
	}, [plugin]);

	// Save current (foreground) chat to Markdown file
	const saveCurrentChat = useCallback(async (msgs: Message[], overrideChatId?: string) => {
		const chatId = overrideChatId || currentChatId || generateChatId();
		await saveChatToDisk(msgs, chatId, { foreground: true });
	}, [currentChatId, saveChatToDisk]);

	// Create a stream session that tracks whether this stream still owns the UI.
	// Called at the top of sendMessage; the returned helpers centralise the
	// isActive/save/finally logic so background streams save silently.
	const createStreamSession = useCallback(() => {
		const mySessionId = activeSessionIdRef.current;
		const myChatId = currentChatId || generateChatId();
		const isActive = () => mySessionId === activeSessionIdRef.current;

		const saveResult = async (msgs: Message[]) => {
			if (isActive()) {
				setMessages(msgs);
				await saveChatToDisk(msgs, myChatId, { foreground: true });
			} else {
				await saveChatToDisk(msgs, myChatId, {});
			}
		};

		// Called in `finally` — cleans up UI state if still foreground.
		// Pass the stream's AbortController so it can be removed from
		// the background tracking list when the stream was backgrounded.
		const cleanup = (myAbortController?: AbortController | null) => {
			if (isActive()) {
				setIsLoading(false);
				setStreamingContent("");
				setStreamingThinking("");
				abortControllerRef.current = null;
			} else if (myAbortController) {
				const bgList = backgroundAbortControllersRef.current;
				backgroundAbortControllersRef.current = bgList.filter(ac => ac !== myAbortController);
			}
		};

		return { mySessionId, myChatId, isActive, saveResult, cleanup };
	}, [currentChatId, saveChatToDisk]);

	// Detach the currently running stream (if any) so it continues in the
	// background. Moves its AbortController to the background list and
	// aborts the oldest background stream if we exceed the cap.
	const detachActiveStream = useCallback(() => {
		activeSessionIdRef.current += 1;

		// Move the foreground AbortController to the background list
		if (abortControllerRef.current) {
			backgroundAbortControllersRef.current.push(abortControllerRef.current);
			abortControllerRef.current = null;
			// Abort oldest if over the cap
			while (backgroundAbortControllersRef.current.length > MAX_BACKGROUND_STREAMS) {
				const oldest = backgroundAbortControllersRef.current.shift();
				oldest?.abort();
			}
		}

		// Detach MCP executor — background stream cleans up its own copy
		mcpExecutorRef.current = null;
		setIsLoading(false);
		setStreamingContent("");
		setStreamingThinking("");
	}, []);

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

				const basePath = getChatFilePath(lastId);
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
			const files = plugin.app.vault.getMarkdownFiles().map(f => f.path);
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

	// Update hasSelection and focus input when chat gains focus
	useEffect(() => {
		const handleLeafChange = () => {
			// Small delay to let selection capture complete
			setTimeout(() => {
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
		const timer = setTimeout(() => {
			const container = messagesContainerRef.current;
			if (container) {
				container.scrollTop = container.scrollHeight;
			}
		}, 150);
		return () => clearTimeout(timer);
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
				setTimeout(() => {
					const active = document.activeElement as HTMLElement | null;
					const isStillInInput = active?.tagName === "TEXTAREA" && active?.closest(".gemini-helper-input-container");
					const isInDecryptForm = active?.tagName === "INPUT" && active?.closest(".gemini-helper-decrypt-form");
					if (!isStillInInput && !isInDecryptForm) {
						setIsKeyboardVisible(false);
					}
				}, 100);
			}
			// Track focusout from decrypt form password input
			if (target.tagName === "INPUT" && target.closest(".gemini-helper-decrypt-form")) {
				setTimeout(() => {
					const active = document.activeElement as HTMLElement | null;
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

		document.addEventListener("focusin", handleFocusIn);
		document.addEventListener("focusout", handleFocusOut);

		return () => {
			document.removeEventListener("focusin", handleFocusIn);
			document.removeEventListener("focusout", handleFocusOut);
		};
	}, []);

	// Listen for workspace state changes
	useEffect(() => {
		const handleWorkspaceStateLoaded = () => {
			setRagSettingNames(plugin.getRagSettingNames());
			setSelectedRagSetting(plugin.workspaceState.selectedRagSetting);
		};

		const handleRagSettingChanged = (name: string | null) => {
			setSelectedRagSetting(name);
		};

		plugin.settingsEmitter.on("workspace-state-loaded", handleWorkspaceStateLoaded);
		plugin.settingsEmitter.on("rag-setting-changed", handleRagSettingChanged);

		return () => {
			plugin.settingsEmitter.off("workspace-state-loaded", handleWorkspaceStateLoaded);
			plugin.settingsEmitter.off("rag-setting-changed", handleRagSettingChanged);
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

	// Handle RAG setting change from UI
	const handleRagSettingChange = (name: string | null) => {
		setSelectedRagSetting(name);
		void plugin.selectRagSetting(name);
		// Gemma 4: Web Search selected → disable function calling tools
		if (isGemma4(currentModel) && name === "__websearch__") {
			setVaultToolMode("none");
			setVaultToolNoneReason("manual");
			setMcpServers(servers => servers.map(s => ({ ...s, enabled: false })));
		}
	};

	// Handle vault tool mode change from UI
	const handleVaultToolModeChange = (mode: "all" | "noSearch" | "none") => {
		setVaultToolMode(mode);
		setVaultToolNoneReason(mode === "none" ? "manual" : null);
		// Gemma 4: vault tools enabled → clear Web Search
		if (isGemma4(currentModel) && mode !== "none" && selectedRagSetting === "__websearch__") {
			setSelectedRagSetting(null);
			void plugin.selectRagSetting(null);
		}
	};

	// Handle per-server MCP toggle from UI
	const handleMcpServerToggle = (serverName: string, enabled: boolean) => {
		setMcpServers(servers => {
			const updated = servers.map(s => s.name === serverName ? { ...s, enabled } : s);
			plugin.settings.mcpServers = updated;
			void plugin.saveSettings();
			// Gemma 4: MCP server enabled → clear Web Search
			if (isGemma4(currentModel) && enabled && selectedRagSetting === "__websearch__") {
				setSelectedRagSetting(null);
				void plugin.selectRagSetting(null);
			}
			return updated;
		});
	};

	// Handle model change from UI
	const handleModelChange = (model: ModelType) => {
		setCurrentModel(model);
		void plugin.selectModel(model);

		// Auto-adjust search setting and vault tool mode for special models
		if (isImageGenerationModel(model)) {
			// Image models: Web Search only → keep if Web Search, else None
			if (selectedRagSetting !== null && selectedRagSetting !== "__websearch__") {
				handleRagSettingChange(null);
			}
			setVaultToolMode("all");
			setVaultToolNoneReason(null);
		} else if (isGemma4(model)) {
			// Gemma 4: file_search not supported, google_search cannot combine with function calling
			if (selectedRagSetting && selectedRagSetting !== "__websearch__") {
				// Clear RAG (file_search not supported)
				handleRagSettingChange(null);
			} else if (selectedRagSetting === "__websearch__") {
				// Web Search active → disable vault tools
				setVaultToolMode("none");
				setVaultToolNoneReason("manual");
				setMcpServers(servers => servers.map(s => ({ ...s, enabled: false })));
			}
		} else {
			// Normal models: restore vault tools
			setVaultToolMode("all");
			setVaultToolNoneReason(null);
		}
	};

	// Resolve slash command variables
	const resolveCommandVariables = async (template: string): Promise<string> => {
		let result = template;

		// Resolve {content} - active note content with file info
		if (result.includes("{content}")) {
			const activeFile = plugin.app.workspace.getActiveFile();
			if (activeFile) {
				const content = await plugin.app.vault.read(activeFile);
				const contentText = `From "${activeFile.path}":\n${content}`;
				result = result.replace(/\{content\}/g, contentText);
			} else {
				result = result.replace(/\{content\}/g, "[No active note]");
			}
		}

		// Resolve {selection} - selected text in editor with optional location info
		// Falls back to {content} if no selection
		if (result.includes("{selection}")) {
			let selection = "";
			let locationInfo: { filePath: string; startLine: number; endLine: number } | null = null;

			// First try to get selection from current active view
			const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
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

			// Fallback to cached selection (captured before focus changed to chat)
			if (!selection) {
				selection = plugin.getLastSelection();
				locationInfo = plugin.getSelectionLocation();
			}

			// Build selection text with location info
			let selectionText: string;
			if (selection && locationInfo) {
				const lineInfo = locationInfo.startLine === locationInfo.endLine
					? `Line ${locationInfo.startLine}`
					: `Lines ${locationInfo.startLine}-${locationInfo.endLine}`;
				// Format as quote block for clear boundary
				const quotedSelection = selection.split("\n").map(line => `> ${line}`).join("\n");
				selectionText = `From "${locationInfo.filePath}" (${lineInfo}):\n${quotedSelection}`;
			} else {
				// Fallback to active note content if no selection
				const activeFile = plugin.app.workspace.getActiveFile();
				if (activeFile) {
					const content = await plugin.app.vault.read(activeFile);
					selectionText = `From "${activeFile.path}":\n${content}`;
				} else {
					selectionText = "[No selection or active note]";
				}
			}

			result = result.replace(/\{selection\}/g, selectionText);
		}

		return result;
	};

	// Resolve message variables (for regular messages)
	const resolveMessageVariables = async (content: string): Promise<string> => {
		let result = content;

		// Resolve {selection} and {content} using the same logic as slash commands
		result = await resolveCommandVariables(result);

		// Resolve file paths - read file content and insert it
		const filePathPattern = /(?:^|\s)([\w/-]+\.md)(?:\s|$)/g;
		const matches = [...result.matchAll(filePathPattern)];

		for (const match of matches) {
			const filePath = match[1];
			const file = plugin.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				try {
					const fileContent = await plugin.app.vault.read(file);
					const replacement = `\n\n--- Content of "${filePath}" ---\n${fileContent}\n--- End of "${filePath}" ---\n\n`;
					result = result.replace(filePath, replacement);
				} catch {
					// File couldn't be read, leave as-is
				}
			}
		}

		return result;
	};

	// Handle slash command selection
	const handleSlashCommand = (command: SlashCommand): string => {
		// Track the current slash command for auto-apply logic
		currentSlashCommandRef.current = command;

		// Optionally change model
		const nextModel = command.model && isModelAllowedForPlan(apiPlan, command.model)
			? command.model
			: currentModel;
		if (nextModel !== currentModel) {
			setCurrentModel(nextModel);
		}

		// Optionally change search setting (null = keep current, "" = None, "__websearch__" = Web Search, other = RAG setting name)
		if (allowWebSearch && command.searchSetting !== null && command.searchSetting !== undefined) {
			const newSetting = command.searchSetting === "" ? null : command.searchSetting;
			handleRagSettingChange(newSetting);
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
		if (isLoading) {
			detachActiveStream();
		} else {
			// Bump session ID even without an active stream so that
			// pending async operations (e.g. mount-time restore) are cancelled.
			activeSessionIdRef.current += 1;
			if (mcpExecutorRef.current) {
				void mcpExecutorRef.current.cleanup();
				mcpExecutorRef.current = null;
			}
		}

		setMessages([]);
		setCurrentChatId(null);
		setActiveSkillPaths(DEFAULT_BUILTIN_SKILL_IDS.map(builtinFolderPath));
		setStreamingContent("");
		setStreamingThinking("");
		setShowHistory(false);
	};

	// Decrypt and load encrypted chat
	const decryptAndLoadChat = async (chatId: string, password: string) => {
		if (isLoading) {
			detachActiveStream();
		} else {
			activeSessionIdRef.current += 1;
		}
		try {
			// Try .md.encrypted first, then fall back to .md
			const basePath = getChatFilePath(chatId);
			let file = plugin.app.vault.getAbstractFileByPath(basePath + ".encrypted");
			if (!(file instanceof TFile)) {
				file = plugin.app.vault.getAbstractFileByPath(basePath);
			}
			if (!(file instanceof TFile)) {
				throw new Error("Chat file not found");
			}

			const content = await plugin.app.vault.read(file);

			// Decrypt using YAML frontmatter format
			if (!isEncryptedFile(content)) {
				throw new Error("Invalid encrypted content");
			}

			const decryptedContent = await decryptFileContent(content, password);

			// Cache the password for future decryptions in this session
			cryptoCache.setPassword(password);

			// Parse decrypted content
			const parsed = parseMarkdownToMessages(decryptedContent);
			if (!parsed) {
				throw new Error("Failed to parse decrypted content");
			}

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
		if (isLoading) {
			detachActiveStream();
		} else {
			activeSessionIdRef.current += 1;
		}
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

		// Prevent background streams from resurrecting this chat
		deletedChatIdsRef.current.add(chatId);

		// Delete the Markdown file (try both .md and .md.encrypted)
		const basePath = getChatFilePath(chatId);
		for (const path of [basePath, basePath + ".encrypted"]) {
			try {
				if (await plugin.app.vault.adapter.exists(path)) {
					await plugin.app.vault.adapter.remove(path);
				}
			} catch {
				// Failed to delete chat file
			}
		}

		setChatHistories(prev => prev.filter(h => h.id !== chatId));

		if (currentChatId === chatId) {
			startNewChat();
		}
		new Notice(t("chat.chatDeleted"));
	};

	// Send message to Gemini
	const sendMessage = async (content: string, attachments?: Attachment[], skillPath?: string) => {
		if ((!content.trim() && !skillPath && (!attachments || attachments.length === 0)) || isLoading) return;

		const { isActive, saveResult, cleanup: cleanupStream } = createStreamSession();

		const client = getGeminiClient();
		if (!client) {
			new Notice(t("chat.clientNotInitialized"));
			return;
		}

		// Set the current model (fallback if not allowed for plan)
		let allowedModel = isModelAllowedForPlan(apiPlan, currentModel)
			? currentModel
			: getDefaultModelForPlan(apiPlan);

		// Auto-switch to image model when image generation keywords detected
		let autoSwitchedToImage = false;
		const originalModel = allowedModel;
		if (!isImageGenerationModel(allowedModel) && shouldUseImageModel(content)) {
			if (isModelAllowedForPlan(apiPlan, "gemini-3.1-flash-image-preview")) {
				allowedModel = "gemini-3.1-flash-image-preview";
				autoSwitchedToImage = true;
			} else if (isModelAllowedForPlan(apiPlan, "gemini-3-pro-image-preview")) {
				allowedModel = "gemini-3-pro-image-preview";
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
		const resolvedContent = await resolveMessageVariables(content);

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

		setMessages((prev) => [...prev, userMessage]);
		setIsLoading(true);
		setStreamingContent("");
		setStreamingThinking("");

		// Create abort controller for this request
		const abortController = new AbortController();
		abortControllerRef.current = abortController;

		const traceId = tracing.traceStart("chat-message", {
			sessionId: currentChatId ?? undefined,
			metadata: {
				model: allowedModel,
				ragEnabled: allowRag,
				webSearchEnabled: selectedRagSetting === "__websearch__",
				toolsEnabled: !isImageGenerationModel(allowedModel),
				isImageGeneration: isImageGenerationModel(allowedModel),
				pluginVersion: plugin.manifest.version,
			},
			input: resolvedContent,
		});

		// Track MCP executor for background cleanup (runStreamOnce creates it locally,
		// but if the stream is backgrounded we need to clean it up in finally).
		const mcpCleanupRef: { executor: McpToolExecutor | null } = { executor: null };

		try {
			const runStreamOnce = async () => {
				const { settings } = plugin;
				const toolsEnabled = !isImageGenerationModel(allowedModel);
				const obsidianTools = toolsEnabled ? getEnabledTools({
					allowWrite: true,
					allowDelete: true,
					ragEnabled: allowRag,
				}) : [];

				// Activate skill if invoked via slash command
				let effectiveSkillPaths = activeSkillPaths;
				if (skillPath && !effectiveSkillPaths.includes(skillPath)) {
					effectiveSkillPaths = [...effectiveSkillPaths, skillPath];
					setActiveSkillPaths(effectiveSkillPaths);
				}

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
				const enabledMcpServers = mcpServers.filter(s => s.enabled);
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

				// Filter Obsidian tools based on vaultToolMode (MCP tools are not affected)
				const vaultToolNames = [
					"read_note", "create_note", "propose_edit", "propose_delete",
					"rename_note", "search_notes", "list_notes", "list_folders",
					"create_folder", "get_active_note_info", "get_rag_sync_status",
					"bulk_propose_edit", "bulk_propose_rename", "bulk_propose_delete"
				];
				const searchToolNames = ["search_notes", "list_notes"];
				const tools = allTools.filter(tool => {
					// MCP tools are always included
					if (isMcpTool(tool)) {
						return true;
					}
					// Filter Obsidian tools based on mode
					if (vaultToolMode === "none") {
						return !vaultToolNames.includes(tool.name);
					}
					if (vaultToolMode === "noSearch") {
						return !searchToolNames.includes(tool.name);
					}
					return true; // "all" mode - keep all tools
				});

				// Add run_skill_workflow tool if any active skill has workflows
				if (toolsEnabled && loadedSkillsList.some(s => s.workflows.length > 0)) {
					tools.push(skillWorkflowTool);
				}

				// Add execute_javascript tool
				if (toolsEnabled) {
					tools.push(EXECUTE_JAVASCRIPT_TOOL);
					tools.push(GET_WORKFLOW_SPEC_TOOL);
				}

				// Create context for RAG tools (Obsidian tools only)
				const obsidianToolExecutor = toolsEnabled
					? createToolExecutor(plugin.app, {
						ragSyncState: { files: plugin.ragState.files, lastFullSync: plugin.ragState.lastFullSync },
						ragFilterConfig: {
							includeFolders: plugin.ragState.includeFolders,
							excludePatterns: plugin.ragState.excludePatterns,
						},
						listNotesLimit: settings.listNotesLimit,
						maxNoteChars: settings.maxNoteChars,
					})
					: undefined;

				// Track processed edits/deletes/renames for message display
				const processedEdits: PendingEditInfo[] = [];
				const processedDeletes: PendingDeleteInfo[] = [];
				const processedRenames: PendingRenameInfo[] = [];
				// Track MCP Apps with UI for message display
				const collectedMcpApps: McpAppInfo[] = [];
				// Track pending additional request for edit feedback (use container to bypass TS narrowing)
				const pendingAdditionalRequestRef: { current: { filePath: string; request: string } | null } = { current: null };

				// Build skill workflow map for tool execution
				const skillWorkflowMap = loadedSkillsList.length > 0
					? collectSkillWorkflows(loadedSkillsList)
					: new Map();

				// Combined tool executor that routes to Obsidian, MCP, or Skill Workflow based on tool name
				const baseToolExecutor = (obsidianToolExecutor || mcpToolExecutor || skillWorkflowMap.size > 0)
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
							return await executeSkillWorkflow(
								plugin,
								args.workflowId as string,
								args.variables as string | undefined,
								skillWorkflowMap,
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
						// Otherwise use Obsidian tool executor
						if (obsidianToolExecutor) {
							return await obsidianToolExecutor(name, args);
						}
						return { error: `Unknown tool: ${name}` };
					}
					: undefined;

				// Wrap tool executor to handle propose_edit/propose_delete with immediate confirmation
				const toolExecutor = baseToolExecutor
					? async (name: string, args: Record<string, unknown>) => {
						const result = await baseToolExecutor(name, args) as Record<string, unknown>;

						// Handle propose_edit with immediate confirmation
						if (name === "propose_edit") {
							const pending = getPendingEdit();
							if (pending) {
								// Check if auto-apply is enabled (slash command with confirmEdits=false)
								const slashCommand = currentSlashCommandRef.current;
								const shouldAutoApply = slashCommand && slashCommand.confirmEdits === false;

								if (shouldAutoApply) {
									const applyResult = await applyEdit(plugin.app);
									if (applyResult.success) {
										processedEdits.push({ originalPath: pending.originalPath, status: "applied" });
										return { ...result, applied: true, message: `Applied changes to "${pending.originalPath}"` };
									} else {
										discardEdit(plugin.app);
										processedEdits.push({ originalPath: pending.originalPath, status: "failed" });
										return { ...result, applied: false, error: applyResult.error };
									}
								} else {
									const confirmResult = await promptForConfirmation(
										plugin.app,
										pending.originalPath,
										pending.newContent,
										"overwrite",
										pending.originalContent
									);

									if (confirmResult.confirmed) {
										const applyResult = await applyEdit(plugin.app);
										if (applyResult.success) {
											processedEdits.push({ originalPath: pending.originalPath, status: "applied" });
											return { ...result, applied: true, message: `Applied changes to "${pending.originalPath}"` };
										} else {
											discardEdit(plugin.app);
											processedEdits.push({ originalPath: pending.originalPath, status: "failed" });
											return { ...result, applied: false, error: applyResult.error };
										}
									} else if (confirmResult.additionalRequest !== undefined) {
										// User requested changes with feedback
										discardEdit(plugin.app);
										processedEdits.push({ originalPath: pending.originalPath, status: "discarded" });
										pendingAdditionalRequestRef.current = {
											filePath: pending.originalPath,
											request: confirmResult.additionalRequest,
										};
										return { ...result, applied: false, message: "User requested changes" };
									} else {
										discardEdit(plugin.app);
										processedEdits.push({ originalPath: pending.originalPath, status: "discarded" });
										return { ...result, applied: false, message: "User cancelled the edit" };
									}
								}
							}
						}

						// Handle propose_delete with immediate confirmation
						if (name === "propose_delete") {
							const pending = getPendingDelete();
							if (pending) {
								const confirmed = await promptForDeleteConfirmation(
									plugin.app,
									pending.path,
									pending.content
								);

								if (confirmed) {
									const deleteResult = await applyDelete(plugin.app);
									if (deleteResult.success) {
										processedDeletes.push({ path: pending.path, status: "deleted" });
										return { ...result, deleted: true, message: `Deleted "${pending.path}"` };
									} else {
										discardDelete(plugin.app);
										processedDeletes.push({ path: pending.path, status: "failed" });
										return { ...result, deleted: false, error: deleteResult.error };
									}
								} else {
									discardDelete(plugin.app);
									processedDeletes.push({ path: pending.path, status: "cancelled" });
									return { ...result, deleted: false, message: "User cancelled the deletion" };
								}
							}
						}

						// Handle rename_note (now proposeRename) with confirmation
						if (name === "rename_note") {
							const pendingRn = getPendingRename();
							if (pendingRn) {
								const confirmed = await promptForRenameConfirmation(
									plugin.app,
									pendingRn.originalPath,
									pendingRn.newPath
								);

								if (confirmed) {
									const renameResult = await applyRename(plugin.app);
									if (renameResult.success) {
										processedRenames.push({ originalPath: pendingRn.originalPath, newPath: pendingRn.newPath, status: "applied" });
										return { ...result, applied: true, message: `Renamed "${pendingRn.originalPath}" to "${pendingRn.newPath}"` };
									} else {
										discardRename(plugin.app);
										processedRenames.push({ originalPath: pendingRn.originalPath, newPath: pendingRn.newPath, status: "failed" });
										return { ...result, applied: false, error: renameResult.error };
									}
								} else {
									discardRename(plugin.app);
									processedRenames.push({ originalPath: pendingRn.originalPath, newPath: pendingRn.newPath, status: "discarded" });
									return { ...result, applied: false, message: "User cancelled the rename" };
								}
							}
						}

						// Handle bulk_propose_edit with immediate confirmation
						if (name === "bulk_propose_edit") {
							const pendingBulk = getPendingBulkEdit();
							if (pendingBulk && pendingBulk.items.length > 0) {
								const selectedPaths = await promptForBulkEditConfirmation(
									plugin.app,
									pendingBulk.items
								);

								if (selectedPaths.length > 0) {
									const applyResult = await applyBulkEdit(plugin.app, selectedPaths);
									// Track each applied edit
									for (const path of applyResult.applied) {
										processedEdits.push({ originalPath: path, status: "applied" });
									}
									for (const path of applyResult.failed) {
										processedEdits.push({ originalPath: path, status: "failed" });
									}
									return {
										...result,
										applied: applyResult.applied,
										failed: applyResult.failed,
										message: applyResult.message,
									};
								} else {
									discardBulkEdit();
									// Track all as discarded
									for (const item of pendingBulk.items) {
										processedEdits.push({ originalPath: item.path, status: "discarded" });
									}
									return { ...result, applied: [], message: "User cancelled all edits" };
								}
							}
						}

						// Handle bulk_propose_delete with immediate confirmation
						if (name === "bulk_propose_delete") {
							const pendingBulk = getPendingBulkDelete();
							if (pendingBulk && pendingBulk.items.length > 0) {
								const selectedPaths = await promptForBulkDeleteConfirmation(
									plugin.app,
									pendingBulk.items
								);

								if (selectedPaths.length > 0) {
									const deleteResult = await applyBulkDelete(plugin.app, selectedPaths);
									// Track each deleted file
									for (const path of deleteResult.deleted) {
										processedDeletes.push({ path, status: "deleted" });
									}
									for (const path of deleteResult.failed) {
										processedDeletes.push({ path, status: "failed" });
									}
									return {
										...result,
										deleted: deleteResult.deleted,
										failed: deleteResult.failed,
										message: deleteResult.message,
									};
								} else {
									discardBulkDelete();
									// Track all as cancelled
									for (const item of pendingBulk.items) {
										processedDeletes.push({ path: item.path, status: "cancelled" });
									}
									return { ...result, deleted: [], message: "User cancelled all deletions" };
								}
							}
						}

						// Handle bulk_propose_rename with immediate confirmation
						if (name === "bulk_propose_rename") {
							const pendingBulk = getPendingBulkRename();
							if (pendingBulk && pendingBulk.items.length > 0) {
								const selectedPaths = await promptForBulkRenameConfirmation(
									plugin.app,
									pendingBulk.items
								);

								if (selectedPaths.length > 0) {
									const renameResult = await applyBulkRename(plugin.app, selectedPaths);
									// Track each renamed file
									for (const path of renameResult.applied) {
										const item = pendingBulk.items.find(i => i.originalPath === path);
										if (item) {
											processedRenames.push({ originalPath: item.originalPath, newPath: item.newPath, status: "applied" });
										}
									}
									for (const path of renameResult.failed) {
										const item = pendingBulk.items.find(i => i.originalPath === path);
										if (item) {
											processedRenames.push({ originalPath: item.originalPath, newPath: item.newPath, status: "failed" });
										}
									}
									return {
										...result,
										applied: renameResult.applied,
										failed: renameResult.failed,
										message: renameResult.message,
									};
								} else {
									discardBulkRename();
									// Track all as discarded
									for (const item of pendingBulk.items) {
										processedRenames.push({ originalPath: item.originalPath, newPath: item.newPath, status: "discarded" });
									}
									return { ...result, applied: [], message: "User cancelled all renames" };
								}
							}
						}

						return result;
					}
					: undefined;

					// Check if Web Search or Image Generation model is selected
				const isWebSearch = allowWebSearch && selectedRagSetting === "__websearch__"
					&& (toolsEnabled || isImageGenerationModel(allowedModel));
				const isImageGeneration = isImageGenerationModel(allowedModel);

				// Pass RAG store IDs if RAG is enabled and a setting is selected (not web search)
				const ragStoreIds = allowRag && toolsEnabled && selectedRagSetting && !isWebSearch
					? plugin.getSelectedStoreIds()
					: [];

				let systemPrompt = "You are a helpful AI assistant integrated with Obsidian.";

				if (toolsEnabled) {
					systemPrompt += `

Available tools allow you to:
- Read notes from the vault
- Create new notes
- Update existing notes
- Search for notes by name or content
- List notes and folders
- Get information about the active note`;
				}

				// Add RAG sync status info if server RAG is enabled (uses FileSearchManager)
				if (allowRag && toolsEnabled) {
						systemPrompt += `
- Check RAG sync status: When users ask about imported files, use the get_rag_sync_status tool to:
  - Check a specific file's sync status (when it was imported, if it has changes)
  - List unsynced files in a directory
  - Get a summary of the vault's overall sync status`;
					}

				systemPrompt += `

Always be helpful and provide clear, concise responses. When working with notes, confirm actions and provide relevant feedback.`;

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

				const allMessages = [...messages, userMessage];

				// Use streaming with tools
				let fullContent = "";
				let thinkingContent = "";
				const toolCalls: Message["toolCalls"] = [];
				const toolResults: Message["toolResults"] = [];
				const toolsUsed: string[] = [];
				let ragUsed = false;
				let ragSources: string[] = [];
				let webSearchUsed = false;
				let imageGenerationUsed = false;
				const generatedImages: GeneratedImage[] = [];
				let streamUsage: Message["usage"] = undefined;
				let streamInteractionId: string | undefined;
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

				// Gemma 4: cannot combine google_search with function calling
				const effectiveTools = isGemma4(allowedModel) && isWebSearch ? [] : tools;

				// Use image generation stream or regular chat stream
				const chunkStream = isImageGeneration
					? client.generateImageStream(allMessages, allowedModel, systemPrompt, isWebSearch, ragStoreIds, traceId)
					: client.chatWithToolsStream(
						allMessages,
						effectiveTools,
						systemPrompt,
						toolsEnabled ? toolExecutor : undefined,
						ragStoreIds,
						isWebSearch,
						{
							ragTopK: settings.ragTopK,
							functionCallLimits: {
								maxFunctionCalls: settings.maxFunctionCalls,
								functionCallWarningThreshold: settings.functionCallWarningThreshold,
							},
							disableTools: !toolsEnabled,
							enableThinking: getThinkingToggle(allowedModel),
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

				switch (chunk.type) {
					case "text":
						fullContent += chunk.content || "";
						if (isActive()) setStreamingContent(fullContent);
						break;

					case "thinking":
						thinkingContent += chunk.content || "";
						if (isActive()) setStreamingThinking(thinkingContent);
						break;

					case "tool_call":
						if (chunk.toolCall) {
							toolCalls.push(chunk.toolCall);
							// ツール名を記録（重複なし）
							if (!toolsUsed.includes(chunk.toolCall.name)) {
								toolsUsed.push(chunk.toolCall.name);
							}
						}
						break;

					case "tool_result":
						if (chunk.toolResult) {
							toolResults.push(chunk.toolResult);
						}
						break;

					case "rag_used":
						ragUsed = true;
						if (chunk.ragSources) {
							ragSources = chunk.ragSources;
						}
						break;

					case "web_search_used":
						webSearchUsed = true;
						break;

					case "image_generated":
						imageGenerationUsed = true;
						if (chunk.generatedImage) {
							generatedImages.push(chunk.generatedImage);
						}
						break;

					case "error":
						throw new Error(chunk.error || "Unknown error");

					case "done":
						// Capture usage data and interaction ID from the final chunk
						if (chunk.usage) {
							streamUsage = chunk.usage;
						}
						if (chunk.interactionId) {
							streamInteractionId = chunk.interactionId;
						}
						break;
				}
			}

				// If stopped, add partial message if any content was received
				if (stopped && fullContent) {
					fullContent += `\n\n${t("chat.generationStopped")}`;
				}

				// Get processed edit/delete/rename info from tool executor (already confirmed during tool execution)
				const pendingEditInfo = processedEdits.length > 0 ? processedEdits[processedEdits.length - 1] : undefined;
				const pendingDeleteInfo = processedDeletes.length > 0 ? processedDeletes[processedDeletes.length - 1] : undefined;
				const pendingRenameInfo = processedRenames.length > 0 ? processedRenames[processedRenames.length - 1] : undefined;

				// Always clear the slash command ref after message processing
				currentSlashCommandRef.current = null;

				// Add assistant message
				const assistantMessage: Message = {
					role: "assistant",
					content: fullContent,
					timestamp: Date.now(),
					model: allowedModel,
					toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
					skillsUsed: skillsUsedNames.length > 0 ? skillsUsedNames : undefined,
					pendingEdit: pendingEditInfo,
					pendingDelete: pendingDeleteInfo,
					pendingRename: pendingRenameInfo,
					toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
					toolResults: toolResults.length > 0 ? toolResults : undefined,
					ragUsed: ragUsed || undefined,
					ragSources: ragSources.length > 0 ? ragSources : undefined,
					webSearchUsed: webSearchUsed || undefined,
					imageGenerationUsed: imageGenerationUsed || undefined,
					generatedImages: generatedImages.length > 0 ? generatedImages : undefined,
					thinking: thinkingContent || undefined,
					mcpApps: collectedMcpApps.length > 0 ? collectedMcpApps : undefined,
					usage: streamUsage,
					elapsedMs: Date.now() - startTime,
					interactionId: streamInteractionId,
				};

				const newMessages = [...messages, userMessage, assistantMessage];
				await saveResult(newMessages);

				tracing.traceEnd(traceId, {
					output: fullContent,
					metadata: {
						toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
						ragUsed,
						ragSources: ragSources.length > 0 ? ragSources : undefined,
						webSearchUsed,
						imageGenerationUsed,
						stopped,
					},
				});
				tracing.score(traceId, {
					name: "status",
					value: stopped ? 0.5 : 1,
					comment: stopped ? "stopped by user" : "completed",
				});

				// Check if user requested changes with feedback - use state to trigger send after re-render
				if (isActive() && pendingAdditionalRequestRef.current) {
					const requestInfo = pendingAdditionalRequestRef.current;
					pendingAdditionalRequestRef.current = null; // Clear to prevent re-sending
					// Set state to trigger useEffect which will send the message after messages state is updated
					setPendingEditFeedback(requestInfo);
				}
			};

			const retryDelays = apiPlan === "paid" ? PAID_RATE_LIMIT_RETRY_DELAYS_MS : [];
			let retryCount = 0;

			while (true) {
				try {
					await runStreamOnce();
					break;
				} catch (error) {
					if (abortController.signal.aborted) {
						if (isActive()) {
							setStreamingContent("");
							setStreamingThinking("");
						}
						tracing.traceEnd(traceId, { metadata: { status: "aborted" } });
						tracing.score(traceId, { name: "status", value: 0.5, comment: "aborted during retry" });
						return;
					}
					if (apiPlan === "paid" && isRateLimitError(error) && retryCount < retryDelays.length) {
						const delayMs = retryDelays[retryCount];
						retryCount += 1;
						if (isActive()) {
							setStreamingContent("");
							setStreamingThinking("");
						}
						new Notice(
							t("chat.rateLimitRetrying", {
								seconds: String(Math.ceil(delayMs / 1000)),
								attempt: String(retryCount),
								max: String(retryDelays.length),
							})
						);
						await sleep(delayMs);
						continue;
					}
					throw error;
				}
			}
		} catch (error) {
			const errorMessageText = buildErrorMessage(error, apiPlan);
			const errorMessage: Message = {
				role: "assistant",
				content: errorMessageText,
				timestamp: Date.now(),
			};
			await saveResult([...messages, userMessage, errorMessage]);
			tracing.traceEnd(traceId, {
				output: errorMessageText,
				metadata: { error: true },
			});
			tracing.score(traceId, {
				name: "status",
				value: 0,
				comment: errorMessageText,
			});
		} finally {
			// Restore original model if auto-switched to image model
			if (autoSwitchedToImage) {
				client.setModel(originalModel);
			}
			cleanupStream(abortController);
			// Clean up MCP executor if stream was backgrounded
			if (!isActive() && mcpCleanupRef.executor) {
				void mcpCleanupRef.executor.cleanup().catch(() => {});
			}
		}
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
			await saveCurrentChat(newMessages, newChatId);

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

	const chatClassName = `gemini-helper-chat${isKeyboardVisible ? " keyboard-visible" : ""}${isDecryptInputFocused ? " decrypt-input-focused" : ""}`;

	return (
		<div className={chatClassName}>
			<div className="gemini-helper-chat-header">
				<h3>{t("chat.title")}</h3>
				<div className="gemini-helper-header-actions">
					<button
						className="gemini-helper-icon-btn"
						onClick={() => { void handleSaveAsNote(); }}
						disabled={saveNoteState === "saving" || messages.length === 0}
						title={saveNoteState === "saved" ? t("chat.savedAsNote", { path: "" }) : t("chat.saveAsNote")}
					>
						{saveNoteState === "idle" && <FileText size={18} />}
						{saveNoteState === "saving" && <Loader2 size={18} className="gemini-helper-spinner" />}
						{saveNoteState === "saved" && <Check size={18} />}
					</button>
					<button
						className="gemini-helper-icon-btn"
						onClick={startNewChat}
						title={t("chat.newChat")}
					>
						<Plus size={18} />
					</button>
					<button
						className="gemini-helper-icon-btn"
						onClick={() => setShowHistory(!showHistory)}
						title={t("chat.chatHistory")}
					>
						<History size={18} />
						{showHistory && <ChevronDown size={14} className="gemini-helper-chevron" />}
					</button>
				</div>
			</div>

			{showHistory && chatHistories.length > 0 && (
				<div className="gemini-helper-history-dropdown">
					{chatHistories.map((history) => (
						<div key={history.id}>
							<div
								className={`gemini-helper-history-item ${currentChatId === history.id ? "active" : ""} ${history.isEncrypted ? "encrypted" : ""}`}
								onClick={() => loadChat(history)}
							>
								<div className="gemini-helper-history-title">
									{history.isEncrypted && <Lock size={14} className="gemini-helper-lock-icon" />}
									{history.title}
								</div>
								<div className="gemini-helper-history-meta">
									<span className="gemini-helper-history-date">
										{formatHistoryDate(history.updatedAt)}
									</span>
									<button
										className="gemini-helper-history-delete"
										onClick={(e) => {
											void deleteChat(history.id, e);
										}}
										title={t("common.delete")}
									>
										×
									</button>
								</div>
							</div>
							{decryptingChatId === history.id && (
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
							)}
						</div>
					))}
				</div>
			)}

			{showHistory && chatHistories.length === 0 && (
				<div className="gemini-helper-history-dropdown">
					<div className="gemini-helper-history-empty">{t("chat.noChatHistory")}</div>
				</div>
			)}

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
						alwaysThink={getThinkingToggle(currentModel) === true}
						app={plugin.app}
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
						ragEnabled={allowRag}
						ragSettings={allowRag ? ragSettingNames : []}
						selectedRagSetting={selectedRagSetting}
						onRagSettingChange={handleRagSettingChange}
						vaultToolMode={vaultToolMode}
						onVaultToolModeChange={handleVaultToolModeChange}
						vaultToolModeOnlyNone={false}
						thinkFlash={thinkFlash}
						thinkFlashLite={thinkFlashLite}
						onThinkFlashChange={setThinkFlash}
						onThinkFlashLiteChange={setThinkFlashLite}
						mcpServers={mcpServers}
						onMcpServerToggle={handleMcpServerToggle}
						slashCommands={plugin.settings.slashCommands}
						onSlashCommand={handleSlashCommand}
						availableSkills={availableSkills}
						activeSkillPaths={activeSkillPaths}
						onToggleSkill={(folderPath) => {
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
		</div>
	);
});

Chat.displayName = "Chat";

/**
 * Execute a skill workflow with interactive modal and return results.
 */
async function executeSkillWorkflow(
	plugin: GeminiHelperPlugin,
	workflowId: string,
	variablesJson: string | undefined,
	skillWorkflowMap: Map<string, {
		skill: LoadedSkill;
		workflowRef: SkillWorkflowRef;
		vaultPath: string;
	}>,
): Promise<Record<string, unknown>> {
	const entry = skillWorkflowMap.get(workflowId);
	if (!entry) {
		const available = [...skillWorkflowMap.keys()].join(", ");
		return { error: `Unknown workflow ID: ${workflowId}. Available: ${available}` };
	}

	const { vaultPath } = entry;
	const workflowDisplayName = vaultPath.substring(vaultPath.lastIndexOf("/") + 1).replace(/\.md$/, "") || workflowId;

	// Read workflow file
	const file = plugin.app.vault.getAbstractFileByPath(vaultPath);
	if (!(file instanceof TFile)) {
		return { error: `Workflow file not found: ${vaultPath}`, workflowId, workflowPath: vaultPath };
	}

	const content = await plugin.app.vault.read(file);

	// Parse workflow
	let workflow;
	try {
		workflow = parseWorkflowFromMarkdown(content);
	} catch (e) {
		return { error: `Failed to parse workflow: ${e instanceof Error ? e.message : String(e)}`, workflowId, workflowPath: vaultPath };
	}

	// Build input variables
	const variables = new Map<string, string | number>();
	if (variablesJson) {
		try {
			const parsed = JSON.parse(variablesJson) as Record<string, string | number>;
			for (const [key, value] of Object.entries(parsed)) {
				variables.set(key, value);
			}
		} catch {
			return { error: `Invalid variables JSON: ${variablesJson}`, workflowId, workflowPath: vaultPath };
		}
	}

	// Execute with the same execution modal as the normal workflow panel
	const executor = new WorkflowExecutor(plugin.app, plugin);
	const abortController = new AbortController();

	const modal = new WorkflowExecutionModal(
		plugin.app, workflow, workflowDisplayName, abortController, () => {},
	);
	modal.open();

	let executionModalRef: WorkflowExecutionModal | null = modal;

	const callbacks = {
		promptForFile: (defaultPath?: string, title?: string) => promptForFile(plugin.app, title || defaultPath || "Select a file"),
		promptForAnyFile: (extensions?: string[], defaultPath?: string, title?: string) =>
			promptForAnyFile(plugin.app, extensions, title || defaultPath || "Select a file"),
		promptForNewFilePath: (extensions?: string[], defaultPath?: string, title?: string) =>
			promptForNewFilePath(plugin.app, extensions, defaultPath, title),
		promptForSelection: () => promptForSelection(plugin.app, "Select text"),
		promptForValue: (prompt: string, defaultValue?: string, multiline?: boolean) =>
			promptForValue(plugin.app, prompt, defaultValue || "", multiline || false),
		promptForConfirmation: (filePath: string, content: string, mode: string, originalContent?: string) =>
			promptForConfirmation(plugin.app, filePath, content, mode, originalContent),
		promptForDialog: (title: string, message: string, options: string[], multiSelect: boolean, button1: string, button2?: string, markdown?: boolean, inputTitle?: string, defaults?: { input?: string; selected?: string[] }, multiline?: boolean) =>
			promptForDialog(plugin.app, title, message, options, multiSelect, button1, button2, markdown, inputTitle, defaults, multiline),
		openFile: async (notePath: string) => {
			const noteFile = plugin.app.vault.getAbstractFileByPath(notePath);
			if (noteFile instanceof TFile) {
				await plugin.app.workspace.getLeaf().openFile(noteFile);
			}
		},
		promptForPassword: async () => {
			const cached = cryptoCache.getPassword();
			if (cached) return cached;
			return promptForPassword(plugin.app);
		},
		showMcpApp: async (mcpApp: McpAppInfo) => {
			if (executionModalRef) {
				await showMcpApp(plugin.app, mcpApp);
			}
		},
		onThinking: (nodeId: string, thinking: string) => {
			executionModalRef?.updateThinking(nodeId, thinking);
		},
	};

	try {
		const result = await executor.execute(
			workflow,
			{ variables },
			(log) => executionModalRef?.updateFromLog(log),
			{
				workflowPath: vaultPath,
				workflowName: workflowDisplayName,
				recordHistory: true,
				abortSignal: abortController.signal,
			},
			callbacks,
		);

		modal.setComplete(true);

		// Collect output variables
		const outputVars: Record<string, string | number> = {};
		result.context.variables.forEach((value, key) => {
			// Skip internal variables
			if (!key.startsWith("__")) {
				outputVars[key] = value;
			}
		});

		// Collect log summaries
		const logs = result.context.logs.map(log => ({
			node: log.nodeType,
			status: log.status,
			message: log.message,
		}));

		// Extract saved files from successful note/file operations
		const fileNodeTypes = new Set(["note", "file-save"]);
		const savedFiles = result.context.logs
			.filter(log => fileNodeTypes.has(log.nodeType) && log.status === "success" && typeof log.output === "string")
			.map(log => log.output as string);

		return {
			success: true,
			workflowId,
			variables: outputVars,
			logs,
			...(savedFiles.length > 0 ? { savedFiles } : {}),
		};
	} catch (e) {
		modal.setComplete(false);
		return {
			error: `Workflow execution failed: ${e instanceof Error ? e.message : String(e)}. Do not retry automatically — report the error to the user and ask how to proceed.`,
			workflowId,
			workflowPath: vaultPath,
		};
	} finally {
		executionModalRef = null;
	}
}

export default Chat;

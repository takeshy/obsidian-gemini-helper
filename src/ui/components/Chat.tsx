import {
	useState,
	useEffect,
	useRef,
	useImperativeHandle,
	forwardRef,
	useCallback,
} from "react";
import { TFile, Notice, MarkdownView, Platform } from "obsidian";
import { Plus, History, ChevronDown, FileText, Save, Lock } from "lucide-react";
import type { GeminiHelperPlugin } from "src/plugin";
import {
	DEFAULT_MODEL,
	DEFAULT_CLI_CONFIG,
	getAvailableModels,
	isModelAllowedForPlan,
	CLI_MODEL,
	CLAUDE_CLI_MODEL,
	CODEX_CLI_MODEL,
	type Message,
	type ModelType,
	type Attachment,
	type PendingEditInfo,
	type PendingDeleteInfo,
	type SlashCommand,
	type GeneratedImage,
	type ChatProvider,
	isImageGenerationModel,
} from "src/types";
import { getGeminiClient } from "src/core/gemini";
import { getEnabledTools } from "src/core/tools";
import { GeminiCliProvider, ClaudeCliProvider, CodexCliProvider } from "src/core/cliProvider";
import { createToolExecutor } from "src/vault/toolExecutor";
import {
	getPendingEdit,
	applyEdit,
	discardEdit,
	getPendingDelete,
	applyDelete,
	discardDelete,
	getPendingBulkEdit,
	applyBulkEdit,
	discardBulkEdit,
	getPendingBulkDelete,
	applyBulkDelete,
	discardBulkDelete,
} from "src/vault/notes";
import {
	promptForConfirmation,
	promptForDeleteConfirmation,
	promptForBulkEditConfirmation,
	promptForBulkDeleteConfirmation,
} from "./workflow/EditConfirmationModal";
import MessageList from "./MessageList";
import InputArea, { type InputAreaHandle } from "./InputArea";
import { EditHistoryModal } from "./EditHistoryModal";
import { getEditHistoryManager } from "src/core/editHistory";
import {
	isEncryptedFile,
	encryptFileContent,
	decryptFileContent,
} from "src/core/crypto";
import { cryptoCache } from "src/core/cryptoCache";
import { t } from "src/i18n";

const PAID_RATE_LIMIT_RETRY_DELAYS_MS = [10000, 30000, 60000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRateLimitError(error: unknown): boolean {
	if (error && typeof error === "object" && "code" in error) {
		const code = (error as { code?: unknown }).code;
		if (code === 429 || code === "429") {
			return true;
		}
	}
	if (error && typeof error === "object" && "status" in error) {
		const rawStatus = (error as { status?: unknown }).status;
		const status = typeof rawStatus === "string" || typeof rawStatus === "number"
			? String(rawStatus)
			: "";
		if (status === "429" || status.toUpperCase() === "RESOURCE_EXHAUSTED") {
			return true;
		}
	}
	const message = error instanceof Error ? error.message : String(error);
	return (
		/\b429\b/.test(message) ||
		/RESOURCE_EXHAUSTED/i.test(message) ||
		/rate limit/i.test(message)
	);
}

function buildErrorMessage(error: unknown, apiPlan: string): string {
	if (isRateLimitError(error)) {
		return apiPlan === "free" ? t("chat.rateLimitFree") : t("chat.rateLimitPaid");
	}
	const message = error instanceof Error ? error.message : t("chat.unknownError");
	return t("chat.errorOccurred", { message });
}

// CLI session info with provider tracking
interface CliSessionInfo {
	provider: ChatProvider;
	sessionId: string;
}

// Valid CLI providers that support session resumption
const VALID_CLI_PROVIDERS: ChatProvider[] = ["gemini-cli", "claude-cli", "codex-cli"];

function isValidCliProvider(provider: string): provider is ChatProvider {
	return VALID_CLI_PROVIDERS.includes(provider as ChatProvider);
}

interface ChatHistory {
	id: string;
	title: string;
	messages: Message[];
	createdAt: number;
	updatedAt: number;
	cliSession?: CliSessionInfo;  // CLI session for resumption (Claude CLI, etc.)
	isEncrypted?: boolean;  // Whether the chat is encrypted
}

export interface ChatRef {
	getActiveChat: () => TFile | null;
	setActiveChat: (chat: TFile | null) => void;
}

interface ChatProps {
	plugin: GeminiHelperPlugin;
}

const Chat = forwardRef<ChatRef, ChatProps>(({ plugin }, ref) => {
	const [messages, setMessages] = useState<Message[]>([]);
	const [activeChat, setActiveChat] = useState<TFile | null>(null);
	const [currentChatId, setCurrentChatId] = useState<string | null>(null);
	const [cliSession, setCliSession] = useState<CliSessionInfo | null>(null);  // CLI session for resumption
	const [chatHistories, setChatHistories] = useState<ChatHistory[]>([]);
	const [showHistory, setShowHistory] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
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
	const [vaultToolMode, setVaultToolMode] = useState<"all" | "noSearch" | "none">(() => {
		const ragSetting = plugin.workspaceState.selectedRagSetting;
		const initialModel = plugin.getSelectedModel();
		const isInitialFlashLite = initialModel.toLowerCase().includes("flash-lite");
		const isInitialCli = initialModel === "gemini-cli" || initialModel === "claude-cli" || initialModel === "codex-cli";
		const isInitialGemma = initialModel.toLowerCase().includes("gemma");

		// CLI and Gemma models: always "none"
		if (isInitialCli || isInitialGemma) {
			return "none";
		}
		if (ragSetting === "__websearch__") {
			return "none";
		}
		if (ragSetting && isInitialFlashLite) {
			return "none";
		}
		if (ragSetting) {
			return "noSearch";
		}
		return "all";
	});
	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const abortControllerRef = useRef<AbortController | null>(null);
	const inputAreaRef = useRef<InputAreaHandle>(null);
	const currentSlashCommandRef = useRef<SlashCommand | null>(null);
	const [vaultFiles, setVaultFiles] = useState<string[]>([]);
	const [hasSelection, setHasSelection] = useState(false);
	const [cliConfig, setCliConfig] = useState(plugin.settings.cliConfig || DEFAULT_CLI_CONFIG);
	const [hasApiKey, setHasApiKey] = useState(!!plugin.settings.googleApiKey);
	const [decryptingChatId, setDecryptingChatId] = useState<string | null>(null);
	const [decryptPassword, setDecryptPassword] = useState("");

	// CLI provider state (CLI not available on mobile)
	const geminiCliVerified = !Platform.isMobile && cliConfig.cliVerified === true;
	const claudeCliVerified = !Platform.isMobile && cliConfig.claudeCliVerified === true;
	const codexCliVerified = !Platform.isMobile && cliConfig.codexCliVerified === true;
	const anyCliVerified = geminiCliVerified || claudeCliVerified || codexCliVerified;
	const isGeminiCliMode = !Platform.isMobile && currentModel === "gemini-cli";
	const isClaudeCliMode = !Platform.isMobile && currentModel === "claude-cli";
	const isCodexCliMode = !Platform.isMobile && currentModel === "codex-cli";
	const isCliMode = isGeminiCliMode || isClaudeCliMode || isCodexCliMode;

	// Check if configuration is ready (API key set OR any CLI verified)
	const isConfigReady = hasApiKey || anyCliVerified;

	const allowWebSearch = !isCliMode;
	const allowRag = ragEnabledState && !isCliMode;

	// Build available models list (verified CLI options first)
	const baseModels = getAvailableModels(apiPlan);
	const cliModels = [
		...(geminiCliVerified ? [CLI_MODEL] : []),
		...(claudeCliVerified ? [CLAUDE_CLI_MODEL] : []),
		...(codexCliVerified ? [CODEX_CLI_MODEL] : []),
	];
	const availableModels = [...cliModels, ...baseModels];

	useImperativeHandle(ref, () => ({
		getActiveChat: () => activeChat,
		setActiveChat: (chat: TFile | null) => setActiveChat(chat),
	}));

	// Generate chat ID
	const generateChatId = () => `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

	// Get chat history folder path
	const getChatHistoryFolder = () => {
		return plugin.settings.workspaceFolder || "GeminiHelper";
	};

	// Get chat file path
	const getChatFilePath = (chatId: string) => {
		return `${getChatHistoryFolder()}/${chatId}.md`;
	};

	// Convert messages to Markdown format
	const messagesToMarkdown = async (msgs: Message[], title: string, createdAt: number, session?: CliSessionInfo): Promise<string> => {
		const date = new Date(createdAt);
		let md = `---\ntitle: "${title.replace(/"/g, '\\"')}"\ncreatedAt: ${createdAt}\nupdatedAt: ${Date.now()}\n`;
		if (session) {
			md += `cliSessionProvider: "${session.provider}"\n`;
			md += `cliSessionId: "${session.sessionId}"\n`;
		}
		md += `---\n\n`;
		md += `# ${title}\n\n`;
		md += `*Created: ${date.toLocaleString()}*\n\n---\n\n`;

		for (const msg of msgs) {
			const role = msg.role === "user" ? "**You**" : `**${msg.model || "Gemini"}**`;
			const time = new Date(msg.timestamp).toLocaleTimeString();

			md += `## ${role} (${time})\n\n`;

			// Attachments
			if (msg.attachments && msg.attachments.length > 0) {
				md += `> Attachments: ${msg.attachments.map(a => `${a.name}`).join(", ")}\n\n`;
			}

			// Tools used
			if (msg.toolsUsed && msg.toolsUsed.length > 0) {
				md += `> Tools: ${msg.toolsUsed.join(", ")}\n\n`;
			}

			md += `${msg.content}\n\n---\n\n`;
		}

		// Encrypt if encryption is enabled
		const encryption = plugin.settings.encryption;
		if (encryption?.enabled && encryption.publicKey && encryption.encryptedPrivateKey && encryption.salt) {
			try {
				// Use the new YAML frontmatter format which stores keys in the file itself
				return await encryptFileContent(
					md,
					encryption.publicKey,
					encryption.encryptedPrivateKey,
					encryption.salt
				);
			} catch (error) {
				console.error("Failed to encrypt chat:", error);
				// Fall back to unencrypted
			}
		}

		return md;
	};

	// Parse Markdown back to messages
	const parseMarkdownToMessages = (content: string): { messages: Message[]; createdAt: number; cliSession?: CliSessionInfo; isEncrypted?: boolean } | null => {
		try {
			// Check if content is encrypted (YAML frontmatter format)
			if (isEncryptedFile(content)) {
				// Return minimal info for encrypted content
				return { messages: [], createdAt: Date.now(), isEncrypted: true };
			}

			// Extract frontmatter
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
			let createdAt = Date.now();
			let cliSession: CliSessionInfo | undefined;

			if (frontmatterMatch) {
				const createdAtMatch = frontmatterMatch[1].match(/createdAt:\s*(\d+)/);
				if (createdAtMatch) {
					createdAt = parseInt(createdAtMatch[1]);
				}
				// Parse CLI session info (both provider and session ID required, provider must be valid)
				const providerMatch = frontmatterMatch[1].match(/cliSessionProvider:\s*"([^"]+)"/);
				const sessionIdMatch = frontmatterMatch[1].match(/cliSessionId:\s*"([^"]+)"/);
				if (providerMatch && sessionIdMatch && isValidCliProvider(providerMatch[1])) {
					cliSession = {
						provider: providerMatch[1],
						sessionId: sessionIdMatch[1],
					};
				}
			}

			// Parse messages
			const messages: Message[] = [];
			const messageBlocks = content.split(/\n## \*\*/);

			for (let i = 1; i < messageBlocks.length; i++) {
				const block = messageBlocks[i];
				const roleMatch = block.match(/^(You|[^*]+)\*\* \(([^)]+)\)/);

				if (roleMatch) {
					const isUser = roleMatch[1] === "You";

					// Extract content (skip attachments/tools lines)
					const lines = block.split("\n").slice(1);
					const contentLines: string[] = [];
					let inContent = false;

					for (const line of lines) {
						if (line.startsWith("> Attachments:") || line.startsWith("> Tools:")) {
							continue;
						}
						if (line === "---") {
							break;
						}
						if (line.trim() !== "" || inContent) {
							inContent = true;
							contentLines.push(line);
						}
					}

					const msgContent = contentLines.join("\n").trim();

					messages.push({
						role: isUser ? "user" : "assistant",
						content: msgContent,
						timestamp: createdAt + i * 1000, // Approximate timestamp
						model: isUser ? undefined : (roleMatch[1].trim() as ModelType),
					});
				}
			}

			return { messages, createdAt, cliSession, isEncrypted: false };
		} catch {
			return null;
		}
	};

	// Load chat histories from folder
	const loadChatHistories = useCallback(async () => {
		if (!plugin.settings.saveChatHistory) {
			setChatHistories([]);
			return;
		}

		try {
			const folder = getChatHistoryFolder();
			const folderFile = plugin.app.vault.getAbstractFileByPath(folder);

			if (!folderFile) {
				setChatHistories([]);
				return;
			}

			const files = plugin.app.vault.getMarkdownFiles().filter(f => {
				// Only include files directly in the folder (not in subdirectories)
				if (!f.path.startsWith(folder + "/")) return false;
				const relativePath = f.path.slice(folder.length + 1);
				return !relativePath.includes("/");
			});
			const histories: ChatHistory[] = [];

			for (const file of files) {
				try {
					const content = await plugin.app.vault.read(file);
					const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

					// Check if content is encrypted (YAML frontmatter format)
					if (isEncryptedFile(content)) {
						const chatId = file.basename;
						histories.push({
							id: chatId,
							title: t("chat.encryptedChat"),
							messages: [],
							createdAt: file.stat.ctime,
							updatedAt: file.stat.mtime,
							isEncrypted: true,
						});
					} else if (frontmatterMatch) {
						const titleMatch = frontmatterMatch[1].match(/title:\s*"([^"]+)"/);
						const createdAtMatch = frontmatterMatch[1].match(/createdAt:\s*(\d+)/);
						const updatedAtMatch = frontmatterMatch[1].match(/updatedAt:\s*(\d+)/);

						const chatId = file.basename;
						const title = titleMatch ? titleMatch[1] : chatId;
						const createdAt = createdAtMatch ? parseInt(createdAtMatch[1]) : file.stat.ctime;
						const updatedAt = updatedAtMatch ? parseInt(updatedAtMatch[1]) : file.stat.mtime;

						// Parse messages from content
						const parsed = parseMarkdownToMessages(content);

						histories.push({
							id: chatId,
							title,
							messages: parsed?.messages || [],
							createdAt,
							updatedAt,
							cliSession: parsed?.cliSession,
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

	// Save current chat to Markdown file
	const saveCurrentChat = useCallback(async (msgs: Message[], session?: CliSessionInfo) => {
		if (msgs.length === 0) return;
		if (!plugin.settings.saveChatHistory) return;

		const chatId = currentChatId || generateChatId();
		const title = msgs[0].content.slice(0, 50) + (msgs[0].content.length > 50 ? "..." : "");
		const folder = getChatHistoryFolder();

		// Ensure folder exists
		try {
			const folderExists = plugin.app.vault.getAbstractFileByPath(folder);
			if (!folderExists) {
				await plugin.app.vault.createFolder(folder);
			}
		} catch {
			// Folder might already exist
		}

		const existingHistory = chatHistories.find(h => h.id === chatId);
		const createdAt = existingHistory?.createdAt || Date.now();
		// Use provided session, or fall back to existing history's session
		const effectiveSession = session || existingHistory?.cliSession;

		const markdown = await messagesToMarkdown(msgs, title, createdAt, effectiveSession);
		const filePath = getChatFilePath(chatId);

		try {
			const file = plugin.app.vault.getAbstractFileByPath(filePath);

			if (file instanceof TFile) {
				await plugin.app.vault.modify(file, markdown);
			} else {
				await plugin.app.vault.create(filePath, markdown);
			}

			// Update local state
			const newHistory: ChatHistory = {
				id: chatId,
				title,
				messages: msgs,
				createdAt,
				updatedAt: Date.now(),
				cliSession: effectiveSession,
			};

			const existingIndex = chatHistories.findIndex(h => h.id === chatId);
			let newHistories: ChatHistory[];

			if (existingIndex >= 0) {
				newHistories = [...chatHistories];
				newHistories[existingIndex] = newHistory;
			} else {
				newHistories = [newHistory, ...chatHistories];
			}

			// Keep only last 50 chats
			newHistories = newHistories.slice(0, 50);

			setChatHistories(newHistories);
			setCurrentChatId(chatId);
		} catch {
			// Failed to save chat
		}
	}, [currentChatId, chatHistories, plugin]);

	// Load chat histories on mount
	useEffect(() => {
		void loadChatHistories();
	}, [loadChatHistories]);

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
			setCliConfig(plugin.settings.cliConfig || DEFAULT_CLI_CONFIG);
			setHasApiKey(!!plugin.settings.googleApiKey);
		};
		plugin.settingsEmitter.on("settings-updated", handleSettingsUpdated);
		return () => {
			plugin.settingsEmitter.off("settings-updated", handleSettingsUpdated);
		};
	}, [plugin, selectedRagSetting]);

	useEffect(() => {
		// Skip plan check for CLI models
		if (currentModel === "gemini-cli" || currentModel === "claude-cli" || currentModel === "codex-cli") return;
		if (!isModelAllowedForPlan(apiPlan, currentModel)) {
			setCurrentModel(DEFAULT_MODEL);
			void plugin.selectModel(DEFAULT_MODEL);
		}
	}, [apiPlan, currentModel, plugin]);

	// Check if current model is Flash Lite or Gemma
	const isFlashLiteModel = currentModel.toLowerCase().includes("flash-lite");
	const isGemmaModel = currentModel.toLowerCase().includes("gemma");

	// Handle RAG setting change from UI
	const handleRagSettingChange = (name: string | null) => {
		setSelectedRagSetting(name);
		void plugin.selectRagSetting(name);

		if (name === "__websearch__") {
			// Web Search: force to "none" (no vault tools)
			setVaultToolMode("none");
		} else if (name) {
			// RAG is selected
			if (isFlashLiteModel) {
				// Flash Lite + RAG: force to "none"
				setVaultToolMode("none");
			} else {
				// Other models + RAG: default to "noSearch"
				setVaultToolMode("noSearch");
			}
		} else {
			// No RAG selected: default to "all"
			setVaultToolMode("all");
		}
	};

	// Handle vault tool mode change from UI
	const handleVaultToolModeChange = (mode: "all" | "noSearch" | "none") => {
		setVaultToolMode(mode);
	};

	// Handle model change from UI
	const handleModelChange = (model: ModelType) => {
		setCurrentModel(model);
		void plugin.selectModel(model);

		const isNewModelFlashLite = model.toLowerCase().includes("flash-lite");

		const isNewModelCli = model === "gemini-cli" || model === "claude-cli" || model === "codex-cli";
		const isNewModelGemma = model.toLowerCase().includes("gemma");

		// Auto-adjust search setting and vault tool mode for CLI mode and special models
		if (isNewModelCli) {
			// CLI mode: force Search to None and Vault to Off
			if (selectedRagSetting !== null) {
				handleRagSettingChange(null);
			}
			setVaultToolMode("none");
		} else if (isNewModelGemma) {
			// Gemma: force Search to None and Vault to Off
			if (selectedRagSetting !== null) {
				handleRagSettingChange(null);
			}
			setVaultToolMode("none");
		} else if (isImageGenerationModel(model)) {
			// 2.5 Flash Image: no tools supported → force None
			// 3 Pro Image: Web Search only → keep if Web Search, else None
			if (model === "gemini-2.5-flash-image") {
				if (selectedRagSetting !== null) {
					handleRagSettingChange(null);
				}
			} else if (model === "gemini-3-pro-image-preview") {
				// Only Web Search is supported, RAG is not
				if (selectedRagSetting !== null && selectedRagSetting !== "__websearch__") {
					handleRagSettingChange(null);
				}
			}
			// Reset vault tool mode for image generation models
			setVaultToolMode("all");
		} else if (isNewModelFlashLite) {
			if (selectedRagSetting && selectedRagSetting !== "__websearch__") {
				// Flash Lite + RAG: force vault tool mode to "none"
				setVaultToolMode("none");
			} else {
				// Flash Lite without RAG: reset to "all"
				setVaultToolMode("all");
			}
		} else {
			// Normal models: check current RAG setting and reset appropriately
			if (selectedRagSetting === "__websearch__") {
				setVaultToolMode("none");
			} else if (selectedRagSetting) {
				setVaultToolMode("noSearch");
			} else {
				setVaultToolMode("all");
			}
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
				// Clear cached selection after using it
				plugin.clearLastSelection();
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
			const supportsFunctionCalling = !nextModel.toLowerCase().includes("gemma");
			if (!supportsFunctionCalling && selectedRagSetting !== null) {
				handleRagSettingChange(null);
			}
			if (allowWebSearch && supportsFunctionCalling && command.searchSetting !== null && command.searchSetting !== undefined) {
				const newSetting = command.searchSetting === "" ? null : command.searchSetting;
				handleRagSettingChange(newSetting);
			}

		// Return template as-is, variables will be resolved on send
		return command.promptTemplate;
	};

	// Start new chat
	const startNewChat = () => {
		setMessages([]);
		setCurrentChatId(null);
		setCliSession(null);  // Clear CLI session
		setStreamingContent("");
		setStreamingThinking("");
		setShowHistory(false);
	};

	// Decrypt and load encrypted chat
	const decryptAndLoadChat = async (chatId: string, password: string) => {
		try {
			const filePath = getChatFilePath(chatId);
			const file = plugin.app.vault.getAbstractFileByPath(filePath);
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
			setCliSession(parsed.cliSession || null);
			setDecryptingChatId(null);
			setDecryptPassword("");
			setShowHistory(false);
			new Notice(t("chat.decrypted"));
		} catch (error) {
			console.error("Decryption failed:", error);
			new Notice(t("chat.decryptFailed"));
		}
	};

	// Load a chat from history
	const loadChat = (history: ChatHistory) => {
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
		setCliSession(history.cliSession || null);  // Restore CLI session
		setShowHistory(false);
	};

	// Delete a chat from history
	const deleteChat = async (chatId: string, e: React.MouseEvent) => {
		e.stopPropagation();

		// Delete the Markdown file
		const filePath = getChatFilePath(chatId);
		try {
			const file = plugin.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				await plugin.app.fileManager.trashFile(file);
			}
		} catch {
			// Failed to delete chat file
		}

		const newHistories = chatHistories.filter(h => h.id !== chatId);
		setChatHistories(newHistories);

		if (currentChatId === chatId) {
			startNewChat();
		}
		new Notice(t("chat.chatDeleted"));
	};

	// Send message via CLI provider
	const sendMessageViaCli = async (content: string, attachments?: Attachment[]) => {
		const isClaudeCli = currentModel === "claude-cli";
		const isCodexCli = currentModel === "codex-cli";
		const provider = isClaudeCli
			? new ClaudeCliProvider()
			: isCodexCli
				? new CodexCliProvider()
				: new GeminiCliProvider();

		// Resolve variables in the content
		const resolvedContent = await resolveMessageVariables(content);

		// Add user message
		const userMessage: Message = {
			role: "user",
			content: resolvedContent.trim() || (attachments ? `[${attachments.length} file(s) attached]` : ""),
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

		try {
			const allMessages = [...messages, userMessage];

			// Build system prompt for CLI (read-only mode)
			const cliName = isClaudeCli ? "Claude CLI" : isCodexCli ? "Codex CLI" : "Gemini CLI";
			let systemPrompt = "You are a helpful AI assistant integrated with Obsidian.";
			systemPrompt += `\n\nNote: You are running in ${cliName} mode with limited capabilities. You can read and search vault files, but cannot modify them.`;
			systemPrompt += `\n\nVault location: ${(plugin.app.vault.adapter as unknown as { basePath?: string }).basePath || "."}`;

			if (plugin.settings.systemPrompt) {
				systemPrompt += `\n\nAdditional instructions: ${plugin.settings.systemPrompt}`;
			}

			let fullContent = "";
			let stopped = false;
			let receivedSessionId: string | null = null;

			// Get vault base path for working directory
			const vaultBasePath = (plugin.app.vault.adapter as unknown as { basePath?: string }).basePath || ".";

			// Determine current provider name
			const currentProvider: ChatProvider = isClaudeCli ? "claude-cli" : isCodexCli ? "codex-cli" : "gemini-cli";

			// Pass session ID only if provider supports it AND matches the stored session's provider
			const sessionIdToUse = provider.supportsSessionResumption &&
				cliSession?.provider === currentProvider
				? cliSession.sessionId
				: undefined;

			for await (const chunk of provider.chatStream(
				allMessages,
				systemPrompt,
				vaultBasePath,
				abortController.signal,
				sessionIdToUse
			)) {
				if (abortController.signal.aborted) {
					stopped = true;
					break;
				}

				switch (chunk.type) {
					case "text":
						fullContent += chunk.content || "";
						setStreamingContent(fullContent);
						break;

					case "session_id":
						// Capture session ID from CLI response
						if (chunk.sessionId) {
							receivedSessionId = chunk.sessionId;
						}
						break;

					case "error":
						throw new Error(chunk.error || "Unknown error");

					case "done":
						break;
				}
			}

			if (stopped && fullContent) {
				fullContent += `\n\n${t("chat.generationStopped")}`;
			}

			// Update session if we received a new one, or clear if provider changed
			const newSession: CliSessionInfo | null = receivedSessionId
				? { provider: currentProvider, sessionId: receivedSessionId }
				: (cliSession?.provider === currentProvider ? cliSession : null);

			if (receivedSessionId || cliSession?.provider !== currentProvider) {
				setCliSession(newSession);
			}

			// Add assistant message with CLI model info
			const assistantMessage: Message = {
				role: "assistant",
				content: fullContent,
				timestamp: Date.now(),
				model: currentProvider,
			};

			const newMessages = [...messages, userMessage, assistantMessage];
			setMessages(newMessages);

			// Save chat history (with session info)
			await saveCurrentChat(newMessages, newSession || undefined);
		} catch (error) {
			const errorMessageText = error instanceof Error ? error.message : t("chat.unknownError");
			const errorMessage: Message = {
				role: "assistant",
				content: t("chat.errorOccurred", { message: errorMessageText }),
				timestamp: Date.now(),
			};
			setMessages((prev) => [...prev, errorMessage]);
		} finally {
			setIsLoading(false);
			setStreamingContent("");
			setStreamingThinking("");
			abortControllerRef.current = null;
		}
	};

	// Send message to Gemini
	const sendMessage = async (content: string, attachments?: Attachment[]) => {
		if ((!content.trim() && (!attachments || attachments.length === 0)) || isLoading) return;

		// Use CLI provider if in CLI mode
		if (isCliMode) {
			await sendMessageViaCli(content, attachments);
			return;
		}

		const client = getGeminiClient();
		if (!client) {
			new Notice(t("chat.clientNotInitialized"));
			return;
		}

		// Set the current model (fallback if not allowed for plan)
		const allowedModel = isModelAllowedForPlan(apiPlan, currentModel)
			? currentModel
			: DEFAULT_MODEL;
		const supportsFunctionCalling = !allowedModel.toLowerCase().includes("gemma");
		if (allowedModel !== currentModel) {
			setCurrentModel(allowedModel);
			void plugin.selectModel(allowedModel);
		}
		client.setModel(allowedModel);

		// Resolve variables in the content ({selection}, {content}, file paths)
		const resolvedContent = await resolveMessageVariables(content);

		// Add user message
		const userMessage: Message = {
			role: "user",
			content: resolvedContent.trim() || (attachments ? `[${attachments.length} file(s) attached]` : ""),
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

		try {
			const runStreamOnce = async () => {
				const { settings } = plugin;
				const toolsEnabled = supportsFunctionCalling && !isImageGenerationModel(allowedModel);
				const allTools = toolsEnabled ? getEnabledTools({
					allowWrite: true,
					allowDelete: true,
					ragEnabled: allowRag,
				}) : [];

				// Filter tools based on vaultToolMode
				const vaultToolNames = [
					"read_note", "create_note", "propose_edit", "propose_delete",
					"rename_note", "search_notes", "list_notes", "list_folders",
					"create_folder", "get_active_note", "check_rag_sync"
				];
				const searchToolNames = ["search_notes", "list_notes"];
				const tools = allTools.filter(tool => {
					if (vaultToolMode === "none") {
						return !vaultToolNames.includes(tool.name);
					}
					if (vaultToolMode === "noSearch") {
						return !searchToolNames.includes(tool.name);
					}
					return true; // "all" mode - keep all tools
				});

				// Create context for RAG tools
				const baseToolExecutor = toolsEnabled
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

				// Track processed edits/deletes for message display
				const processedEdits: PendingEditInfo[] = [];
				const processedDeletes: PendingDeleteInfo[] = [];

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
									const confirmed = await promptForConfirmation(
										plugin.app,
										pending.originalPath,
										pending.newContent,
										"overwrite",
										pending.originalContent
									);

									if (confirmed) {
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

						return result;
					}
					: undefined;

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

				// Add RAG sync status info if RAG is enabled
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

				const supportsSystemInstruction = !allowedModel.toLowerCase().includes("gemma");
				const systemPromptForModel = supportsSystemInstruction ? systemPrompt : undefined;
				const userMessageForModel = supportsSystemInstruction
					? userMessage
					: {
						...userMessage,
						content: `${systemPrompt}\n\nUser message:\n${userMessage.content}`,
					};
				const allMessages = supportsSystemInstruction
					? [...messages, userMessage]
					: [...messages, userMessageForModel];

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

					// Check if Web Search or Image Generation model is selected
					const isWebSearch = allowWebSearch && selectedRagSetting === "__websearch__"
						&& (toolsEnabled || allowedModel === "gemini-3-pro-image-preview");
					const isImageGeneration = isImageGenerationModel(allowedModel);

					// Pass RAG store IDs if RAG is enabled and a setting is selected (not web search)
					const ragStoreIds = allowRag && toolsEnabled && selectedRagSetting && !isWebSearch
						? plugin.getSelectedStoreIds()
						: [];

				let stopped = false;

				// Use image generation stream or regular chat stream
				const chunkStream = isImageGeneration
					? client.generateImageStream(allMessages, allowedModel, systemPromptForModel, isWebSearch, ragStoreIds)
					: client.chatWithToolsStream(
						allMessages,
						tools,
						systemPromptForModel,
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
							setStreamingContent(fullContent);
							break;

						case "thinking":
							thinkingContent += chunk.content || "";
							// thinkingは別stateで管理（折りたたみ表示用）
							setStreamingThinking(thinkingContent);
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
							// Finalize the message
							break;
					}
				}

				// If stopped, add partial message if any content was received
				if (stopped && fullContent) {
					fullContent += `\n\n${t("chat.generationStopped")}`;
				}

				// Get processed edit/delete info from tool executor (already confirmed during tool execution)
				const pendingEditInfo = processedEdits.length > 0 ? processedEdits[processedEdits.length - 1] : undefined;
				const pendingDeleteInfo = processedDeletes.length > 0 ? processedDeletes[processedDeletes.length - 1] : undefined;

				// Always clear the slash command ref after message processing
				currentSlashCommandRef.current = null;

				// Add assistant message
				const assistantMessage: Message = {
					role: "assistant",
					content: fullContent,
					timestamp: Date.now(),
					model: allowedModel,
					toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
					pendingEdit: pendingEditInfo,
					pendingDelete: pendingDeleteInfo,
					toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
					toolResults: toolResults.length > 0 ? toolResults : undefined,
					ragUsed: ragUsed || undefined,
					ragSources: ragSources.length > 0 ? ragSources : undefined,
					webSearchUsed: webSearchUsed || undefined,
					imageGenerationUsed: imageGenerationUsed || undefined,
					generatedImages: generatedImages.length > 0 ? generatedImages : undefined,
					thinking: thinkingContent || undefined,
				};

				const newMessages = [...messages, userMessage, assistantMessage];
				setMessages(newMessages);

				// Save chat history
				await saveCurrentChat(newMessages);
			};

			const retryDelays = apiPlan === "paid" ? PAID_RATE_LIMIT_RETRY_DELAYS_MS : [];
			let retryCount = 0;

			while (true) {
				try {
					await runStreamOnce();
					break;
				} catch (error) {
					if (abortController.signal.aborted) {
						setStreamingContent("");
						setStreamingThinking("");
						return;
					}
					if (apiPlan === "paid" && isRateLimitError(error) && retryCount < retryDelays.length) {
						const delayMs = retryDelays[retryCount];
						retryCount += 1;
						setStreamingContent("");
						setStreamingThinking("");
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
			setMessages((prev) => [...prev, errorMessage]);
		} finally {
			setIsLoading(false);
			setStreamingContent("");
			setStreamingThinking("");
			abortControllerRef.current = null;
		}
	};

	// Stop message generation
	const stopMessage = () => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
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

	// Format date for history
	const formatHistoryDate = (timestamp: number) => {
		const date = new Date(timestamp);
		const now = new Date();
		const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

		if (diffDays === 0) {
			return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
		} else if (diffDays === 1) {
			return t("chat.yesterday");
		} else if (diffDays < 7) {
			return date.toLocaleDateString(undefined, { weekday: "short" });
		} else {
			return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
						onClick={() => {
							const activeFile = plugin.app.workspace.getActiveFile();
							if (activeFile) {
								new EditHistoryModal(plugin.app, activeFile.path).open();
							} else {
								new Notice(t("editHistory.noActiveFile"));
							}
						}}
						title={t("editHistory.showHistory")}
					>
						<FileText size={18} />
					</button>
					<button
						className="gemini-helper-icon-btn"
						onClick={() => {
							void (async () => {
								const activeFile = plugin.app.workspace.getActiveFile();
								if (!activeFile) {
									new Notice(t("editHistory.noActiveFile"));
									return;
								}
								const historyManager = getEditHistoryManager();
								if (!historyManager) {
									new Notice(t("editHistory.notInitialized"));
									return;
								}
								const entry = await historyManager.saveManualSnapshot(activeFile.path);
								if (entry) {
									new Notice(t("editHistory.saved"));
								} else {
									new Notice(t("editHistory.noChanges"));
								}
							})();
						}}
						title={t("editHistory.saveSnapshot")}
					>
						<Save size={18} />
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
						app={plugin.app}
						workspaceFolder={getChatHistoryFolder()}
					/>

					<InputArea
						ref={inputAreaRef}
						onSend={(content, attachments) => {
							void sendMessage(content, attachments);
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
						vaultToolModeOnlyNone={isCliMode || isGemmaModel || selectedRagSetting === "__websearch__" || (isFlashLiteModel && !!selectedRagSetting && selectedRagSetting !== "__websearch__")}
						slashCommands={plugin.settings.slashCommands}
						onSlashCommand={handleSlashCommand}
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
							<li><strong>{t("chat.configGeminiCli")}</strong> - {t("chat.configGeminiCliDesc")}</li>
							<li><strong>{t("chat.configClaudeCli")}</strong> - {t("chat.configClaudeCliDesc")}</li>
						</ul>
						<p>{t("chat.openSettings")}</p>
					</div>
				</div>
			)}
		</div>
	);
});

Chat.displayName = "Chat";

export default Chat;

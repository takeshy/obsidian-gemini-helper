import {
	useState,
	useEffect,
	useRef,
	useImperativeHandle,
	forwardRef,
	useCallback,
} from "react";
import { TFile, Notice, MarkdownView, Platform } from "obsidian";
import { Plus, History, ChevronDown, Lock } from "lucide-react";
import type { GeminiHelperPlugin } from "src/plugin";
import {
	DEFAULT_CLI_CONFIG,
	getAvailableModels,
	isModelAllowedForPlan,
	getDefaultModelForPlan,
	CLI_MODEL,
	CLAUDE_CLI_MODEL,
	CODEX_CLI_MODEL,
	type Message,
	type ModelType,
	type Attachment,
	type PendingEditInfo,
	type PendingDeleteInfo,
	type PendingRenameInfo,
	type SlashCommand,
	type GeneratedImage,
	type ChatProvider,
	type VaultToolNoneReason,
	type McpAppInfo,
	isImageGenerationModel,
} from "src/types";
import { getGeminiClient } from "src/core/gemini";
import { tracing } from "src/core/tracingHooks";
import { getEnabledTools } from "src/core/tools";
import { fetchMcpTools, createMcpToolExecutor, isMcpTool, type McpToolDefinition, type McpToolExecutor } from "src/core/mcpTools";
import { GeminiCliProvider, ClaudeCliProvider, CodexCliProvider } from "src/core/cliProvider";
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
	encryptFileContent,
	decryptFileContent,
} from "src/core/crypto";
import { cryptoCache } from "src/core/cryptoCache";
import { formatError } from "src/utils/error";
import { t } from "src/i18n";

// Keywords that trigger automatic image model switching
const IMAGE_KEYWORDS = [
	// Japanese
	"画像を生成", "画像を作成", "画像を描", "イラストを", "絵を描",
	"写真を生成", "写真を作成", "画像にして",
	// English
	"generate image", "create image", "draw image",
	"generate a picture", "create a picture", "make an image",
	// German
	"bild generieren", "bild erstellen",
	// Spanish
	"generar imagen", "crear imagen",
	// French
	"générer une image", "créer une image",
	// Italian
	"genera immagine", "crea immagine",
	// Korean
	"이미지 생성", "그림 그려",
	// Portuguese
	"gerar imagem", "criar imagem",
	// Chinese
	"生成图片", "创建图片",
];

function shouldUseImageModel(message: string): boolean {
	const lower = message.toLowerCase();
	return IMAGE_KEYWORDS.some(kw => lower.includes(kw));
}

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
	const message = formatError(error);
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
	const [vaultToolMode, setVaultToolMode] = useState<"all" | "noSearch" | "none">(() => {
		const ragSetting = plugin.workspaceState.selectedRagSetting;
		const initialModel = plugin.getSelectedModel();
		const isInitialCli = initialModel === "gemini-cli" || initialModel === "claude-cli" || initialModel === "codex-cli";
		const isInitialGemma = initialModel.toLowerCase().includes("gemma");

		// CLI and Gemma models: always "none"
		if (isInitialCli || isInitialGemma) {
			return "none";
		}
		if (ragSetting === "__websearch__") {
			return "none";
		}
		// RAG enabled: force "none" (fileSearch + functionDeclarations not supported)
		if (ragSetting) {
			return "none";
		}
		return "all";
	});
	// Reason why vault tools are "none" - determines whether MCP should also be disabled
	const [, setVaultToolNoneReason] = useState<VaultToolNoneReason | null>(() => {
		const ragSetting = plugin.workspaceState.selectedRagSetting;
		const initialModel = plugin.getSelectedModel();
		const isInitialCli = initialModel === "gemini-cli" || initialModel === "claude-cli" || initialModel === "codex-cli";
		const isInitialGemma = initialModel.toLowerCase().includes("gemma");

		if (isInitialCli) {
			return "cli";
		}
		if (isInitialGemma) {
			return "gemma";
		}
		if (ragSetting === "__websearch__") {
			return "websearch";
		}
		// RAG enabled: fileSearch + functionDeclarations not supported
		if (ragSetting) {
			return "rag";
		}
		return null;
	});
	// MCP servers state: local copy with per-server enabled state (for chat session)
	// If vaultToolNoneReason is not "manual", disable all MCP servers initially
	const [mcpServers, setMcpServers] = useState(() => {
		const ragSetting = plugin.workspaceState.selectedRagSetting;
		const initialModel = plugin.getSelectedModel();
		const isInitialCli = initialModel === "gemini-cli" || initialModel === "claude-cli" || initialModel === "codex-cli";
		const isInitialGemma = initialModel.toLowerCase().includes("gemma");

		// Check if MCP should be disabled (same logic as vaultToolNoneReason)
		// RAG enabled: fileSearch + functionDeclarations not supported, so MCP also disabled
		const shouldDisableMcp = isInitialCli || isInitialGemma ||
			ragSetting === "__websearch__" || !!ragSetting;

		if (shouldDisableMcp) {
			return plugin.settings.mcpServers.map(s => ({ ...s, enabled: false }));
		}
		return [...plugin.settings.mcpServers];
	});
	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const abortControllerRef = useRef<AbortController | null>(null);
	const inputAreaRef = useRef<InputAreaHandle>(null);
	const currentSlashCommandRef = useRef<SlashCommand | null>(null);
	const mcpExecutorRef = useRef<McpToolExecutor | null>(null);
	const [vaultFiles, setVaultFiles] = useState<string[]>([]);
	const [hasSelection, setHasSelection] = useState(false);
	const [cliConfig, setCliConfig] = useState(plugin.settings.cliConfig || DEFAULT_CLI_CONFIG);
	const [hasApiKey, setHasApiKey] = useState(!!plugin.settings.googleApiKey);
	const [decryptingChatId, setDecryptingChatId] = useState<string | null>(null);
	const [decryptPassword, setDecryptPassword] = useState("");
	// Pending feedback for edit rejection (to be sent after state update)
	const [pendingEditFeedback, setPendingEditFeedback] = useState<{ filePath: string; request: string } | null>(null);

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

			md += `${msg.content}\n\n`;

			// Save metadata as HTML comment (invisible in rendered markdown)
			const metadata: Record<string, unknown> = {};
			if (msg.thinking) metadata.thinking = msg.thinking;
			if (msg.toolCalls) metadata.toolCalls = msg.toolCalls;
			if (msg.toolResults) metadata.toolResults = msg.toolResults;
			if (msg.ragUsed) metadata.ragUsed = msg.ragUsed;
			if (msg.ragSources) metadata.ragSources = msg.ragSources;
			if (msg.webSearchUsed) metadata.webSearchUsed = msg.webSearchUsed;
			if (msg.imageGenerationUsed) metadata.imageGenerationUsed = msg.imageGenerationUsed;
			if (msg.generatedImages) metadata.generatedImages = msg.generatedImages;
			if (msg.mcpApps) metadata.mcpApps = msg.mcpApps;
			if (msg.pendingRename) metadata.pendingRename = msg.pendingRename;
			if (msg.usage) metadata.usage = msg.usage;
			if (msg.elapsedMs) metadata.elapsedMs = msg.elapsedMs;
			metadata.timestamp = msg.timestamp;

			md += `<!-- msg-meta:${JSON.stringify(metadata)} -->\n\n---\n\n`;
		}

		// Encrypt if chat history encryption is enabled
		const encryption = plugin.settings.encryption;
		if (encryption?.encryptChatHistory && encryption.publicKey && encryption.encryptedPrivateKey && encryption.salt) {
			try {
				// Use the new YAML frontmatter format which stores keys in the file itself
				return await encryptFileContent(
					md,
					encryption.publicKey,
					encryption.encryptedPrivateKey,
					encryption.salt
				);
			} catch (error) {
				console.error("Failed to encrypt chat:", formatError(error));
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

					// Check if block has metadata comment (new format)
					const hasMetadata = block.includes("<!-- msg-meta:");

					for (const line of lines) {
						if (line.startsWith("> Attachments:") || line.startsWith("> Tools:")) {
							continue;
						}
						// Stop at metadata comment (new format)
						if (line.startsWith("<!-- msg-meta:")) {
							break;
						}
						// Stop at --- only if no metadata (old format, for backward compatibility)
						if (!hasMetadata && line === "---") {
							break;
						}
						if (line.trim() !== "" || inContent) {
							inContent = true;
							contentLines.push(line);
						}
					}

					const msgContent = contentLines.join("\n").trim();

					const message: Message = {
						role: isUser ? "user" : "assistant",
						content: msgContent,
						timestamp: createdAt + i * 1000, // Approximate timestamp
						model: isUser ? undefined : (roleMatch[1].trim() as ModelType),
					};

					// Restore metadata from HTML comment
					const metadataMatch = block.match(/<!-- msg-meta:(.+?) -->/);
					if (metadataMatch) {
						try {
							const meta = JSON.parse(metadataMatch[1]) as Record<string, unknown>;
							if (meta.thinking) message.thinking = meta.thinking as string;
							if (meta.toolCalls) message.toolCalls = meta.toolCalls as Message["toolCalls"];
							if (meta.toolResults) message.toolResults = meta.toolResults as Message["toolResults"];
							if (meta.ragUsed) message.ragUsed = meta.ragUsed as boolean;
							if (meta.ragSources) message.ragSources = meta.ragSources as string[];
							if (meta.webSearchUsed) message.webSearchUsed = meta.webSearchUsed as boolean;
							if (meta.imageGenerationUsed) message.imageGenerationUsed = meta.imageGenerationUsed as boolean;
							if (meta.generatedImages) message.generatedImages = meta.generatedImages as Message["generatedImages"];
							if (meta.mcpApps) message.mcpApps = meta.mcpApps as Message["mcpApps"];
							if (meta.pendingRename) message.pendingRename = meta.pendingRename as Message["pendingRename"];
							if (meta.usage) message.usage = meta.usage as Message["usage"];
							if (meta.elapsedMs) message.elapsedMs = meta.elapsedMs as number;
							if (meta.timestamp) message.timestamp = meta.timestamp as number;
						} catch {
							// Ignore parse errors for backward compatibility
						}
					}

					messages.push(message);
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

			const files = plugin.app.vault.getFiles().filter(f => {
				// Only include files directly in the folder (not in subdirectories)
				if (!f.path.startsWith(folder + "/")) return false;
				const relativePath = f.path.slice(folder.length + 1);
				if (relativePath.includes("/")) return false;
				// Include .md and .md.encrypted files
				return f.path.endsWith(".md") || f.path.endsWith(".md.encrypted");
			});
			const histories: ChatHistory[] = [];

			for (const file of files) {
				try {
					const content = await plugin.app.vault.read(file);
					const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

					// Extract chatId from filename (handles both .md and .md.encrypted)
					const chatId = file.name.replace(/\.md(\.encrypted)?$/, "");

					// Check if content is encrypted (YAML frontmatter format)
					if (isEncryptedFile(content)) {
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
	const saveCurrentChat = useCallback(async (msgs: Message[], session?: CliSessionInfo, overrideChatId?: string) => {
		if (msgs.length === 0) return;
		if (!plugin.settings.saveChatHistory) return;

		const chatId = overrideChatId || currentChatId || generateChatId();
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
		const basePath = getChatFilePath(chatId);
		const encrypted = isEncryptedFile(markdown);
		const filePath = encrypted ? basePath + ".encrypted" : basePath;
		const oldPath = encrypted ? basePath : basePath + ".encrypted";

		try {
			// Delete old file if encryption status changed (extension mismatch)
			const oldFile = plugin.app.vault.getAbstractFileByPath(oldPath);
			if (oldFile instanceof TFile) {
				await plugin.app.fileManager.trashFile(oldFile);
			}

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
			setCliConfig(plugin.settings.cliConfig || DEFAULT_CLI_CONFIG);
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
		// Skip plan check for CLI models
		if (currentModel === "gemini-cli" || currentModel === "claude-cli" || currentModel === "codex-cli") return;
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

	// Check if current model is Gemma
	const isGemmaModel = currentModel.toLowerCase().includes("gemma");

	// Handle RAG setting change from UI
	const handleRagSettingChange = (name: string | null) => {
		setSelectedRagSetting(name);
		void plugin.selectRagSetting(name);

		if (name === "__websearch__") {
			// Web Search: force to "none" (no vault tools)
			setVaultToolMode("none");
			setVaultToolNoneReason("websearch");
			setMcpServers(servers => servers.map(s => ({ ...s, enabled: false })));
		} else if (name) {
			// RAG enabled: force to "none" (fileSearch + functionDeclarations not supported)
			setVaultToolMode("none");
			setVaultToolNoneReason("rag");
			setMcpServers(servers => servers.map(s => ({ ...s, enabled: false })));
		} else {
			// No RAG selected: default to "all"
			setVaultToolMode("all");
			setVaultToolNoneReason(null);
		}
	};

	// Handle vault tool mode change from UI
	const handleVaultToolModeChange = (mode: "all" | "noSearch" | "none") => {
		setVaultToolMode(mode);
		// Manual change: MCP servers remain unchanged
		setVaultToolNoneReason(mode === "none" ? "manual" : null);
	};

	// Handle per-server MCP toggle from UI
	const handleMcpServerToggle = (serverName: string, enabled: boolean) => {
		setMcpServers(servers => {
			const updated = servers.map(s => s.name === serverName ? { ...s, enabled } : s);
			// Save to settings
			plugin.settings.mcpServers = updated;
			void plugin.saveSettings();
			return updated;
		});
	};

	// Handle model change from UI
	const handleModelChange = (model: ModelType) => {
		setCurrentModel(model);
		void plugin.selectModel(model);

		const isNewModelCli = model === "gemini-cli" || model === "claude-cli" || model === "codex-cli";
		const isNewModelGemma = model.toLowerCase().includes("gemma");

		// Auto-adjust search setting and vault tool mode for CLI mode and special models
		if (isNewModelCli) {
			// CLI mode: force Search to None and Vault to Off
			if (selectedRagSetting !== null) {
				handleRagSettingChange(null);
			}
			setVaultToolMode("none");
			setVaultToolNoneReason("cli");
			setMcpServers(servers => servers.map(s => ({ ...s, enabled: false })));
		} else if (isNewModelGemma) {
			// Gemma: force Search to None and Vault to Off
			if (selectedRagSetting !== null) {
				handleRagSettingChange(null);
			}
			setVaultToolMode("none");
			setVaultToolNoneReason("gemma");
			setMcpServers(servers => servers.map(s => ({ ...s, enabled: false })));
		} else if (isImageGenerationModel(model)) {
			// 2.5 Flash Image: no tools supported → force None
			// Gemini 3+ image models: Web Search only → keep if Web Search, else None
			if (model === "gemini-2.5-flash-image") {
				if (selectedRagSetting !== null) {
					handleRagSettingChange(null);
				}
			} else {
				if (selectedRagSetting !== null && selectedRagSetting !== "__websearch__") {
					handleRagSettingChange(null);
				}
			}
			// Reset vault tool mode for image generation models
			setVaultToolMode("all");
			setVaultToolNoneReason(null);
		} else {
			// Normal models: check current RAG setting and reset appropriately
			if (selectedRagSetting === "__websearch__") {
				setVaultToolMode("none");
				setVaultToolNoneReason("websearch");
				setMcpServers(servers => servers.map(s => ({ ...s, enabled: false })));
			} else if (selectedRagSetting) {
				// RAG enabled: force to "none" (fileSearch + functionDeclarations not supported)
				setVaultToolMode("none");
				setVaultToolNoneReason("rag");
				setMcpServers(servers => servers.map(s => ({ ...s, enabled: false })));
			} else {
				setVaultToolMode("all");
				setVaultToolNoneReason(null);
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
	const startNewChat = () => {
		if (isLoading) {
			new Notice(t("chat.generationInProgress"));
			return;
		}
		setMessages([]);
		setCurrentChatId(null);
		setCliSession(null);  // Clear CLI session
		setStreamingContent("");
		setStreamingThinking("");
		setShowHistory(false);
		// Cleanup MCP executor session
		if (mcpExecutorRef.current) {
			void mcpExecutorRef.current.cleanup();
			mcpExecutorRef.current = null;
		}
	};

	// Decrypt and load encrypted chat
	const decryptAndLoadChat = async (chatId: string, password: string) => {
		if (isLoading) {
			new Notice(t("chat.generationInProgress"));
			return;
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
			setCliSession(parsed.cliSession || null);
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
			new Notice(t("chat.generationInProgress"));
			return;
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
		setCliSession(history.cliSession || null);  // Restore CLI session
		setStreamingContent("");
		setStreamingThinking("");
		setShowHistory(false);
	};

	// Delete a chat from history
	const deleteChat = async (chatId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		if (isLoading) {
			new Notice(t("chat.generationInProgress"));
			return;
		}

		// Delete the Markdown file (try both .md and .md.encrypted)
		const basePath = getChatFilePath(chatId);
		for (const path of [basePath, basePath + ".encrypted"]) {
			try {
				const file = plugin.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					await plugin.app.fileManager.trashFile(file);
				}
			} catch {
				// Failed to delete chat file
			}
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

		const cliTraceId = tracing.traceStart("chat-message", {
			sessionId: currentChatId ?? undefined,
			input: resolvedContent,
			metadata: {
				model: currentModel,
				isCli: true,
				pluginVersion: plugin.manifest.version,
			},
		});

		try {
			const allMessages = [...messages, userMessage];

			// Build system prompt for CLI (read-only mode)
			const cliName = isClaudeCli ? "Claude CLI" : isCodexCli ? "Codex CLI" : "Gemini CLI";
			let systemPrompt = "You are a helpful AI assistant integrated with Obsidian.";
			systemPrompt += `\n\nNote: You are running in ${cliName} mode with limited capabilities. You can read and search vault files, but cannot modify them.`;
			systemPrompt += `\n\nIMPORTANT: File writing operations may fail in this environment. Always output results directly to standard output instead of attempting to write to files.`;
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

			tracing.traceEnd(cliTraceId, { output: fullContent });
			tracing.score(cliTraceId, {
				name: "status",
				value: stopped ? 0.5 : 1,
				comment: stopped ? "stopped by user" : "completed",
			});
		} catch (error) {
			const errorMessageText = error instanceof Error ? error.message : t("chat.unknownError");
			const errorMessage: Message = {
				role: "assistant",
				content: t("chat.errorOccurred", { message: errorMessageText }),
				timestamp: Date.now(),
			};
			setMessages((prev) => [...prev, errorMessage]);
			tracing.traceEnd(cliTraceId, { output: errorMessageText, metadata: { error: true } });
			tracing.score(cliTraceId, { name: "status", value: 0, comment: errorMessageText });
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
			} else if (isModelAllowedForPlan(apiPlan, "gemini-2.5-flash-image")) {
				allowedModel = "gemini-2.5-flash-image";
				autoSwitchedToImage = true;
			}
			// If neither is available, keep current model
		}

		const supportsFunctionCalling = !allowedModel.toLowerCase().includes("gemma");
		if (allowedModel !== currentModel && !autoSwitchedToImage) {
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

		const traceId = tracing.traceStart("chat-message", {
			sessionId: currentChatId ?? undefined,
			metadata: {
				model: allowedModel,
				ragEnabled: allowRag,
				webSearchEnabled: selectedRagSetting === "__websearch__",
				toolsEnabled: supportsFunctionCalling && !isImageGenerationModel(allowedModel),
				isImageGeneration: isImageGenerationModel(allowedModel),
				pluginVersion: plugin.manifest.version,
			},
			input: resolvedContent,
		});

		try {
			const runStreamOnce = async () => {
				const { settings } = plugin;
				const toolsEnabled = supportsFunctionCalling && !isImageGenerationModel(allowedModel);
				const obsidianTools = toolsEnabled ? getEnabledTools({
					allowWrite: true,
					allowDelete: true,
					ragEnabled: allowRag,
				}) : [];

				// Fetch MCP tools from enabled servers only (skip if vaultToolMode is "none")
				const enabledMcpServers = vaultToolMode !== "none"
					? mcpServers.filter(s => s.enabled)
					: [];
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

				// Store for session reuse
				mcpExecutorRef.current = mcpToolExecutor ?? null;

				// Merge Obsidian tools and MCP tools
				const allTools = [...obsidianTools, ...mcpTools];

				// Filter Obsidian tools based on vaultToolMode (MCP tools are not affected)
				const vaultToolNames = [
					"read_note", "create_note", "propose_edit", "propose_delete",
					"rename_note", "search_notes", "list_notes", "list_folders",
					"create_folder", "get_active_note", "check_rag_sync"
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

				// Combined tool executor that routes to Obsidian or MCP executor based on tool name
				const baseToolExecutor = (obsidianToolExecutor || mcpToolExecutor)
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
					&& (toolsEnabled || (isImageGenerationModel(allowedModel) && allowedModel !== "gemini-2.5-flash-image"));
				const isImageGeneration = isImageGenerationModel(allowedModel);

				// Pass RAG store IDs if RAG is enabled and a setting is selected (not web search)
				const ragStoreIds = allowRag && toolsEnabled && selectedRagSetting && !isWebSearch
					? plugin.getSelectedStoreIds()
					: [];

				// RAG-only mode: RAG enabled means only fileSearch tool is sent,
				// so vault tool descriptions should be excluded from the system prompt
				const ragOnlyMode = ragStoreIds.length > 0;

				let systemPrompt = "You are a helpful AI assistant integrated with Obsidian.";

				if (toolsEnabled && !ragOnlyMode) {
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
					if (allowRag && toolsEnabled && !ragOnlyMode) {
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
				let streamUsage: Message["usage"] = undefined;
				const startTime = Date.now();

				let stopped = false;

				// Use image generation stream or regular chat stream
				const chunkStream = isImageGeneration
					? client.generateImageStream(allMessages, allowedModel, systemPromptForModel, isWebSearch, ragStoreIds, traceId)
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
							traceId,
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
						// Capture usage data from the final chunk
						if (chunk.usage) {
							streamUsage = chunk.usage;
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
				};

				const newMessages = [...messages, userMessage, assistantMessage];
				setMessages(newMessages);

				// Save chat history
				await saveCurrentChat(newMessages);

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
				if (pendingAdditionalRequestRef.current) {
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
						setStreamingContent("");
						setStreamingThinking("");
						tracing.traceEnd(traceId, { metadata: { status: "aborted" } });
						tracing.score(traceId, { name: "status", value: 0.5, comment: "aborted during retry" });
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
		// Always reset loading state to ensure user can continue
		// even if abort signal is not properly handled by the stream
		setIsLoading(false);
		abortControllerRef.current = null;
	};

	// Compact/compress conversation history
	// Saves current chat as-is, then starts a new chat with the summary as context
	const handleCompact = async () => {
		if (messages.length < 2 || isLoading || isCompacting) return;

		// CLI mode does not support compact
		if (isCliMode) {
			new Notice(t("chat.compactNotAvailable"));
			return;
		}

		const client = getGeminiClient();
		if (!client) {
			new Notice(t("chat.clientNotInitialized"));
			return;
		}

		setIsCompacting(true);

		try {
			// Save current chat first (preserves full history)
			await saveCurrentChat(messages, cliSession || undefined);

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
			setCliSession(null);
			setMessages(newMessages);

			// Save as a new chat with explicit new ID (avoids stale closure of currentChatId)
			await saveCurrentChat(newMessages, undefined, newChatId);

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
						vaultToolModeOnlyNone={isCliMode || isGemmaModel || !!selectedRagSetting}
						mcpServers={mcpServers}
						onMcpServerToggle={handleMcpServerToggle}
						slashCommands={plugin.settings.slashCommands}
						onSlashCommand={handleSlashCommand}
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

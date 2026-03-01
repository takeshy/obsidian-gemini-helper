import type { Message, ModelType } from "src/types";
import {
	isEncryptedFile,
	encryptFileContent,
} from "src/core/crypto";
import { formatError } from "src/utils/error";
import { t } from "src/i18n";
import { isValidCliProvider, type CliSessionInfo } from "./chatUtils";

export interface EncryptionConfig {
	encryptChatHistory?: boolean;
	publicKey?: string;
	encryptedPrivateKey?: string;
	salt?: string;
}

// Convert messages to Markdown format
export async function messagesToMarkdown(
	msgs: Message[],
	title: string,
	createdAt: number,
	encryption: EncryptionConfig | undefined,
	session?: CliSessionInfo,
): Promise<string> {
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
}

// Parse Markdown back to messages
export function parseMarkdownToMessages(content: string): { messages: Message[]; createdAt: number; cliSession?: CliSessionInfo; isEncrypted?: boolean } | null {
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
}

export function formatHistoryDate(timestamp: number): string {
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
}

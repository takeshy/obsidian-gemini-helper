import { GoogleGenAI } from "@google/genai";
import type { App, Notice as NoticeType } from "obsidian";
import { EventEmitter } from "src/utils/EventEmitter";
import { createNote } from "src/vault/notes";

// Deep Research task status
export type DeepResearchStatus = "pending" | "in_progress" | "completed" | "failed";

// Deep Research task
export interface DeepResearchTask {
  id: string;                     // Internal task ID
  interactionId: string;          // Gemini API interaction ID
  chatId: string;                 // Associated chat ID
  prompt: string;                 // Original user prompt
  status: DeepResearchStatus;
  startedAt: number;
  completedAt?: number;
  thinkingSummaries: string[];    // Accumulated thinking summaries
  result?: string;                // Final research result
  error?: string;                 // Error message if failed
  resultNotePath?: string;        // Path to created result note
}

// Deep Research manager events
export interface DeepResearchEvents {
  "task-started": (task: DeepResearchTask) => void;
  "task-progress": (task: DeepResearchTask, summary: string) => void;
  "task-completed": (task: DeepResearchTask) => void;
  "task-failed": (task: DeepResearchTask) => void;
}

// Polling interval in milliseconds
const POLL_INTERVAL_MS = 10000; // 10 seconds
const MAX_POLL_DURATION_MS = 60 * 60 * 1000; // 60 minutes max

/**
 * Deep Research Manager
 * Manages deep research tasks that run in the background.
 * Tasks continue running even when switching chats.
 */
export class DeepResearchManager {
  private ai: GoogleGenAI;
  private app: App;
  private tasks: Map<string, DeepResearchTask> = new Map();
  private pollTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  public events = new EventEmitter();
  private workspaceFolder: string;
  private noticeClass: typeof NoticeType;

  constructor(apiKey: string, app: App, workspaceFolder: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.app = app;
    this.workspaceFolder = workspaceFolder;
    // Dynamic import of Notice to avoid issues during initialization
    this.noticeClass = (globalThis as unknown as { require: (id: string) => { Notice: typeof NoticeType } }).require("obsidian").Notice;
  }

  /**
   * Start a new deep research task
   */
  async startResearch(chatId: string, prompt: string): Promise<DeepResearchTask> {
    const taskId = `dr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    try {
      // Create the interaction with the Deep Research agent
      // Using streaming with thinking_summaries for real-time updates
      const stream = await (this.ai as unknown as {
        interactions: {
          create: (params: {
            input: string;
            agent: string;
            background: boolean;
            stream: boolean;
            agent_config: { type: string; thinking_summaries: string };
          }) => Promise<AsyncIterable<{
            event_type?: string;
            interaction?: { id: string };
            event_id?: string;
            delta?: { text?: string };
          }>>;
        };
      }).interactions.create({
        input: prompt,
        agent: "deep-research-pro-preview-12-2025",
        background: true,
        stream: true,
        agent_config: {
          type: "deep-research",
          thinking_summaries: "auto",
        },
      });

      // Get interaction ID from the stream start event
      let interactionId = "";

      // Process initial stream to get interaction ID
      for await (const chunk of stream) {
        if (chunk.event_type === "interaction.start" && chunk.interaction?.id) {
          interactionId = chunk.interaction.id;
          break;
        }
      }

      if (!interactionId) {
        throw new Error("Failed to get interaction ID from Deep Research");
      }

      // Create task
      const task: DeepResearchTask = {
        id: taskId,
        interactionId,
        chatId,
        prompt,
        status: "in_progress",
        startedAt: Date.now(),
        thinkingSummaries: [],
      };

      this.tasks.set(taskId, task);
      this.events.emit("task-started", task);

      // Start polling for updates
      this.startPolling(taskId);

      return task;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const task: DeepResearchTask = {
        id: taskId,
        interactionId: "",
        chatId,
        prompt,
        status: "failed",
        startedAt: Date.now(),
        completedAt: Date.now(),
        thinkingSummaries: [],
        error: errorMsg,
      };
      this.tasks.set(taskId, task);
      this.events.emit("task-failed", task);
      throw error;
    }
  }

  /**
   * Start polling for task updates
   */
  private startPolling(taskId: string): void {
    const poll = async () => {
      const task = this.tasks.get(taskId);
      if (!task || task.status === "completed" || task.status === "failed") {
        this.stopPolling(taskId);
        return;
      }

      // Check timeout
      if (Date.now() - task.startedAt > MAX_POLL_DURATION_MS) {
        task.status = "failed";
        task.error = "Research timed out after 60 minutes";
        task.completedAt = Date.now();
        this.events.emit("task-failed", task);
        this.stopPolling(taskId);
        return;
      }

      try {
        // Get interaction status
        const result = await (this.ai as unknown as {
          interactions: {
            get: (id: string) => Promise<{
              status: string;
              outputs?: Array<{ text?: string }>;
              error?: string;
            }>;
          };
        }).interactions.get(task.interactionId);

        if (result.status === "completed") {
          // Get the final output
          const outputs = result.outputs || [];
          const finalOutput = outputs[outputs.length - 1]?.text || "";

          task.status = "completed";
          task.result = finalOutput;
          task.completedAt = Date.now();

          // Create result note
          await this.createResultNote(task);

          this.events.emit("task-completed", task);
          this.stopPolling(taskId);

          // Show notification
          this.showCompletionNotification(task);
        } else if (result.status === "failed") {
          task.status = "failed";
          task.error = result.error || "Research failed";
          task.completedAt = Date.now();
          this.events.emit("task-failed", task);
          this.stopPolling(taskId);
        } else {
          // Still in progress, check for thinking summaries
          // The outputs array may contain intermediate thinking summaries
          const outputs = result.outputs || [];
          for (let i = task.thinkingSummaries.length; i < outputs.length; i++) {
            const summary = outputs[i]?.text;
            if (summary && !task.thinkingSummaries.includes(summary)) {
              task.thinkingSummaries.push(summary);
              this.events.emit("task-progress", task, summary);
            }
          }

          // Schedule next poll
          const timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
          this.pollTimers.set(taskId, timer);
        }
      } catch (error) {
        console.error("Deep Research polling error:", error);
        // Continue polling despite errors (transient network issues)
        const timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
        this.pollTimers.set(taskId, timer);
      }
    };

    // Start first poll
    void poll();
  }

  /**
   * Stop polling for a task
   */
  private stopPolling(taskId: string): void {
    const timer = this.pollTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.pollTimers.delete(taskId);
    }
  }

  /**
   * Create a result note for completed research
   */
  private async createResultNote(task: DeepResearchTask): Promise<void> {
    if (!task.result) return;

    // Generate note name from prompt
    const sanitizedPrompt = task.prompt
      .slice(0, 50)
      .replace(/[\\/:*?"<>|]/g, "")
      .trim();
    const timestamp = new Date(task.startedAt).toISOString().slice(0, 10);
    const noteName = `Deep Research - ${sanitizedPrompt} (${timestamp})`;

    // Build note content
    let content = `# Deep Research Result\n\n`;
    content += `**Query:** ${task.prompt}\n\n`;
    content += `**Started:** ${new Date(task.startedAt).toLocaleString()}\n`;
    content += `**Completed:** ${new Date(task.completedAt || Date.now()).toLocaleString()}\n`;
    content += `**Duration:** ${this.formatDuration(task.completedAt ? task.completedAt - task.startedAt : 0)}\n\n`;
    content += `---\n\n`;

    // Add thinking summaries if any
    if (task.thinkingSummaries.length > 0) {
      content += `## Research Process\n\n`;
      task.thinkingSummaries.forEach((summary, index) => {
        content += `### Step ${index + 1}\n\n${summary}\n\n`;
      });
      content += `---\n\n`;
    }

    // Add final result
    content += `## Research Result\n\n${task.result}`;

    // Create note in workspace folder
    const folder = this.workspaceFolder ? `${this.workspaceFolder}/deep-research` : "deep-research";
    const result = await createNote(this.app, noteName, content, folder);

    if (result.success && result.path) {
      task.resultNotePath = result.path;
    }
  }

  /**
   * Show completion notification and open result note
   */
  private showCompletionNotification(task: DeepResearchTask): void {
    const message = `Deep Research completed: "${task.prompt.slice(0, 30)}..."`;
    new this.noticeClass(message, 10000);

    // Open the result note
    if (task.resultNotePath) {
      const file = this.app.vault.getAbstractFileByPath(task.resultNotePath);
      if (file) {
        void this.app.workspace.getLeaf("tab").openFile(file as import("obsidian").TFile);
      }
    }
  }

  /**
   * Format duration in human readable form
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Get a task by ID
   */
  getTask(taskId: string): DeepResearchTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks for a chat
   */
  getTasksForChat(chatId: string): DeepResearchTask[] {
    return Array.from(this.tasks.values()).filter((task) => task.chatId === chatId);
  }

  /**
   * Get all active tasks
   */
  getActiveTasks(): DeepResearchTask[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.status === "pending" || task.status === "in_progress"
    );
  }

  /**
   * Get all tasks
   */
  getAllTasks(): DeepResearchTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Cancel a task (stop polling, mark as failed)
   */
  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    this.stopPolling(taskId);

    if (task.status === "in_progress" || task.status === "pending") {
      task.status = "failed";
      task.error = "Cancelled by user";
      task.completedAt = Date.now();
      this.events.emit("task-failed", task);
    }
  }

  /**
   * Clean up on unload
   */
  destroy(): void {
    // Stop all polling
    for (const taskId of this.pollTimers.keys()) {
      this.stopPolling(taskId);
    }
    this.tasks.clear();
  }
}

// Singleton instance
let deepResearchManagerInstance: DeepResearchManager | null = null;

export function initDeepResearchManager(
  apiKey: string,
  app: App,
  workspaceFolder: string
): DeepResearchManager {
  deepResearchManagerInstance = new DeepResearchManager(apiKey, app, workspaceFolder);
  return deepResearchManagerInstance;
}

export function getDeepResearchManager(): DeepResearchManager | null {
  return deepResearchManagerInstance;
}

export function resetDeepResearchManager(): void {
  if (deepResearchManagerInstance) {
    deepResearchManagerInstance.destroy();
    deepResearchManagerInstance = null;
  }
}

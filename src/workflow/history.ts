import { App } from "obsidian";
import type { McpAppInfo } from "../types";
import {
  ExecutionRecord,
  ExecutionStatus,
  StepStatus,
  WorkflowNodeType,
} from "./types";
import {
  isEncryptedFile,
  encryptFileContent,
  decryptFileContent,
} from "../core/crypto";
import { cryptoCache } from "../core/cryptoCache";
import { formatError } from "../utils/error";
import { globalEventEmitter } from "../utils/EventEmitter";

export interface EncryptionConfig {
  enabled: boolean;
  encryptWorkflowHistory?: boolean;  // Whether to encrypt workflow history
  publicKey: string;
  encryptedPrivateKey: string;
  salt: string;
}

export class ExecutionHistoryManager {
  private app: App;
  private historyFolder: string;
  private encryptionConfig: EncryptionConfig | null;

  constructor(app: App, workspaceFolder: string, encryptionConfig?: EncryptionConfig) {
    this.app = app;
    const baseFolder = workspaceFolder || "GeminiHelper";
    this.historyFolder = `${baseFolder}/workflow-history`;
    this.encryptionConfig = encryptionConfig || null;
  }

  /**
   * Check if encryption is available (enabled and has keys)
   * Password is NOT required for encryption - only public key is needed
   */
  private canEncrypt(): boolean {
    return !!(
      this.encryptionConfig?.encryptWorkflowHistory &&
      this.encryptionConfig.publicKey &&
      this.encryptionConfig.encryptedPrivateKey &&
      this.encryptionConfig.salt
    );
  }

  /**
   * Check if decryption is available (password cached)
   */
  canDecrypt(): boolean {
    return cryptoCache.hasPassword();
  }

  /**
   * Create a new execution record
   */
  createRecord(workflowPath: string, workflowName?: string): ExecutionRecord {
    return {
      id: this.generateId(),
      workflowPath,
      workflowName,
      startTime: new Date().toISOString(),
      status: "running",
      steps: [],
    };
  }

  /**
   * Add a step to the execution record
   */
  addStep(
    record: ExecutionRecord,
    nodeId: string,
    nodeType: WorkflowNodeType,
    input?: Record<string, unknown>,
    output?: unknown,
    status: StepStatus = "success",
    error?: string,
    mcpAppInfo?: McpAppInfo,
    variablesSnapshot?: Record<string, string | number>
  ): void {
    record.steps.push({
      nodeId,
      nodeType,
      timestamp: new Date().toISOString(),
      input,
      output,
      status,
      error,
      mcpAppInfo,
      variablesSnapshot,
    });
  }

  /**
   * Mark the execution as completed
   */
  completeRecord(
    record: ExecutionRecord,
    status: ExecutionStatus = "completed"
  ): void {
    record.endTime = new Date().toISOString();
    record.status = status;
  }

  /**
   * Save execution record to file
   */
  async saveRecord(record: ExecutionRecord): Promise<void> {
    await this.ensureHistoryFolder();

    const fileName = this.getFileName(record);
    const basePath = `${this.historyFolder}/${fileName}`;
    const jsonContent = JSON.stringify(record, null, 2);

    // Encrypt if encryption is enabled and available
    let content: string;
    let filePath: string;
    if (this.canEncrypt() && this.encryptionConfig) {
      content = await encryptFileContent(
        jsonContent,
        this.encryptionConfig.publicKey,
        this.encryptionConfig.encryptedPrivateKey,
        this.encryptionConfig.salt
      );
      filePath = basePath + ".encrypted";
    } else {
      content = jsonContent;
      filePath = basePath;
    }

    const existingFile = this.app.vault.getAbstractFileByPath(filePath);
    if (existingFile) {
      await this.app.vault.adapter.write(filePath, content);
    } else {
      await this.app.vault.create(filePath, content);
    }

    // Emit event to notify UI components
    globalEventEmitter.emit("execution-history-saved", record.workflowPath);

    // Strip variablesSnapshot from older records to save disk space
    await this.stripOldSnapshots(record.workflowPath, record.id);
  }

  /**
   * Parse content, decrypting if necessary
   */
  private async parseContent(content: string): Promise<ExecutionRecord | null> {
    try {
      // Check if content is encrypted
      if (isEncryptedFile(content)) {
        const password = cryptoCache.getPassword();
        if (!password) {
          // Cannot decrypt without password
          return null;
        }
        const decryptedContent = await decryptFileContent(content, password);
        return JSON.parse(decryptedContent) as ExecutionRecord;
      } else {
        return JSON.parse(content) as ExecutionRecord;
      }
    } catch (e) {
      console.error("Failed to parse content:", formatError(e));
      return null;
    }
  }

  /**
   * Check if a file is encrypted without decrypting
   */
  async isRecordEncrypted(recordId: string): Promise<boolean> {
    await this.ensureHistoryFolder();

    const folderPath = this.historyFolder;

    try {
      const files = await this.app.vault.adapter.list(folderPath);

      for (const file of files.files) {
        if (!file.endsWith(".json") && !file.endsWith(".json.encrypted")) continue;

        try {
          const content = await this.app.vault.adapter.read(file);

          // First check if encrypted
          if (isEncryptedFile(content)) {
            // Need to decrypt to check ID
            const password = cryptoCache.getPassword();
            if (password) {
              try {
                const decryptedContent = await decryptFileContent(content, password);
                const record: ExecutionRecord = JSON.parse(decryptedContent);
                if (record.id === recordId) {
                  return true;
                }
              } catch {
                // Skip if cannot decrypt
              }
            }
          } else {
            const record: ExecutionRecord = JSON.parse(content);
            if (record.id === recordId) {
              return false;
            }
          }
        } catch {
          // Skip invalid files
        }
      }
    } catch (e) {
      console.error("Failed to search history files:", formatError(e));
    }

    return false;
  }

  /**
   * Load all execution records for a workflow
   */
  async loadRecords(workflowPath: string): Promise<ExecutionRecord[]> {
    await this.ensureHistoryFolder();

    const records: ExecutionRecord[] = [];
    const folderPath = this.historyFolder;

    try {
      const files = await this.app.vault.adapter.list(folderPath);

      for (const file of files.files) {
        if (!file.endsWith(".json") && !file.endsWith(".json.encrypted")) continue;

        try {
          const content = await this.app.vault.adapter.read(file);
          const record = await this.parseContent(content);

          if (record && record.workflowPath === workflowPath) {
            records.push(record);
          }
        } catch (e) {
          console.error(`Failed to parse history file: ${file}`, formatError(e));
        }
      }
    } catch (e) {
      console.error("Failed to list history files:", formatError(e));
    }

    // Sort by start time descending
    records.sort((a, b) => {
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });

    return records;
  }

  /**
   * Load all execution records
   */
  async loadAllRecords(): Promise<ExecutionRecord[]> {
    await this.ensureHistoryFolder();

    const records: ExecutionRecord[] = [];
    const folderPath = this.historyFolder;

    try {
      const files = await this.app.vault.adapter.list(folderPath);

      for (const file of files.files) {
        if (!file.endsWith(".json") && !file.endsWith(".json.encrypted")) continue;

        try {
          const content = await this.app.vault.adapter.read(file);
          const record = await this.parseContent(content);
          if (record) {
            records.push(record);
          }
        } catch (e) {
          console.error(`Failed to parse history file: ${file}`, formatError(e));
        }
      }
    } catch (e) {
      console.error("Failed to list history files:", formatError(e));
    }

    // Sort by start time descending
    records.sort((a, b) => {
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });

    return records;
  }

  /**
   * Get a specific execution record by ID
   */
  async getRecord(recordId: string): Promise<ExecutionRecord | null> {
    await this.ensureHistoryFolder();

    const folderPath = this.historyFolder;

    try {
      const files = await this.app.vault.adapter.list(folderPath);

      for (const file of files.files) {
        if (!file.endsWith(".json") && !file.endsWith(".json.encrypted")) continue;

        try {
          const content = await this.app.vault.adapter.read(file);
          const record = await this.parseContent(content);

          if (record && record.id === recordId) {
            return record;
          }
        } catch {
          // Skip invalid files
        }
      }
    } catch (e) {
      console.error("Failed to search history files:", formatError(e));
    }

    return null;
  }

  /**
   * Delete an execution record
   */
  async deleteRecord(recordId: string): Promise<boolean> {
    await this.ensureHistoryFolder();

    const folderPath = this.historyFolder;

    try {
      const files = await this.app.vault.adapter.list(folderPath);

      for (const file of files.files) {
        if (!file.endsWith(".json") && !file.endsWith(".json.encrypted")) continue;

        try {
          const content = await this.app.vault.adapter.read(file);
          const record = await this.parseContent(content);

          if (record && record.id === recordId) {
            await this.app.vault.adapter.remove(file);
            return true;
          }
        } catch {
          // Skip invalid files
        }
      }
    } catch (e) {
      console.error("Failed to delete history file:", formatError(e));
    }

    return false;
  }

  /**
   * Delete all records for a workflow
   */
  async deleteAllRecords(workflowPath: string): Promise<number> {
    await this.ensureHistoryFolder();

    let deletedCount = 0;
    const folderPath = this.historyFolder;

    try {
      const files = await this.app.vault.adapter.list(folderPath);

      for (const file of files.files) {
        if (!file.endsWith(".json") && !file.endsWith(".json.encrypted")) continue;

        try {
          const content = await this.app.vault.adapter.read(file);
          const record = await this.parseContent(content);

          if (record && record.workflowPath === workflowPath) {
            await this.app.vault.adapter.remove(file);
            deletedCount++;
          }
        } catch {
          // Skip invalid files
        }
      }
    } catch (e) {
      console.error("Failed to delete history files:", formatError(e));
    }

    return deletedCount;
  }

  /**
   * Strip variablesSnapshot from steps of older records to save disk space.
   * Only the latest record (excludeId) retains snapshots for retry.
   */
  private async stripOldSnapshots(workflowPath: string, excludeId: string): Promise<void> {
    const folderPath = this.historyFolder;

    try {
      const files = await this.app.vault.adapter.list(folderPath);

      for (const file of files.files) {
        if (!file.endsWith(".json") && !file.endsWith(".json.encrypted")) continue;

        try {
          const content = await this.app.vault.adapter.read(file);

          // Skip encrypted files - cannot modify without full decrypt/re-encrypt cycle
          if (isEncryptedFile(content)) continue;

          const record: ExecutionRecord = JSON.parse(content);
          if (record.workflowPath !== workflowPath || record.id === excludeId) continue;

          // Check if any step has a variablesSnapshot
          const hasSnapshots = record.steps.some(s => s.variablesSnapshot);
          if (!hasSnapshots) continue;

          // Strip snapshots and re-save
          for (const step of record.steps) {
            delete step.variablesSnapshot;
          }
          await this.app.vault.adapter.write(file, JSON.stringify(record, null, 2));
        } catch {
          // Skip invalid files
        }
      }
    } catch (e) {
      console.error("Failed to strip old snapshots:", formatError(e));
    }
  }

  private async ensureHistoryFolder(): Promise<void> {
    const folderPath = this.historyFolder;

    try {
      const exists = await this.app.vault.adapter.exists(folderPath);
      if (!exists) {
        await this.app.vault.adapter.mkdir(folderPath);
      }
    } catch (e) {
      console.error("Failed to create history folder:", formatError(e));
    }
  }

  private generateId(): string {
    return `exec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private getFileName(record: ExecutionRecord): string {
    // Use workflow name if available, otherwise extract from path
    const workflowName =
      record.workflowName ||
      record.workflowPath.replace(/^.*\//, "").replace(/\.(canvas|md)$/, "");

    // Format timestamp
    const date = new Date(record.startTime);
    const timestamp = date
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .substring(0, 19);

    return `${workflowName}_${timestamp}.json`;
  }
}

/**
 * Format execution status for display
 */
export function formatStatus(status: ExecutionStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "error":
      return "Error";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

/**
 * Format step status for display
 */
export function formatStepStatus(status: StepStatus): string {
  switch (status) {
    case "success":
      return "Success";
    case "error":
      return "Error";
    case "skipped":
      return "Skipped";
    default:
      return status;
  }
}

/**
 * Format duration between two timestamps
 */
export function formatDuration(startTime: string, endTime?: string): string {
  if (!endTime) {
    return "In progress";
  }

  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const durationMs = end - start;

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  } else if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}

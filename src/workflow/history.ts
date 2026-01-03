import { App } from "obsidian";
import {
  ExecutionRecord,
  ExecutionStatus,
  StepStatus,
  WorkflowNodeType,
} from "./types";

export class ExecutionHistoryManager {
  private app: App;
  private historyFolder: string;

  constructor(app: App, workspaceFolder: string) {
    this.app = app;
    const baseFolder = workspaceFolder || "GeminiHelper";
    this.historyFolder = `${baseFolder}/workflow-history`;
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
    error?: string
  ): void {
    record.steps.push({
      nodeId,
      nodeType,
      timestamp: new Date().toISOString(),
      input,
      output,
      status,
      error,
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
    const filePath = `${this.historyFolder}/${fileName}`;
    const content = JSON.stringify(record, null, 2);

    const existingFile = this.app.vault.getAbstractFileByPath(filePath);
    if (existingFile) {
      await this.app.vault.adapter.write(filePath, content);
    } else {
      await this.app.vault.create(filePath, content);
    }
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
        if (!file.endsWith(".json")) continue;

        try {
          const content = await this.app.vault.adapter.read(file);
          const record: ExecutionRecord = JSON.parse(content);

          if (record.workflowPath === workflowPath) {
            records.push(record);
          }
        } catch (e) {
          console.error(`Failed to parse history file: ${file}`, e);
        }
      }
    } catch (e) {
      console.error("Failed to list history files:", e);
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
        if (!file.endsWith(".json")) continue;

        try {
          const content = await this.app.vault.adapter.read(file);
          const record: ExecutionRecord = JSON.parse(content);
          records.push(record);
        } catch (e) {
          console.error(`Failed to parse history file: ${file}`, e);
        }
      }
    } catch (e) {
      console.error("Failed to list history files:", e);
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
        if (!file.endsWith(".json")) continue;

        try {
          const content = await this.app.vault.adapter.read(file);
          const record: ExecutionRecord = JSON.parse(content);

          if (record.id === recordId) {
            return record;
          }
        } catch {
          // Skip invalid files
        }
      }
    } catch (e) {
      console.error("Failed to search history files:", e);
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
        if (!file.endsWith(".json")) continue;

        try {
          const content = await this.app.vault.adapter.read(file);
          const record: ExecutionRecord = JSON.parse(content);

          if (record.id === recordId) {
            await this.app.vault.adapter.remove(file);
            return true;
          }
        } catch {
          // Skip invalid files
        }
      }
    } catch (e) {
      console.error("Failed to delete history file:", e);
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
        if (!file.endsWith(".json")) continue;

        try {
          const content = await this.app.vault.adapter.read(file);
          const record: ExecutionRecord = JSON.parse(content);

          if (record.workflowPath === workflowPath) {
            await this.app.vault.adapter.remove(file);
            deletedCount++;
          }
        } catch {
          // Skip invalid files
        }
      }
    } catch (e) {
      console.error("Failed to delete history files:", e);
    }

    return deletedCount;
  }

  private async ensureHistoryFolder(): Promise<void> {
    const folderPath = this.historyFolder;

    try {
      const exists = await this.app.vault.adapter.exists(folderPath);
      if (!exists) {
        await this.app.vault.adapter.mkdir(folderPath);
      }
    } catch (e) {
      console.error("Failed to create history folder:", e);
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

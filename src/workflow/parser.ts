import { configureWorkflowBlockLanguage } from "obsidian-llm-hub-common/workflow";

// Notes in existing vaults carry this tag, so it is declared here rather than defaulted.
configureWorkflowBlockLanguage("hub-workflow");

export * from "obsidian-llm-hub-common/workflow";

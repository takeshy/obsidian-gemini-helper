---
name: add-workflow-node
description: Add a new workflow node type to the plugin. Use when implementing a new node type for the workflow engine (e.g., new command, integration, or control flow node).
argument-hint: "[node-type-name]"
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

# Add New Workflow Node Type

Add a new workflow node type called `$ARGUMENTS` to the plugin.

## Required File Changes (ALL must be updated)

Update the following files in order. Missing any file will cause bugs:

### 1. `src/workflow/types.ts`
- Add to `WorkflowNodeType` union type
- Add to `WORKFLOW_NODE_TYPES` Set (single source of truth for `isWorkflowNodeType()`)
- **If forgotten**: nodes are skipped during parsing and disappear from visual workflow

### 2. `src/workflow/workflowSpec.ts`
- Add documentation entry for AI workflow generation

### 3. `src/workflow/nodeHandlers.ts`
- Add `handle*Node()` function with the node's execution logic
- Export the handler

### 4. `src/workflow/executor.ts`
- Add `case` in the switch statement to call the handler and log execution
- **If forgotten**: node execution fails silently

### 5. `src/ui/components/workflow/WorkflowPanel.tsx`
- Add to `NODE_TYPE_LABELS` object (display name)
- Add to `ADDABLE_NODE_TYPES` array
- Add to `getDefaultProperties()` switch (default property values)
- Add to `getNodeSummary()` switch (summary text for node list)

### 6. `src/ui/components/workflow/NodeEditorModal.ts`
- Add to `NODE_TYPE_LABELS` object
- Add `case` in `renderPropertyFields()` switch for editor UI fields

## Verification

After implementing all changes:
1. Run `npm run lint` to check for errors
2. Run `npm run build` to verify compilation
3. Review each file to ensure the new node type is consistently named

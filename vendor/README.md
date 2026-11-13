# Shared library package

The active dependency is `obsidian-llm-hub-common-0.1.18.tgz`, shared by LLM Hub
and Gemini Helper. Version 0.1.18 extends decisions with Noul probability, Score
thresholds, named Choice destinations, and mixed-question batches sharing one
API request. Batch output is saved as named JSON values for subsequent conditions.

It builds on the decision node support from 0.1.17. It adds the `decision` workflow node, its visual editor,
true/false routing, YAML round trips, Mermaid rendering, execution history,
AI authoring documentation, and the optional decision-model/handler host hooks.
The shared `requestBooleanDecision` API calls Jev, OpenRouter, or Gemini
(`gemini-decision-1`) with strict choice validation, cancellation, rate-limit
retry, and a 20-second deadline.

Source: [takeshy/obsidian-llm-hub-common commit 9f9bc2f](https://github.com/takeshy/obsidian-llm-hub-common/commit/9f9bc2fa237fe16443f9cd974724f1cb6adba1e6),
version 0.1.18, committed and pushed to `main`. The archive was created with
`npm pack --ignore-scripts` after building and passing the shared tests.
It includes prebuilt JavaScript, TypeScript declarations, and the MIT license.

Archive integrity:

```text
sha512-2oNGu1gXCWCFbBpMcJa3X98V3cg3xBwmbqwa+k8XlJkYgJSte4kOMz4JPEIYVijPhowjnUgJuu0L2cYS3uyj+Q==
```

Previous package notes follow.

`obsidian-llm-hub-common-0.1.14.tgz` contains prebuilt JavaScript and TypeScript declarations for `npm ci --ignore-scripts`.

Source: [takeshy/obsidian-llm-hub-common commit 1727cce](https://github.com/takeshy/obsidian-llm-hub-common/commit/1727cce954654b6ee2579abc1103915a6e8f6f8c), version 0.1.14, committed and pushed to main with a clean working tree.

Since 0.1.10, the library adds the optional `WorkflowHost.getRagSearchOptions` hook for Jev-capable hosts, which this plugin omits (0.1.11), rejects `rag-sync` on hosts without `runRagSyncNode` (0.1.12), and documents that `rag-sync.path` may be omitted and that `ragSetting` supports `{{variables}}` (0.1.13). Version 0.1.14 makes the `rag-sync` node editor's RAG setting a text field with setting-name suggestions, lets `runRagSyncNode` return the setting it used so logs and history record it, shows a single group of loading dots in the generation modal, and replaces Cancel with Close after a generation error.

The shared file-reference resolver handles wikilinks, @ references, and vault paths. Chat messages preserve the original references. Only model requests annotate each tool-readable reference with path, type, and byte size; file contents are fetched on demand and reading instructions stay in the system prompt. Hosts retain their inline fallback policy, vault tool scope, PDF reader, and character limit.

Archive integrity:

```text
sha512-Qr/V5tGdXj+QjVEXoIRrtwyKpvKhnakgbTH9VUp2aTWl1i06TaUNEuViVYW1mTRHiEKfDHBTavkbiVIBUI5/fg==
```

Created with `npm pack --ignore-scripts` after the build and the full shared-library test suite passed. The MIT license is included.

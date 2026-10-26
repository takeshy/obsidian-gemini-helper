# Web search and chat storage

Gemini Helper provides one **Active provider** selector: **Gemini Google Search**, **Tavily**, **Brave Search**, or **Disabled**. Only the selected external provider's API key and usage controls are displayed. Tavily and Brave Search credentials, provider selection and quota displays are retained independently of the mode. Settings can change at any time. Existing external-search users keep their selected mode; older installations without an explicit selection default to Google Search, including legacy default external settings with provider `none`. An explicit Disabled selection in the current format remains disabled.

## Google Search consent and saving

Enabling Google Search in Chat asks for confirmation before changing the search or saving state. Cancel, closing the dialog, switching chat, or changing provider before approval leaves the current chat unchanged. A remembered workspace toggle and slash commands cannot bypass consent. New empty Google-mode chats start with search off.

Approval sets `autoSaveDisabledByGrounding` for the entire conversation, even when the model never searches. Turning search off, switching providers and manual saving do not clear this state. A persistent notice above the scrolling message list has no dismiss button. Normal and external-search chats keep their automatic-save behavior.

The workspace state stores only restricted conversation IDs. This preserves the policy for previously saved chats without changing their Markdown when Google Search is enabled. Shared storage checks the policy again immediately before an automatic write, including late/background results. The previously saved file is retained.

For a restricted chat, the existing header save button becomes **Save conversation**. Each explicit save writes the complete current conversation to the configured chat-note save folder, including the policy flag. An empty save-folder setting uses the vault root. Repeated manual saves update that note, and changing the save-folder setting directs the next save to the new folder. The existing automatic history file remains untouched. It remains available even when automatic history is globally disabled. Later changes do not overwrite that file until another explicit save. Reopening the saved conversation restores the restriction. Normal chats retain the existing readable-note export destination and format. A compacted summary derived from a restricted conversation remains restricted so compaction cannot bypass the policy.

## Display-only Google data

GenerateContent, Interactions and image generation retrieve Google's original Search Suggestions HTML. A sandboxed display frame renders the supplied HTML/CSS without rewriting it, at the answer width, and opens suggestion links directly in a browser. Scripts are disabled. Text and images from a Google-search-enabled request are withheld until the response completes; if grounding occurred without the required display data, an error is shown instead of the grounded response. Citation/source badges remain separate from Search Suggestions.

Only a consented Chat view with the required display support may enable Google Search. Text-only Workflow, Dashboard and Discussion integration paths do not silently use Google Search; select external Web search there. Unsupported model/display paths fail before a native search request. Search Suggestions stay in runtime memory and are never serialized.

## Persisted data

Restricted manual saves contain visible conversation text plus basic message timestamps/model labels and the conversation policy flag. They omit `webSearchSources`, Search Suggestions, `searchEntryPoint.renderedContent`, `groundingMetadata`, tool results/calls, provider continuation, interaction IDs, hidden model input, thinking, and API response objects. The same scrubber protects explicitly marked Google-grounded messages even when a caller omits the session option. Ordinary/external chat metadata remains backward compatible.

Restricted conversations also stop saving input-history prompts and sending conversation traces. Restriction records contain IDs only, not prompts or answers. This implementation does not migrate old stored search metadata, introduce expiry deletion, or automatically delete manually saved notes.

## Verification

Automated coverage includes approval/cancellation/modal close, late approval after navigation, sticky policy across provider changes and manual saves, fresh empty conversations, late/background writes, existing-file preservation, repeated manual snapshots, reopening flagged histories, globally disabled automatic history, metadata removal, normal metadata round trips, both API payload formats, missing display data, native image generation, sandbox markup and the nondismissible notice.

Live Gemini API behavior and actual Obsidian iframe layout/link navigation require release-time verification. Existing saved-metadata migration and whether an entire-conversation manual save falls within Google's individual-result exception are separate release checks; the confirmation dialog alone does not guarantee compliance.

References: [Gemini grounding API](https://ai.google.dev/gemini-api/docs/google-search), [Search Suggestions display requirements](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/grounding-with-google-search), [Gemini API terms](https://ai.google.dev/gemini-api/terms#grounding-with-google-search).

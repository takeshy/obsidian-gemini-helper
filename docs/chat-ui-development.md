# Shared chat UI

Chat presentation uses `obsidian-llm-hub-chat-ui`, an npm library whose visual
baseline is Local LLM Hub. The package is bundled into `main.js`; users do not
install another Obsidian plugin. The dependency is a GitHub reference pinned to a full commit SHA.
`npm ci` prepares the Git dependency by running its `prepare` script, which builds
ESM and TypeScript declarations. Keep lifecycle scripts enabled. No npm registry
publication, sibling checkout or checked-in tarball is required.

Edit shared components and chat styles in the sibling `obsidian-llm-hub-chat-ui` source
package. Keep provider execution, Vault operations, Markdown rendering, settings,
translations and persistence in this plugin's host adapters. Pass display data,
callbacks and React slots to the library, not a plugin instance.

`styles.source.css` is the editable plugin stylesheet. `npm run build` generates
`styles.css` from it and the package's common styles. `npm run dev` watches both
sources. Include the generated `styles.css` in releases as before.

To update the library, commit and push the shared source to its `main` branch,
then run its `sync-plugins` script with this plugin directory (and the other
consumers). The script pins all selected consumers to the pushed commit SHA.
Commit `package.json`, `package-lock.json` and regenerated styles together.
Validate with `npm run build`, `npm run lint` and relevant tests.

Gemini Helper retains its mobile input collapse/expand controls through the
library's optional collapse capability. Input text and attachments remain owned
by the host and survive collapse/expand.

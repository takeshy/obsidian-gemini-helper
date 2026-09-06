# Shared chat UI

Chat presentation uses `obsidian-llm-hub-chat-ui`, an npm library whose visual
baseline is Local LLM Hub. The package is bundled into `main.js`; users do not
install another Obsidian plugin. A pinned tarball in `vendor/` makes `npm ci` work
in a standalone checkout before the library is published to npm.

Edit shared components and chat styles in the sibling `obsidian-llm-hub-chat-ui` source
package. Keep provider execution, Vault operations, Markdown rendering, settings,
translations and persistence in this plugin's host adapters. Pass display data,
callbacks and React slots to the library, not a plugin instance.

`styles.source.css` is the editable plugin stylesheet. `npm run build` generates
`styles.css` from it and the package's common styles. `npm run dev` watches both
sources. Include the generated `styles.css` in releases as before.

To update the library, bump its version, then run its `sync-plugins` script with
this plugin directory (and the other consumers). Commit the updated tarball,
`package.json`, `package-lock.json` and regenerated styles together. Validate with
`npm run build`, `npm run lint` and `npm test`.

Gemini Helper retains its mobile input collapse/expand controls through the
library's optional collapse capability. Input text and attachments remain owned
by the host and survive collapse/expand.

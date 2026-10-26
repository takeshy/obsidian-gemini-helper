# Shared library package

`obsidian-llm-hub-common-0.1.10.tgz` contains prebuilt JavaScript and TypeScript declarations for `npm ci --ignore-scripts`.

Source: the local `obsidian-llm-hub-common` working tree based on commit `e0e7f4072930d2ffd91803f61b92fd3a3d03bb4a`, with uncommitted user-message link and icon-button styling fixes in `styles.css` and `src/index.tsx` and the 0.1.10 version update. The archive also includes pre-existing local README edits. These changes have not been committed or published to npm.

The shared file-reference resolver handles wikilinks, @ references, and vault paths. Chat messages preserve the original references. Only model requests annotate each tool-readable reference with path, type, and byte size; file contents are fetched on demand and reading instructions stay in the system prompt. Hosts retain their inline fallback policy, vault tool scope, PDF reader, and character limit.

Archive integrity:

```text
sha512-UQAb7NT8ItzLICojvOG2lblSDwP07EKcPxRq1RlRlq2VslCkUucjyGXdStJD7zHFCBVILHprEYvTxSlZnk9NjA==
```

Created with `npm pack`, whose prepack script runs the build and full tests. The MIT license is included.

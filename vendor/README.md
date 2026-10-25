# Shared library package

`obsidian-llm-hub-common-0.1.6.tgz` contains the prebuilt shared library, including JavaScript and TypeScript declarations, so `npm ci --ignore-scripts` works.

Source commit: `5d9ebd9f70f12ec2d554bd67d4f3c7a172dfd3a2` in [obsidian-llm-hub-common](https://github.com/takeshy/obsidian-llm-hub-common). This archive was built locally from that source; the package has not been published.

Archive integrity:

```text
sha512-k6X9ApFq3maj2eaLU7ajDI/afCYDfRrcWGDXXk1mrSVkKcfL/MHqUpfAlwOc45qv2wJ8dzRe/LsAuKriblEpYw==
```

Built and tested using `npm pack` (the prepack script runs build and the full test suite). To update, build and test the library, create its archive with `npm pack`, and update both the dependency and lockfile alongside this source commit and integrity. The MIT license is included in the archive.

# Shared library package

`obsidian-llm-hub-common-0.1.2.tgz` contains the prebuilt shared library, including
its JavaScript and TypeScript declarations. Using the archive allows review
tools to install the dependency with `npm ci --ignore-scripts`; installing from
Git requires the library's `prepare` script to generate its `dist` directory.

Source: https://github.com/takeshy/obsidian-llm-hub-common/tree/b5691cc4d493dc7df8e7eeebb9b5a034708f34da

Archive integrity:

```text
sha512-2I29zSwo47bjwQ9Eyh9D+68ru0Aoyp8T18EH/2Ige2gFxleKW8PbaKyaErFzsIbY2x2eIKeTZcUABWXAQrn7yA==
```

To update it, build and test the shared library at the intended commit, then
create its package with `npm pack`. Replace the archive, record the source
commit and integrity here, and update the dependency and lockfile. Verify a
fresh `npm ci --ignore-scripts`, followed by lint and build, before committing.

The MIT license is included in the archive.

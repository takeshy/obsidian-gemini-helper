# Shared library package

`obsidian-llm-hub-common-0.1.3.tgz` contains the prebuilt shared library, including
its JavaScript and TypeScript declarations. Using the archive allows review
tools to install the dependency with `npm ci --ignore-scripts`; installing from
Git requires the library's `prepare` script to generate its `dist` directory.

Source: https://github.com/takeshy/obsidian-llm-hub-common/tree/c55004ea35ad8bc559e7b8d09cac915fd584e34c

Archive integrity:

```text
sha512-jsSmToiWuuA+w1N0hX1HRvbTf1rvgC8Wp9FEdloXSL1wAkYYuh37xXfnOCzEY6yr88Wwut8lf+a9n7XV6iPHdQ==
```

To update it, build and test the shared library at the intended commit, then
create its package with `npm pack`. Replace the archive, record the source
commit and integrity here, and update the dependency and lockfile. Verify a
fresh `npm ci --ignore-scripts`, followed by lint and build, before committing.

The MIT license is included in the archive.

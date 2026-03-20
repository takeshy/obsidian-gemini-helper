# Translate Documentation Files

Translate the following documentation files to all supported languages:

## Target Languages
- de (German)
- es (Spanish)
- fr (French)
- it (Italian)
- ja (Japanese)
- ko (Korean)
- pt (Portuguese)
- zh (Chinese Simplified)

## Files to Translate

### 1. README.md
- Source: `README.md`
- Targets: `README_de.md`, `README_es.md`, `README_fr.md`, `README_it.md`, `README_ja.md`, `README_ko.md`, `README_pt.md`, `README_zh.md`

### 2. WORKFLOW_NODES.md
- Source: `WORKFLOW_NODES.md`
- Targets: `WORKFLOW_NODES_de.md`, `WORKFLOW_NODES_es.md`, `WORKFLOW_NODES_fr.md`, `WORKFLOW_NODES_it.md`, `WORKFLOW_NODES_ja.md`, `WORKFLOW_NODES_ko.md`, `WORKFLOW_NODES_pt.md`, `WORKFLOW_NODES_zh.md`

### 3. i18n/en.ts
- Source: `src/i18n/en.ts`
- Targets: `src/i18n/de.ts`, `src/i18n/es.ts`, `src/i18n/fr.ts`, `src/i18n/it.ts`, `src/i18n/ja.ts`, `src/i18n/ko.ts`, `src/i18n/pt.ts`, `src/i18n/zh.ts`

## Translation Instructions

1. **Read the source file** and compare with existing translations
2. **Identify changes** - Find sections that are new or modified
3. **Translate incrementally** - Only translate changed/new content, preserve existing translations
4. **Maintain formatting** - Keep markdown structure, code blocks, links, and image references intact
5. **Technical terms** - Keep technical terms like "Obsidian", "Canvas", "YAML", "API", node type names (`command`, `if`, `while`, etc.) in English
6. **Code examples** - Do not translate code, variable names, or file paths inside code blocks

## Workflow

For each target language:
1. Read the source English file
2. Read the existing translation (if exists)
3. Compare and identify what needs to be translated
4. Translate only the new/changed sections
5. Write the updated translation file

Start with one language at a time. Ask which language to translate first, or translate all if specified.

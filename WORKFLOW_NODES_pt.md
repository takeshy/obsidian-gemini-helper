# Referencia de Nos de Workflow

Este documento fornece especificacoes detalhadas para todos os tipos de nos de workflow. Para a maioria dos usuarios, **voce nao precisa aprender esses detalhes** - basta descrever o que voce quer em linguagem natural, e a IA criara ou modificara workflows para voce.

## Visao Geral dos Tipos de Nos

| Categoria | Nos | Descricao |
|-----------|-----|-----------|
| Variaveis | `variable`, `set` | Declarar e atualizar variaveis |
| Controle | `if`, `while` | Ramificacao condicional e loops |
| LLM | `command` | Executar prompts com opcoes de modelo/busca |
| Dados | `http`, `json` | Requisicoes HTTP e parsing de JSON |
| Notas | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` | Operacoes no vault |
| Arquivos | `file-explorer`, `file-save` | Selecao e salvamento de arquivos (imagens, PDFs, etc.) |
| Prompts | `prompt-file`, `prompt-selection`, `dialog` | Dialogos de entrada do usuario |
| Composicao | `workflow` | Executar outro workflow como sub-workflow |
| RAG | `rag-sync` | Sincronizar notas com o store RAG |
| Externo | `mcp`, `obsidian-command` | Chamar servidores MCP externos ou comandos do Obsidian |

---

## Opcoes de Workflow

Voce pode adicionar uma secao `options` para controlar o comportamento do workflow:

```yaml
name: My Workflow
options:
  showProgress: false  # Ocultar modal de progresso de execucao (padrao: true)
nodes:
  - id: step1
    type: command
    ...
```

| Opcao | Tipo | Padrao | Descricao |
|--------|------|--------|-------------|
| `showProgress` | boolean | `true` | Mostrar modal de progresso de execucao ao executar via hotkey ou lista de workflows |

**Nota:** A opcao `showProgress` afeta apenas a execucao via hotkey ou lista de workflows. O painel de Workflow Visual sempre mostra o progresso.

---

## Referencia de Nos

### command

Executar um prompt LLM com modelo opcional e configuracoes de busca.

```yaml
- id: search
  type: command
  model: gemini-3-flash-preview  # Opcional: modelo especifico
  ragSetting: __websearch__      # Opcional: __websearch__, __none__, ou nome da configuracao
  prompt: "Search for {{topic}}"
  saveTo: result
```

| Propriedade | Descricao |
|-------------|-----------|
| `prompt` | O prompt a enviar para o LLM (obrigatorio) |
| `model` | Sobrescrever o modelo atual (ex: `gemini-3-flash-preview`, `gemini-3-pro-image-preview`, `gemini-cli`, `claude-cli`, `codex-cli`) |
| `ragSetting` | `__websearch__` (busca web), `__none__` (sem busca), nome da configuracao, ou omitir para atual |
| `attachments` | Nomes de variaveis separados por virgula contendo FileExplorerData (do no `file-explorer`) |
| `saveTo` | Nome da variavel para armazenar resposta de texto |
| `saveImageTo` | Nome da variavel para armazenar imagem gerada (formato FileExplorerData, para modelos de imagem) |

**Exemplo de geracao de imagem**:
```yaml
- id: generate
  type: command
  prompt: "Generate a cute cat illustration"
  model: gemini-3-pro-image-preview
  saveImageTo: generatedImage
- id: save-image
  type: note
  path: "images/cat"
  content: "![cat](data:{{generatedImage.mimeType}};base64,{{generatedImage.data}})"
```

**Modelos CLI:**

Voce pode usar modelos CLI (`gemini-cli`, `claude-cli`, `codex-cli`) em workflows se o CLI estiver configurado nas configuracoes do plugin. Modelos CLI sao uteis para acessar modelos principais sem custos de API.

```yaml
- id: analyze
  type: command
  model: claude-cli
  prompt: "Analise este codigo:\n\n{{code}}"
  saveTo: analysis
```

> **Nota:** Modelos CLI nao suportam RAG, busca web ou geracao de imagens. As propriedades `ragSetting` e `saveImageTo` sao ignoradas para modelos CLI.

### note

Escrever conteudo em um arquivo de nota.

```yaml
- id: save
  type: note
  path: "output/{{filename}}.md"
  content: "{{result}}"
  mode: overwrite
  confirm: true
```

| Propriedade | Descricao |
|-------------|-----------|
| `path` | Caminho do arquivo (obrigatorio) |
| `content` | Conteudo a escrever |
| `mode` | `overwrite` (padrao), `append`, ou `create` (pular se existir) |
| `confirm` | `true` (padrao) mostra dialogo de confirmacao, `false` escreve imediatamente |
| `history` | `true` (padrao, segue configuracao global) salva no historico de edicao, `false` desativa historico para esta escrita |

### note-read

Le conteudo de um arquivo de nota.

```yaml
- id: read
  type: note-read
  path: "notes/config.md"
  saveTo: content
```

| Propriedade | Descricao |
|-------------|-----------|
| `path` | Caminho do arquivo para ler (obrigatorio) |
| `saveTo` | Nome da variavel para armazenar o conteudo do arquivo (obrigatorio) |

**Suporte a Arquivos Criptografados:**

Se o arquivo alvo estiver criptografado (via recurso de criptografia do plugin), o workflow automaticamente:
1. Verifica se a senha ja esta em cache na sessao atual
2. Se nao estiver em cache, solicita ao usuario que digite a senha
3. Descriptografa o conteudo do arquivo e armazena na variavel
4. Armazena a senha em cache para leituras subsequentes (dentro da mesma sessao do Obsidian)

Uma vez que voce digite a senha, nao precisara digita-la novamente para outras leituras de arquivos criptografados ate reiniciar o Obsidian.

**Exemplo: Ler chave API de arquivo criptografado e chamar API externa**

Este workflow le uma chave API armazenada em um arquivo criptografado, chama uma API externa e exibe o resultado:

```yaml
name: Chamar API com chave criptografada
nodes:
  - id: read-key
    type: note-read
    path: "secrets/api-key.md"
    saveTo: apiKey
    next: call-api

  - id: call-api
    type: http
    url: "https://api.example.com/data"
    method: GET
    headers: '{"Authorization": "Bearer {{apiKey}}"}'
    saveTo: response
    next: show-result

  - id: show-result
    type: dialog
    title: Resposta da API
    message: "{{response}}"
    markdown: true
    button1: OK
```

> **Dica:** Armazene dados sensiveis como chaves API em arquivos criptografados. Use o comando "Criptografar arquivo" da paleta de comandos para criptografar um arquivo contendo seus segredos.

### note-list

Listar notas com filtragem e ordenacao.

```yaml
- id: list
  type: note-list
  folder: "Projects"
  recursive: true
  tags: "todo, project"
  tagMatch: all
  createdWithin: "7d"
  modifiedWithin: "24h"
  sortBy: modified
  sortOrder: desc
  limit: 20
  saveTo: noteList
```

| Propriedade | Descricao |
|-------------|-----------|
| `folder` | Caminho da pasta (vazio para todo o vault) |
| `recursive` | `true` inclui subpastas, `false` (padrao) apenas filhos diretos |
| `tags` | Tags separadas por virgula para filtrar (com ou sem `#`) |
| `tagMatch` | `any` (padrao) ou `all` tags devem corresponder |
| `createdWithin` | Filtrar por tempo de criacao: `30m`, `24h`, `7d` |
| `modifiedWithin` | Filtrar por tempo de modificacao |
| `sortBy` | `created`, `modified`, ou `name` |
| `sortOrder` | `asc` ou `desc` (padrao) |
| `limit` | Maximo de resultados (padrao: 50) |
| `saveTo` | Variavel para resultados |

**Formato de saida:**
```json
{
  "count": 5,
  "totalCount": 12,
  "hasMore": true,
  "notes": [
    {"name": "Note1", "path": "folder/Note1.md", "created": 1234567890, "modified": 1234567900, "tags": ["#todo"]}
  ]
}
```

### note-search

Pesquisa notas por nome ou conteudo.

```yaml
- id: search
  type: note-search
  query: "{{searchTerm}}"
  searchContent: "true"
  limit: "20"
  saveTo: searchResults
```

| Propriedade | Descricao |
|-------------|-----------|
| `query` | String de consulta de pesquisa (obrigatorio, suporta `{{variables}}`) |
| `searchContent` | `true` pesquisa conteudo de arquivos, `false` (padrao) pesquisa apenas nomes de arquivos |
| `limit` | Maximo de resultados (padrao: 10) |
| `saveTo` | Variavel para resultados (obrigatorio) |

**Formato de saida:**
```json
{
  "count": 3,
  "results": [
    {"name": "Note1", "path": "folder/Note1.md", "matchedContent": "...contexto ao redor da correspondencia..."}
  ]
}
```

Quando `searchContent` e `true`, `matchedContent` inclui aproximadamente 50 caracteres antes e depois da correspondencia para contexto.

### folder-list

Lista pastas no vault.

```yaml
- id: listFolders
  type: folder-list
  folder: "Projects"
  saveTo: folderList
```

| Propriedade | Descricao |
|-------------|-----------|
| `folder` | Caminho da pasta pai (vazio para todo o vault) |
| `saveTo` | Variavel para resultados (obrigatorio) |

**Formato de saida:**
```json
{
  "folders": ["Projects/Active", "Projects/Archive", "Projects/Ideas"],
  "count": 3
}
```

As pastas sao ordenadas alfabeticamente.

### open

Abre um arquivo no Obsidian.

```yaml
- id: openNote
  type: open
  path: "{{outputPath}}"
```

| Propriedade | Descricao |
|-------------|-----------|
| `path` | Caminho do arquivo para abrir (obrigatorio, suporta `{{variables}}`) |

Se o caminho nao tiver extensao `.md`, ela e adicionada automaticamente.

### http

Fazer requisicoes HTTP.

```yaml
- id: fetch
  type: http
  url: "https://api.example.com/data"
  method: POST
  contentType: json
  headers: '{"Authorization": "Bearer {{token}}"}'
  body: '{"query": "{{searchTerm}}"}'
  saveTo: response
  saveStatus: statusCode
  throwOnError: "true"
```

| Propriedade | Descricao |
|-------------|-----------|
| `url` | URL da requisicao (obrigatorio) |
| `method` | `GET` (padrao), `POST`, `PUT`, `PATCH`, `DELETE` |
| `contentType` | `json` (padrao), `form-data`, `text` |
| `headers` | Objeto JSON ou formato `Key: Value` (um por linha) |
| `body` | Corpo da requisicao (para POST/PUT/PATCH) |
| `saveTo` | Variavel para corpo da resposta |
| `saveStatus` | Variavel para codigo de status HTTP |
| `throwOnError` | `true` para lancar erro em respostas 4xx/5xx |

**Exemplo de form-data** (upload de arquivo binario com file-explorer):

```yaml
- id: select-pdf
  type: file-explorer
  path: "{{__eventFilePath__}}"
  extensions: "pdf,png,jpg"
  saveTo: fileData
- id: upload
  type: http
  url: "https://example.com/upload"
  method: POST
  contentType: form-data
  body: '{"file": "{{fileData}}"}'
  saveTo: response
```

Para `form-data`:
- FileExplorerData (do no `file-explorer`) e detectado automaticamente e enviado como binario
- Use sintaxe `fieldName:filename` para campos de arquivo de texto (ex: `"file:report.html": "{{htmlContent}}"`)

### json

Analisa uma string JSON em um objeto para acesso a propriedades.

```yaml
- id: parseResponse
  type: json
  source: response
  saveTo: data
```

| Propriedade | Descricao |
|-------------|-----------|
| `source` | Nome da variavel contendo a string JSON (obrigatorio) |
| `saveTo` | Nome da variavel para o resultado analisado (obrigatorio) |

Apos a analise, acesse propriedades usando notacao de ponto: `{{data.items[0].name}}`

**JSON em blocos de codigo markdown:**

O no `json` extrai automaticamente JSON de blocos de codigo markdown:

```yaml
# Se a resposta contem:
# ```json
# {"status": "ok"}
# ```
# O no json extraira e analisara apenas o conteudo JSON
- id: parse
  type: json
  source: llmResponse
  saveTo: parsed
```

Isso e util quando uma resposta LLM envolve JSON em cercas de codigo.

### dialog

Exibir um dialogo com opcoes, botoes e/ou entrada de texto.

```yaml
- id: ask
  type: dialog
  title: Select Options
  message: Choose items to process
  markdown: true
  options: "Option A, Option B, Option C"
  multiSelect: true
  inputTitle: "Additional notes"
  multiline: true
  defaults: '{"input": "default text", "selected": ["Option A"]}'
  button1: Confirm
  button2: Cancel
  saveTo: dialogResult
```

| Propriedade | Descricao |
|-------------|-----------|
| `title` | Titulo do dialogo |
| `message` | Conteudo da mensagem (suporta `{{variables}}`) |
| `markdown` | `true` renderiza mensagem como Markdown |
| `options` | Lista de escolhas separadas por virgula (opcional) |
| `multiSelect` | `true` para checkboxes, `false` para radio buttons |
| `inputTitle` | Rotulo para campo de entrada de texto (mostra entrada quando definido) |
| `multiline` | `true` para area de texto multi-linha |
| `defaults` | JSON com valores iniciais `input` e `selected` |
| `button1` | Rotulo do botao primario (padrao: "OK") |
| `button2` | Rotulo do botao secundario (opcional) |
| `saveTo` | Variavel para o resultado (veja abaixo) |

**Formato do resultado** (variavel `saveTo`):
- `button`: string - texto do botao clicado (ex: "Confirmar", "Cancelar")
- `selected`: string[] - **sempre um array**, mesmo para selecao unica (ex: `["Opcao A"]`)
- `input`: string - valor da entrada de texto (se `inputTitle` foi definido)

> **Importante:** Ao verificar o valor selecionado em uma condicao `if`:
> - Para opcao unica: `{{dialogResult.selected[0]}} == Opcao A`
> - Para verificar se o array contem valor (multiSelect): `{{dialogResult.selected}} contains Opcao A`
> - Errado: `{{dialogResult.selected}} == Opcao A` (compara array com string, sempre false)

**Entrada de texto simples:**
```yaml
- id: input
  type: dialog
  title: Enter value
  inputTitle: Your input
  multiline: true
  saveTo: userInput
```

### workflow

Executar outro workflow como sub-workflow.

```yaml
- id: runSub
  type: workflow
  path: "workflows/summarize.md"
  name: "Summarizer"
  input: '{"text": "{{content}}"}'
  output: '{"result": "summary"}'
  prefix: "sub_"
```

| Propriedade | Descricao |
|-------------|-----------|
| `path` | Caminho para arquivo de workflow (obrigatorio) |
| `name` | Nome do workflow (para arquivos com multiplos workflows) |
| `input` | Mapeamento JSON de variaveis do sub-workflow para valores |
| `output` | Mapeamento JSON de variaveis pai para resultados do sub-workflow |
| `prefix` | Prefixo para todas as variaveis de saida (quando `output` nao especificado) |

### rag-sync

Sincronizar uma nota com um store RAG.

```yaml
- id: sync
  type: rag-sync
  path: "{{fileInfo.path}}"
  ragSetting: "My RAG Store"
  saveTo: syncResult
```

| Propriedade | Descricao |
|-------------|-----------|
| `path` | Caminho da nota para sincronizar (obrigatorio, suporta `{{variables}}`) |
| `ragSetting` | Nome da configuracao RAG (obrigatorio) |
| `saveTo` | Variavel para armazenar resultado (opcional) |

**Formato de saida:**
```json
{
  "path": "folder/note.md",
  "fileId": "abc123...",
  "ragSetting": "My RAG Store",
  "syncedAt": "2025-01-01T12:00:00.000Z"
}
```

### file-explorer

Selecionar um arquivo do vault ou inserir um novo caminho de arquivo. Suporta qualquer tipo de arquivo incluindo imagens e PDFs.

```yaml
- id: selectImage
  type: file-explorer
  mode: select
  title: "Select an image"
  extensions: "png,jpg,jpeg,gif,webp"
  default: "images/"
  saveTo: imageData
  savePathTo: imagePath
```

| Propriedade | Descricao |
|-------------|-----------|
| `path` | Caminho direto do arquivo - pula dialogo quando definido (suporta `{{variables}}`) |
| `mode` | `select` (escolher arquivo existente, padrao) ou `create` (inserir novo caminho) |
| `title` | Titulo do dialogo |
| `extensions` | Extensoes permitidas separadas por virgula (ex: `pdf,png,jpg`) |
| `default` | Caminho padrao (suporta `{{variables}}`) |
| `saveTo` | Variavel para FileExplorerData JSON |
| `savePathTo` | Variavel apenas para o caminho do arquivo |

**Formato FileExplorerData:**
```json
{
  "path": "folder/image.png",
  "basename": "image.png",
  "name": "image",
  "extension": "png",
  "mimeType": "image/png",
  "contentType": "binary",
  "data": "base64-encoded-content"
}
```

**Exemplo: Analise de Imagem (com dialogo)**
```yaml
- id: selectImage
  type: file-explorer
  title: "Select an image to analyze"
  extensions: "png,jpg,jpeg,gif,webp"
  saveTo: imageData
- id: analyze
  type: command
  prompt: "Describe this image in detail"
  attachments: imageData
  saveTo: analysis
- id: save
  type: note
  path: "analysis/{{imageData.name}}.md"
  content: "# Image Analysis\n\n{{analysis}}"
```

**Exemplo: Acionado por evento (sem dialogo)**
```yaml
- id: loadImage
  type: file-explorer
  path: "{{__eventFilePath__}}"
  saveTo: imageData
- id: analyze
  type: command
  prompt: "Describe this image"
  attachments: imageData
  saveTo: result
```

### file-save

Salvar FileExplorerData como arquivo no vault. Util para salvar imagens geradas ou arquivos copiados.

```yaml
- id: saveImage
  type: file-save
  source: generatedImage
  path: "images/output"
  savePathTo: savedPath
```

| Propriedade | Descricao |
|-------------|-----------|
| `source` | Nome da variavel contendo FileExplorerData (obrigatorio) |
| `path` | Caminho para salvar o arquivo (extensao adicionada automaticamente se ausente) |
| `savePathTo` | Variavel para armazenar o caminho final do arquivo (opcional) |

**Exemplo: Gerar e salvar imagem**
```yaml
- id: generate
  type: command
  prompt: "Generate a landscape image"
  model: gemini-3-pro-image-preview
  saveImageTo: generatedImage
- id: save
  type: file-save
  source: generatedImage
  path: "images/landscape"
  savePathTo: savedPath
- id: showResult
  type: dialog
  title: "Image Saved"
  message: "Image saved to {{savedPath}}"
```

### prompt-file

Mostrar seletor de arquivo ou usar arquivo ativo no modo hotkey/evento.

```yaml
- id: selectFile
  type: prompt-file
  title: Select a note
  default: "notes/"
  forcePrompt: "true"
  saveTo: content
  saveFileTo: fileInfo
```

| Propriedade | Descricao |
|-------------|-----------|
| `title` | Titulo do dialogo |
| `default` | Caminho padrao |
| `forcePrompt` | `true` sempre mostra dialogo, mesmo no modo hotkey/evento |
| `saveTo` | Variavel para conteudo do arquivo |
| `saveFileTo` | Variavel para info do arquivo JSON |

**Formato de info do arquivo:** `{"path": "folder/note.md", "basename": "note.md", "name": "note", "extension": "md"}`

**Comportamento por modo de acionamento:**
| Modo | Comportamento |
|------|---------------|
| Panel | Mostra dialogo de selecao de arquivo |
| Hotkey | Usa arquivo ativo automaticamente |
| Evento | Usa arquivo do evento automaticamente |

### prompt-selection

Obter texto selecionado ou mostrar dialogo de selecao.

```yaml
- id: getSelection
  type: prompt-selection
  saveTo: text
  saveSelectionTo: selectionInfo
```

| Propriedade | Descricao |
|-------------|-----------|
| `saveTo` | Variavel para texto selecionado |
| `saveSelectionTo` | Variavel para metadados da selecao JSON |

**Formato de info da selecao:** `{"filePath": "...", "startLine": 1, "endLine": 1, "start": 0, "end": 10}`

**Comportamento por modo de acionamento:**
| Modo | Comportamento |
|------|---------------|
| Panel | Mostra dialogo de selecao |
| Hotkey (com selecao) | Usa selecao atual |
| Hotkey (sem selecao) | Usa conteudo completo do arquivo |
| Evento | Usa conteudo completo do arquivo |

### if / while

Ramificacao condicional e loops.

```yaml
- id: branch
  type: if
  condition: "{{count}} > 10"
  trueNext: handleMany
  falseNext: handleFew

- id: loop
  type: while
  condition: "{{counter}} < {{total}}"
  trueNext: processItem
  falseNext: done
```

| Propriedade | Descricao |
|-------------|-----------|
| `condition` | Expressao com operadores: `==`, `!=`, `<`, `>`, `<=`, `>=`, `contains` |
| `trueNext` | ID do no quando condicao e verdadeira |
| `falseNext` | ID do no quando condicao e falsa |

**O operador `contains`** funciona tanto com strings quanto com arrays:
- String: `{{text}} contains error` - verifica se "error" esta na string
- Array: `{{dialogResult.selected}} contains Opcao A` - verifica se "Opcao A" esta no array

> **Regra de referência retroativa**: A propriedade `next` só pode referenciar nós anteriores se o destino for um nó `while`. Isso evita código espaguete e garante uma estrutura de loop adequada.

### variable / set

Declarar e atualizar variaveis.

```yaml
- id: init
  type: variable
  name: counter
  value: 0

- id: increment
  type: set
  name: counter
  value: "{{counter}} + 1"
```

**Variável especial `_clipboard`:**

Se você definir uma variável chamada `_clipboard`, seu valor será copiado para a área de transferência do sistema:

```yaml
- id: copyToClipboard
  type: set
  name: _clipboard
  value: "{{result}}"
```

### mcp

Chamar uma ferramenta de servidor MCP (Model Context Protocol) remoto via HTTP.

```yaml
- id: search
  type: mcp
  url: "https://mcp.example.com/v1"
  tool: "web_search"
  args: '{"query": "{{searchTerm}}"}'
  headers: '{"Authorization": "Bearer {{apiKey}}"}'
  saveTo: searchResults
```

| Propriedade | Descricao |
|-------------|-----------|
| `url` | URL do endpoint do servidor MCP (obrigatorio, suporta `{{variables}}`) |
| `tool` | Nome da ferramenta para chamar no servidor MCP (obrigatorio) |
| `args` | Objeto JSON com argumentos da ferramenta (suporta `{{variables}}`) |
| `headers` | Objeto JSON com headers HTTP (ex: para autenticacao) |
| `saveTo` | Nome da variavel para o resultado |

**Caso de uso:** Chamar servidores MCP remotos para consultas RAG, busca web, integracoes de API, etc.

### obsidian-command

Executa um comando do Obsidian pelo seu ID. Isso permite que workflows acionem qualquer comando do Obsidian, incluindo comandos de outros plugins.

```yaml
- id: toggle-fold
  type: obsidian-command
  command: "editor:toggle-fold"
  saveTo: result
```

| Propriedade | Descricao |
|-------------|-----------|
| `command` | ID do comando a executar (obrigatorio, suporta `{{variables}}`) |
| `path` | Arquivo a abrir antes de executar o comando (opcional, a aba fecha automaticamente depois) |
| `saveTo` | Variavel para armazenar o resultado da execucao (opcional) |

**Formato de saida** (quando `saveTo` esta definido):
```json
{
  "commandId": "editor:toggle-fold",
  "path": "notes/example.md",
  "executed": true,
  "timestamp": 1704067200000
}
```

**Encontrando IDs de comandos:**
1. Abrir Configuracoes do Obsidian → Atalhos
2. Pesquisar pelo comando desejado
3. O ID do comando e exibido (ex., `editor:toggle-fold`, `app:reload`)

**IDs de comandos comuns:**
| ID do Comando | Descricao |
|---------------|-----------|
| `editor:toggle-fold` | Alternar dobra no cursor |
| `editor:fold-all` | Dobrar todos os cabecalhos |
| `editor:unfold-all` | Desdobrar todos os cabecalhos |
| `app:reload` | Recarregar Obsidian |
| `workspace:close` | Fechar painel atual |
| `file-explorer:reveal-active-file` | Revelar arquivo no explorador |

**Exemplo: Workflow com comando de plugin**
```yaml
name: Escrever Log de Trabalho
nodes:
  - id: get-content
    type: dialog
    inputTitle: "Digite o conteudo do log"
    multiline: true
    saveTo: logContent
  - id: copy-to-clipboard
    type: set
    name: "_clipboard"
    value: "{{logContent.input}}"
  - id: write-to-log
    type: obsidian-command
    command: "work-log:write-from-clipboard"
```

**Caso de uso:** Acionar comandos principais do Obsidian ou comandos de outros plugins como parte de um workflow.

**Exemplo: Criptografar todos os arquivos em um diretorio**

Este workflow criptografa todos os arquivos Markdown em uma pasta especificada usando o comando de criptografia do Gemini Helper:

```yaml
name: criptografar-pasta
nodes:
  - id: init-index
    type: variable
    name: index
    value: "0"
  - id: list-files
    type: note-list
    folder: "private"
    recursive: "true"
    saveTo: fileList
  - id: loop
    type: while
    condition: "{{index}} < {{fileList.count}}"
    trueNext: encrypt
    falseNext: done
  - id: encrypt
    type: obsidian-command
    command: "gemini-helper:encrypt-file"
    path: "{{fileList.notes[index].path}}"
  - id: increment
    type: set
    name: index
    value: "{{index}} + 1"
    next: loop
  - id: done
    type: dialog
    title: "Concluido"
    message: "{{index}} arquivos criptografados"
```

> **Nota:** A propriedade `path` abre o arquivo, executa o comando e entao fecha automaticamente a aba. Arquivos ja abertos permanecem abertos.

---

**Exemplo: Consulta RAG com ragujuary**

[ragujuary](https://github.com/takeshy/ragujuary) e uma ferramenta CLI para gerenciar Gemini File Search Stores com suporte a servidor MCP.

1. Instalar e configurar:
```bash
go install github.com/takeshy/ragujuary@latest
export GEMINI_API_KEY=your-api-key

# Criar um store e fazer upload de arquivos
ragujuary upload --create -s mystore ./docs

# Iniciar servidor MCP (use --transport http, nao sse)
ragujuary serve --transport http --port 8080 --serve-api-key mysecretkey
```

2. Exemplo de workflow:
```yaml
name: RAG Search
nodes:
  - id: query
    type: mcp
    url: "http://localhost:8080"
    tool: "query"
    args: '{"store_name": "mystore", "question": "How does authentication work?", "show_citations": true}'
    headers: '{"X-API-Key": "mysecretkey"}'
    saveTo: result
  - id: show
    type: dialog
    title: "Search Result"
    message: "{{result}}"
    markdown: true
    button1: "OK"
```

## Terminacao de Workflow

Use `next: end` para terminar explicitamente o workflow:

```yaml
- id: save
  type: note
  path: "output.md"
  content: "{{result}}"
  next: end    # Workflow termina aqui

- id: branch
  type: if
  condition: "{{cancel}}"
  trueNext: end      # Terminar workflow na ramificacao verdadeira
  falseNext: continue
```

## Expansao de Variaveis

Use sintaxe `{{variable}}` para referenciar variaveis:

```yaml
# Basico
path: "{{folder}}/{{filename}}.md"

# Acesso a objeto/array
url: "https://api.example.com?lat={{geo.latitude}}"
content: "{{items[0].name}}"

# Variaveis aninhadas (para loops)
path: "{{parsed.notes[{{counter}}].path}}"
```

## Nos de Entrada Inteligentes

Os nos `prompt-selection` e `prompt-file` detectam automaticamente o contexto de execucao:

| No | Modo Panel | Modo Hotkey | Modo Evento |
|----|------------|-------------|-------------|
| `prompt-file` | Mostra seletor de arquivo | Usa arquivo ativo | Usa arquivo do evento |
| `prompt-selection` | Mostra dialogo de selecao | Usa selecao ou arquivo completo | Usa conteudo completo do arquivo |

---

## Gatilhos de Evento

Workflows podem ser acionados automaticamente por eventos do Obsidian.

![Configuracoes de Gatilho de Evento](event_setting.png)

### Eventos Disponiveis

| Evento | Descricao |
|--------|-----------|
| `create` | Arquivo criado |
| `modify` | Arquivo modificado/salvo (debounced 5s) |
| `delete` | Arquivo excluido |
| `rename` | Arquivo renomeado |
| `file-open` | Arquivo aberto |

### Variaveis de Evento

Quando acionado por um evento, estas variaveis sao definidas automaticamente:

| Variavel | Descricao |
|----------|-----------|
| `__eventType__` | Tipo de evento: `create`, `modify`, `delete`, `rename`, `file-open` |
| `__eventFilePath__` | Caminho do arquivo afetado |
| `__eventFile__` | JSON: `{"path": "...", "basename": "...", "name": "...", "extension": "..."}` |
| `__eventFileContent__` | Conteudo do arquivo (para eventos create/modify/file-open) |
| `__eventOldPath__` | Caminho anterior (apenas para eventos rename) |

### Sintaxe de Padrao de Arquivo

Filtrar eventos por caminho de arquivo usando padroes glob:

| Padrao | Corresponde |
|--------|-------------|
| `**/*.md` | Todos os arquivos .md em qualquer pasta |
| `journal/*.md` | Arquivos .md diretamente na pasta journal |
| `*.md` | Arquivos .md apenas na pasta raiz |
| `**/{daily,weekly}/*.md` | Arquivos nas pastas daily ou weekly |
| `projects/[a-z]*.md` | Arquivos comecando com letra minuscula |
| `docs/**` | Todos os arquivos sob a pasta docs |

### Exemplo de Workflow Acionado por Evento

````markdown
```workflow
name: Auto-Tag New Notes
nodes:
  - id: getContent
    type: prompt-selection
    saveTo: content
  - id: analyze
    type: command
    prompt: "Suggest 3 tags for this note:\n\n{{content}}"
    saveTo: tags
  - id: prepend
    type: note
    path: "{{__eventFilePath__}}"
    content: "---\ntags: {{tags}}\n---\n\n{{content}}"
    mode: overwrite
    confirm: false
```
````

**Configuracao:** Clique em (lightning) no painel Workflow -> habilite "File Created" -> defina padrao `**/*.md`

---

## Exemplos Praticos

### 1. Resumo de Nota

````markdown
```workflow
name: Note Summary
nodes:
  - id: select
    type: prompt-file
    title: Select note
    saveTo: content
    saveFileTo: fileInfo
  - id: parseFile
    type: json
    source: fileInfo
    saveTo: file
  - id: summarize
    type: command
    prompt: "Summarize this note:\n\n{{content}}"
    saveTo: summary
  - id: save
    type: note
    path: "summaries/{{file.name}}"
    content: "# Summary\n\n{{summary}}\n\n---\n*Source: {{file.path}}*"
    mode: create
```
````

### 2. Pesquisa Web

````markdown
```workflow
name: Web Research
nodes:
  - id: topic
    type: dialog
    title: Research topic
    inputTitle: Topic
    saveTo: input
  - id: search
    type: command
    model: gemini-3-flash-preview
    ragSetting: __websearch__
    prompt: |
      Search the web for: {{input.input}}

      Include key facts, recent developments, and sources.
    saveTo: research
  - id: save
    type: note
    path: "research/{{input.input}}.md"
    content: "# {{input.input}}\n\n{{research}}"
    mode: overwrite
```
````

### 3. Processamento Condicional

````markdown
```workflow
name: Smart Summarizer
nodes:
  - id: input
    type: dialog
    title: Enter text to process
    inputTitle: Text
    multiline: true
    saveTo: userInput
  - id: branch
    type: if
    condition: "{{userInput.input.length}} > 500"
    trueNext: summarize
    falseNext: enhance
  - id: summarize
    type: command
    prompt: "Summarize this long text:\n\n{{userInput.input}}"
    saveTo: result
    next: save
  - id: enhance
    type: command
    prompt: "Expand and enhance this short text:\n\n{{userInput.input}}"
    saveTo: result
    next: save
  - id: save
    type: note
    path: "processed/output.md"
    content: "{{result}}"
    mode: overwrite
```
````

### 4. Processar Notas em Lote

````markdown
```workflow
name: Tag Analyzer
nodes:
  - id: init
    type: variable
    name: counter
    value: 0
  - id: initReport
    type: variable
    name: report
    value: "# Tag Suggestions\n\n"
  - id: list
    type: note-list
    folder: Clippings
    limit: 5
    saveTo: notes
  - id: json
    type: json
    source: notes
    saveTo: parsed
  - id: loop
    type: while
    condition: "{{counter}} < {{parsed.count}}"
    trueNext: read
    falseNext: finish
  - id: read
    type: note-read
    path: "{{parsed.notes[{{counter}}].path}}"
    saveTo: content
  - id: analyze
    type: command
    prompt: "Suggest 3 tags for:\n\n{{content}}"
    saveTo: tags
  - id: append
    type: set
    name: report
    value: "{{report}}## {{parsed.notes[{{counter}}].name}}\n{{tags}}\n\n"
  - id: increment
    type: set
    name: counter
    value: "{{counter}} + 1"
    next: loop
  - id: finish
    type: note
    path: "reports/tag-suggestions.md"
    content: "{{report}}"
    mode: overwrite
```
````

### 5. Integracao de API

````markdown
```workflow
name: Weather Report
nodes:
  - id: city
    type: dialog
    title: City name
    inputTitle: City
    saveTo: cityInput
  - id: geocode
    type: http
    url: "https://geocoding-api.open-meteo.com/v1/search?name={{cityInput.input}}&count=1"
    method: GET
    saveTo: geoResponse
  - id: parseGeo
    type: json
    source: geoResponse
    saveTo: geo
  - id: weather
    type: http
    url: "https://api.open-meteo.com/v1/forecast?latitude={{geo.results[0].latitude}}&longitude={{geo.results[0].longitude}}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto"
    method: GET
    saveTo: weatherData
  - id: parse
    type: json
    source: weatherData
    saveTo: data
  - id: report
    type: command
    prompt: "Create a weather report:\n{{data}}"
    saveTo: summary
  - id: save
    type: note
    path: "weather/{{cityInput.input}}.md"
    content: "# Weather: {{cityInput.input}}\n\n{{summary}}"
    mode: overwrite
```
````

### 6. Traduzir Selecao (com Hotkey)

````markdown
```workflow
name: Translate Selection
nodes:
  - id: getSelection
    type: prompt-selection
    saveTo: text
  - id: translate
    type: command
    prompt: "Translate the following text to English:\n\n{{text}}"
    saveTo: translated
  - id: output
    type: note
    path: "translations/translated.md"
    content: "## Original\n{{text}}\n\n## Translation\n{{translated}}\n\n---\n"
    mode: append
  - id: show
    type: open
    path: "translations/translated.md"
```
````

**Configuracao de hotkey:**
1. Adicione um campo `name:` ao seu workflow
2. Abra o arquivo do workflow e selecione o workflow no dropdown
3. Clique no icone de teclado no rodape do painel Workflow
4. Va para Configuracoes -> Atalhos -> pesquise "Workflow: Translate Selection"
5. Atribua um atalho (ex: `Ctrl+Shift+T`)

### 7. Composicao de Sub-Workflow

**Arquivo: `workflows/translate.md`**
````markdown
```workflow
name: Translator
nodes:
  - id: translate
    type: command
    prompt: "Translate to {{targetLang}}:\n\n{{text}}"
    saveTo: translated
```
````

**Arquivo: `workflows/main.md`**
````markdown
```workflow
name: Multi-Language Export
nodes:
  - id: input
    type: dialog
    title: Enter text to translate
    inputTitle: Text
    multiline: true
    saveTo: userInput
  - id: toJapanese
    type: workflow
    path: "workflows/translate.md"
    name: "Translator"
    input: '{"text": "{{userInput.input}}", "targetLang": "Japanese"}'
    output: '{"japaneseText": "translated"}'
  - id: toSpanish
    type: workflow
    path: "workflows/translate.md"
    name: "Translator"
    input: '{"text": "{{userInput.input}}", "targetLang": "Spanish"}'
    output: '{"spanishText": "translated"}'
  - id: save
    type: note
    path: "translations/output.md"
    content: |
      # Original
      {{userInput.input}}

      ## Japanese
      {{japaneseText}}

      ## Spanish
      {{spanishText}}
    mode: overwrite
```
````

### 8. Selecao Interativa de Tarefas

````markdown
```workflow
name: Task Processor
nodes:
  - id: selectTasks
    type: dialog
    title: Select Tasks
    message: Choose which tasks to perform on the current note
    options: "Summarize, Extract key points, Translate to English, Fix grammar"
    multiSelect: true
    button1: Process
    button2: Cancel
    saveTo: selection
  - id: checkCancel
    type: if
    condition: "{{selection.button}} == 'Cancel'"
    trueNext: cancelled
    falseNext: getFile
  - id: getFile
    type: prompt-file
    saveTo: content
  - id: process
    type: command
    prompt: |
      Perform the following tasks on this text:
      Tasks: {{selection.selected}}

      Text:
      {{content}}
    saveTo: result
  - id: save
    type: note
    path: "processed/result.md"
    content: "{{result}}"
    mode: create
    next: end
  - id: cancelled
    type: dialog
    title: Cancelled
    message: Operation was cancelled by user.
    button1: OK
    next: end
```
````

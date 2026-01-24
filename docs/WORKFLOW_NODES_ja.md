# ワークフローノードリファレンス

このドキュメントでは、すべてのワークフローノードタイプの詳細仕様を説明します。ほとんどのユーザーは**これらの詳細を学ぶ必要はありません** - やりたいことを自然言語で説明するだけで、AI がワークフローを作成・修正してくれます。

## ノードタイプ一覧

| カテゴリ | ノード | 説明 |
|----------|--------|------|
| 変数 | `variable`, `set` | 変数の宣言と更新 |
| 制御 | `if`, `while` | 条件分岐とループ |
| LLM | `command` | モデル/検索設定付きプロンプト実行 |
| データ | `http`, `json` | HTTP リクエストと JSON パース |
| ノート | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` | Vault 操作 |
| ファイル | `file-explorer`, `file-save` | ファイル選択と保存（画像、PDF など） |
| プロンプト | `prompt-file`, `prompt-selection`, `dialog` | ユーザー入力ダイアログ |
| 合成 | `workflow` | 別のワークフローをサブワークフローとして実行 |
| RAG | `rag-sync` | ノートを RAG ストアに同期 |
| 外部連携 | `mcp`, `obsidian-command` | 外部 MCP サーバーまたは Obsidian コマンドを呼び出し |
| ユーティリティ | `sleep` | ワークフロー実行を一時停止 |

---

## ワークフローオプション

`options` セクションを追加してワークフローの動作を制御できます：

```yaml
name: My Workflow
options:
  showProgress: false  # 実行進捗モーダルを非表示（デフォルト: true）
nodes:
  - id: step1
    type: command
    ...
```

| オプション | 型 | デフォルト | 説明 |
|------------|------|---------|-------------|
| `showProgress` | boolean | `true` | ホットキーまたはワークフローリストから実行時に進捗モーダルを表示 |

**注意:** `showProgress` オプションはホットキーまたはワークフローリストからの実行時のみ影響します。ビジュアルワークフローパネルでは常に進捗が表示されます。

---

## ノードリファレンス

### command

モデル、検索、ボールトツール、MCP 設定を指定して LLM プロンプトを実行。

```yaml
- id: search
  type: command
  model: gemini-3-flash-preview  # 任意: 特定のモデル
  ragSetting: __websearch__      # 任意: __websearch__, __none__, または設定名
  vaultTools: all                # 任意: all, noSearch, none
  mcpServers: "server1,server2"  # 任意: カンマ区切りの MCP サーバー名
  prompt: "{{topic}}を検索"
  saveTo: result
```

| プロパティ | 説明 |
|------------|------|
| `prompt` | LLM に送るプロンプト（必須） |
| `model` | モデルを指定（利用可能なモデルは API プラン設定に依存） |
| `ragSetting` | `__websearch__`（Web 検索）、`__none__`（検索なし）、RAG 設定名、または省略で現在の設定 |
| `vaultTools` | ボールトツールモード: `all`（検索 + 読み書き）、`noSearch`（読み書きのみ）、`none`（無効）。デフォルト: `all` |
| `mcpServers` | 有効にする MCP サーバー名（カンマ区切り、プラグイン設定で構成済みである必要あり） |
| `attachments` | FileExplorerData を含む変数名（カンマ区切り、`file-explorer` ノードから取得） |
| `saveTo` | テキスト応答を保存する変数名 |
| `saveImageTo` | 生成された画像を保存する変数名（FileExplorerData形式、画像モデル用） |

**画像生成の例**:
```yaml
- id: generate
  type: command
  prompt: "かわいい猫のイラストを生成して"
  model: gemini-3-pro-image-preview
  saveImageTo: generatedImage
- id: save-image
  type: note
  path: "images/cat"
  content: "![cat](data:{{generatedImage.mimeType}};base64,{{generatedImage.data}})"
```

**CLI モデル:**

プラグイン設定で CLI が構成されている場合、ワークフローで CLI モデル（`gemini-cli`、`claude-cli`、`codex-cli`）を使用できます。CLI モデルは API コストなしでフラッグシップモデルにアクセスするのに便利です。

```yaml
- id: analyze
  type: command
  model: claude-cli
  prompt: "このコードを分析して:\n\n{{code}}"
  saveTo: analysis
```

> **注意:** CLI モデルは RAG、Web 検索、画像生成をサポートしていません。CLI モデルでは `ragSetting` と `saveImageTo` プロパティは無視されます。

### note

ノートファイルにコンテンツを書き込み。

```yaml
- id: save
  type: note
  path: "output/{{filename}}.md"
  content: "{{result}}"
  mode: overwrite
  confirm: true
```

| プロパティ | 説明 |
|------------|------|
| `path` | ファイルパス（必須） |
| `content` | 書き込む内容 |
| `mode` | `overwrite`（デフォルト）、`append`、または `create`（存在時スキップ） |
| `confirm` | `true`（デフォルト）で確認ダイアログ、`false` で即座に書き込み |
| `history` | `true`（デフォルト、グローバル設定に従う）で編集履歴に保存、`false` でこの書き込みの履歴を無効化 |

### note-read

ノートファイルから内容を読み取り。

```yaml
- id: read
  type: note-read
  path: "notes/config.md"
  saveTo: content
```

| プロパティ | 説明 |
|------------|------|
| `path` | 読み取るファイルパス（必須） |
| `saveTo` | ファイル内容を保存する変数名（必須） |

**暗号化ファイルのサポート:**

対象ファイルが（プラグインの暗号化機能で）暗号化されている場合、ワークフローは自動的に：
1. 現在のセッションでパスワードがキャッシュされているか確認
2. キャッシュがない場合、ユーザーにパスワード入力を促す
3. ファイル内容を復号して変数に保存
4. 以降の読み取りのためにパスワードをキャッシュ（同じ Obsidian セッション内）

一度パスワードを入力すれば、Obsidian を再起動するまで他の暗号化ファイルを読み取る際に再入力は不要です。

**例: 暗号化ファイルから API キーを読み取り、外部 API を呼び出す**

このワークフローは、暗号化されたファイルに保存された API キーを読み取り、外部 API を呼び出し、結果を表示します：

```yaml
name: 暗号化キーで API を呼び出し
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
    title: API レスポンス
    message: "{{response}}"
    markdown: true
    button1: OK
```

> **ヒント:** API キーなどの機密データは暗号化ファイルに保存しましょう。コマンドパレットの「ファイルを暗号化」コマンドを使用して、シークレットを含むファイルを暗号化できます。

### note-list

フィルタリングとソート付きでノートを一覧表示。

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

| プロパティ | 説明 |
|------------|------|
| `folder` | フォルダパス（空で Vault 全体） |
| `recursive` | `true` でサブフォルダ含む、`false`（デフォルト）で直下のみ |
| `tags` | フィルタするタグ（カンマ区切り、`#` 有無どちらも可） |
| `tagMatch` | `any`（デフォルト）または `all` でタグマッチ |
| `createdWithin` | 作成日時でフィルタ: `30m`、`24h`、`7d` |
| `modifiedWithin` | 更新日時でフィルタ |
| `sortBy` | `created`、`modified`、または `name` |
| `sortOrder` | `asc` または `desc`（デフォルト） |
| `limit` | 最大件数（デフォルト: 50） |
| `saveTo` | 結果を保存する変数 |

**出力形式:**
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

名前またはコンテンツでノートを検索。

```yaml
- id: search
  type: note-search
  query: "{{searchTerm}}"
  searchContent: "true"
  limit: "20"
  saveTo: searchResults
```

| プロパティ | 説明 |
|------------|------|
| `query` | 検索クエリ文字列（必須、`{{variables}}` 対応） |
| `searchContent` | `true` でファイル内容を検索、`false`（デフォルト）でファイル名のみ検索 |
| `limit` | 最大件数（デフォルト: 10） |
| `saveTo` | 結果を保存する変数（必須） |

**出力形式:**
```json
{
  "count": 3,
  "results": [
    {"name": "Note1", "path": "folder/Note1.md", "matchedContent": "...マッチした周辺のコンテキスト..."}
  ]
}
```

`searchContent` が `true` の場合、`matchedContent` にはマッチ箇所の前後約50文字のコンテキストが含まれます。

### folder-list

Vault 内のフォルダを一覧表示。

```yaml
- id: listFolders
  type: folder-list
  folder: "Projects"
  saveTo: folderList
```

| プロパティ | 説明 |
|------------|------|
| `folder` | 親フォルダパス（空で Vault 全体） |
| `saveTo` | 結果を保存する変数（必須） |

**出力形式:**
```json
{
  "folders": ["Projects/Active", "Projects/Archive", "Projects/Ideas"],
  "count": 3
}
```

フォルダはアルファベット順にソートされます。

### open

Obsidian でファイルを開く。

```yaml
- id: openNote
  type: open
  path: "{{outputPath}}"
```

| プロパティ | 説明 |
|------------|------|
| `path` | 開くファイルパス（必須、`{{variables}}` 対応） |

パスに `.md` 拡張子がない場合、自動的に追加されます。

### http

HTTP リクエストを実行。

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

| プロパティ | 説明 |
|------------|------|
| `url` | リクエスト URL（必須） |
| `method` | `GET`（デフォルト）、`POST`、`PUT`、`PATCH`、`DELETE` |
| `contentType` | `json`（デフォルト）、`form-data`、`text` |
| `headers` | JSON オブジェクトまたは `Key: Value` 形式（1行1つ） |
| `body` | リクエストボディ（POST/PUT/PATCH 用） |
| `saveTo` | レスポンスボディを保存する変数 |
| `saveStatus` | HTTP ステータスコードを保存する変数 |
| `throwOnError` | `true` で 4xx/5xx 応答時にエラーをスロー |

**form-data 例**（file-explorer でバイナリファイルアップロード）:

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

`form-data` の場合:
- FileExplorerData（`file-explorer` ノードから）は自動検出されバイナリとして送信
- テキストファイルには `フィールド名:ファイル名` 構文を使用（例: `"file:report.html": "{{htmlContent}}"`）

### json

JSON 文字列をオブジェクトにパースしてプロパティアクセスを可能にする。

```yaml
- id: parseResponse
  type: json
  source: response
  saveTo: data
```

| プロパティ | 説明 |
|------------|------|
| `source` | JSON 文字列を含む変数名（必須） |
| `saveTo` | パース結果を保存する変数名（必須） |

パース後、ドット記法でプロパティにアクセス: `{{data.items[0].name}}`

**Markdown コードブロック内の JSON:**

`json` ノードは Markdown コードブロックから JSON を自動的に抽出します:

```yaml
# response が以下を含む場合:
# ```json
# {"status": "ok"}
# ```
# json ノードは JSON コンテンツのみを抽出してパース
- id: parse
  type: json
  source: llmResponse
  saveTo: parsed
```

これは LLM の応答が JSON をコードフェンスでラップしている場合に便利です。

### dialog

オプション、ボタン、テキスト入力付きのダイアログを表示。

```yaml
- id: ask
  type: dialog
  title: オプションを選択
  message: 処理する項目を選んでください
  markdown: true
  options: "オプション A, オプション B, オプション C"
  multiSelect: true
  inputTitle: "追加メモ"
  multiline: true
  defaults: '{"input": "デフォルトテキスト", "selected": ["オプション A"]}'
  button1: 確認
  button2: キャンセル
  saveTo: dialogResult
```

| プロパティ | 説明 |
|------------|------|
| `title` | ダイアログタイトル |
| `message` | メッセージ内容（`{{変数}}` をサポート） |
| `markdown` | `true` でメッセージを Markdown としてレンダリング |
| `options` | カンマ区切りの選択肢リスト（任意） |
| `multiSelect` | `true` でチェックボックス、`false` でラジオボタン |
| `inputTitle` | テキスト入力フィールドのラベル（設定時に入力欄を表示） |
| `multiline` | `true` で複数行テキストエリア |
| `defaults` | 初期値の JSON（`input` と `selected`） |
| `button1` | プライマリボタンラベル（デフォルト: "OK"） |
| `button2` | セカンダリボタンラベル（任意） |
| `saveTo` | 結果を保存する変数（以下参照） |

**結果形式**（`saveTo` 変数）:
- `button`: string - クリックされたボタンのテキスト（例: "確認", "キャンセル"）
- `selected`: string[] - **常に配列**、単一選択でも（例: `["オプション A"]`）
- `input`: string - テキスト入力値（`inputTitle` が設定されていた場合）

> **重要:** `if` 条件で選択値をチェックする場合：
> - 単一オプション: `{{dialogResult.selected[0]}} == オプション A`
> - 配列に値が含まれるか（multiSelect）: `{{dialogResult.selected}} contains オプション A`
> - 間違い: `{{dialogResult.selected}} == オプション A`（配列と文字列の比較、常に false）

**シンプルなテキスト入力:**
```yaml
- id: input
  type: dialog
  title: 値を入力
  inputTitle: 入力
  multiline: true
  saveTo: userInput
```

### workflow

別のワークフローをサブワークフローとして実行。

```yaml
- id: runSub
  type: workflow
  path: "workflows/summarize.md"
  name: "Summarizer"
  input: '{"text": "{{content}}"}'
  output: '{"result": "summary"}'
  prefix: "sub_"
```

| プロパティ | 説明 |
|------------|------|
| `path` | ワークフローファイルのパス（必須） |
| `name` | ワークフロー名（ファイルに複数ある場合） |
| `input` | サブワークフロー変数へのマッピング JSON |
| `output` | 親変数へのマッピング JSON |
| `prefix` | 出力変数の接頭辞（`output` 未指定時） |

### rag-sync

ノートを RAG ストアに同期。

```yaml
- id: sync
  type: rag-sync
  path: "{{fileInfo.path}}"
  ragSetting: "My RAG Store"
  saveTo: syncResult
```

| プロパティ | 説明 |
|------------|------|
| `path` | 同期するノートのパス（必須、`{{変数}}` 対応） |
| `ragSetting` | RAG 設定名（必須） |
| `saveTo` | 結果を保存する変数（任意） |

**出力形式:**
```json
{
  "path": "folder/note.md",
  "fileId": "abc123...",
  "ragSetting": "My RAG Store",
  "syncedAt": "2025-01-01T12:00:00.000Z"
}
```

### prompt-file

ファイル選択ダイアログを表示、またはホットキー/イベントモードでアクティブファイルを使用。

```yaml
- id: selectFile
  type: prompt-file
  title: ノートを選択
  default: "notes/"
  forcePrompt: "true"
  saveTo: content
  saveFileTo: fileInfo
```

| プロパティ | 説明 |
|------------|------|
| `title` | ダイアログタイトル |
| `default` | デフォルトパス |
| `forcePrompt` | `true` でホットキー/イベントモードでも常にダイアログ表示 |
| `saveTo` | ファイル内容を保存する変数 |
| `saveFileTo` | ファイル情報 JSON を保存する変数 |

**ファイル情報形式:** `{"path": "folder/note.md", "basename": "note.md", "name": "note", "extension": "md"}`

**トリガーモード別の動作:**
| モード | 動作 |
|--------|------|
| パネル | ファイル選択ダイアログを表示 |
| ホットキー | アクティブファイルを自動使用 |
| イベント | イベント対象ファイルを自動使用 |

### prompt-selection

選択テキストを取得、または選択ダイアログを表示。

```yaml
- id: getSelection
  type: prompt-selection
  saveTo: text
  saveSelectionTo: selectionInfo
```

| プロパティ | 説明 |
|------------|------|
| `saveTo` | 選択テキストを保存する変数 |
| `saveSelectionTo` | 選択メタデータ JSON を保存する変数 |

**選択情報形式:** `{"filePath": "...", "startLine": 1, "endLine": 1, "start": 0, "end": 10}`

**トリガーモード別の動作:**
| モード | 動作 |
|--------|------|
| パネル | 選択ダイアログを表示 |
| ホットキー（選択あり） | 現在の選択を使用 |
| ホットキー（選択なし） | ファイル全体を使用 |
| イベント | ファイル全体を使用 |

### file-explorer

Vault からファイルを選択、または新しいファイルパスを入力。画像や PDF などあらゆるファイルタイプに対応。

```yaml
- id: selectImage
  type: file-explorer
  mode: select
  title: "画像を選択"
  extensions: "png,jpg,jpeg,gif,webp"
  default: "images/"
  saveTo: imageData
  savePathTo: imagePath
```

| プロパティ | 説明 |
|------------|------|
| `path` | 直接ファイルパス - 指定時はダイアログをスキップ（`{{variables}}` 対応） |
| `mode` | `select`（既存ファイル選択、デフォルト）または `create`（新規パス入力） |
| `title` | ダイアログタイトル |
| `extensions` | 許可する拡張子（カンマ区切り、例：`pdf,png,jpg`） |
| `default` | デフォルトパス（`{{variables}}` 対応） |
| `saveTo` | FileExplorerData JSON を保存する変数 |
| `savePathTo` | ファイルパスのみを保存する変数 |

**FileExplorerData 形式:**
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

**例: 画像解析（ダイアログあり）**
```yaml
- id: selectImage
  type: file-explorer
  title: "解析する画像を選択"
  extensions: "png,jpg,jpeg,gif,webp"
  saveTo: imageData
- id: analyze
  type: command
  prompt: "この画像を詳細に説明してください"
  attachments: imageData
  saveTo: analysis
- id: save
  type: note
  path: "analysis/{{imageData.name}}.md"
  content: "# 画像解析\n\n{{analysis}}"
```

**例: イベントトリガー（ダイアログなし）**
```yaml
- id: loadImage
  type: file-explorer
  path: "{{__eventFilePath__}}"
  saveTo: imageData
- id: analyze
  type: command
  prompt: "この画像を説明して"
  attachments: imageData
  saveTo: result
```

### file-save

FileExplorerData を Vault 内にファイルとして保存。生成された画像やコピーしたファイルの保存に便利。

```yaml
- id: saveImage
  type: file-save
  source: generatedImage
  path: "images/output"
  savePathTo: savedPath
```

| プロパティ | 説明 |
|------------|------|
| `source` | FileExplorerData を含む変数名（必須） |
| `path` | 保存先パス（拡張子は自動追加） |
| `savePathTo` | 最終ファイルパスを保存する変数（任意） |

**例: 画像を生成して保存**
```yaml
- id: generate
  type: command
  prompt: "風景画像を生成して"
  model: gemini-3-pro-image-preview
  saveImageTo: generatedImage
- id: save
  type: file-save
  source: generatedImage
  path: "images/landscape"
  savePathTo: savedPath
- id: showResult
  type: dialog
  title: "保存完了"
  message: "画像を {{savedPath}} に保存しました"
```

### if / while

条件分岐とループ。

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

| プロパティ | 説明 |
|------------|------|
| `condition` | 演算子付き式: `==`、`!=`、`<`、`>`、`<=`、`>=`、`contains` |
| `trueNext` | 条件が true のときのノード ID |
| `falseNext` | 条件が false のときのノード ID |

**`contains` 演算子**は文字列と配列の両方で動作します:
- 文字列: `{{text}} contains error` - "error" が文字列に含まれているか
- 配列: `{{dialogResult.selected}} contains オプション A` - "オプション A" が配列に含まれているか

> **後方参照ルール**: `next` プロパティは、対象が `while` ノードの場合のみ、前のノードを参照できます。これにより、スパゲッティコードを防ぎ、適切なループ構造を確保します。例えば、`next: loop` は `loop` が `while` ノードである場合のみ有効です。

### variable / set

変数の宣言と更新。

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

**特殊変数 `_clipboard`:**

`_clipboard` という名前の変数を設定すると、その値がシステムクリップボードにコピーされます：

```yaml
- id: copyToClipboard
  type: set
  name: _clipboard
  value: "{{result}}"
```

これは他のアプリケーションやクリップボードから読み取る Obsidian プラグインとの連携に便利です。

### mcp

リモート MCP（Model Context Protocol）サーバーのツールを HTTP 経由で呼び出します。

```yaml
- id: search
  type: mcp
  url: "https://mcp.example.com/v1"
  tool: "web_search"
  args: '{"query": "{{searchTerm}}"}'
  headers: '{"Authorization": "Bearer {{apiKey}}"}'
  saveTo: searchResults
```

| プロパティ | 説明 |
|------------|------|
| `url` | MCP サーバーのエンドポイント URL（必須、`{{変数}}` 対応） |
| `tool` | MCP サーバー上で呼び出すツール名（必須） |
| `args` | ツール引数の JSON オブジェクト（`{{変数}}` 対応） |
| `headers` | HTTP ヘッダーの JSON オブジェクト（認証など） |
| `saveTo` | 結果を保存する変数名 |

**使用例:** RAG クエリ、Web 検索、API 連携などのリモート MCP サーバー呼び出し。

### obsidian-command

コマンド ID を指定して Obsidian コマンドを実行します。他のプラグインのコマンドを含む、あらゆる Obsidian コマンドをワークフローからトリガーできます。

```yaml
- id: toggle-fold
  type: obsidian-command
  command: "editor:toggle-fold"
  saveTo: result
```

| プロパティ | 説明 |
|------------|------|
| `command` | 実行するコマンド ID（必須、`{{変数}}` 対応） |
| `path` | コマンド実行前に開くファイル（任意、タブは開いたまま） |
| `saveTo` | 実行結果を保存する変数名（任意） |

**出力形式**（`saveTo` 設定時）:
```json
{
  "commandId": "editor:toggle-fold",
  "path": "notes/example.md",
  "executed": true,
  "timestamp": 1704067200000
}
```

**コマンド ID の探し方:**
1. Obsidian 設定 → ホットキー を開く
2. 実行したいコマンドを検索
3. コマンド ID が表示される（例：`editor:toggle-fold`、`app:reload`）

**よく使うコマンド ID:**
| コマンド ID | 説明 |
|------------|------|
| `editor:toggle-fold` | カーソル位置の折りたたみを切り替え |
| `editor:fold-all` | すべての見出しを折りたたむ |
| `editor:unfold-all` | すべての見出しを展開 |
| `app:reload` | Obsidian を再読み込み |
| `workspace:close` | 現在のペインを閉じる |
| `file-explorer:reveal-active-file` | エクスプローラーでファイルを表示 |

**例: プラグインコマンドを使ったワークフロー**
```yaml
name: 作業ログを書く
nodes:
  - id: get-content
    type: dialog
    inputTitle: "ログ内容を入力"
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

**活用例:** ワークフローの一部として Obsidian コアコマンドや他のプラグインのコマンドをトリガー。

**例: ディレクトリ内の全ファイルを暗号化**

このワークフローは、指定したフォルダ内のすべての Markdown ファイルを Gemini Helper の暗号化コマンドで暗号化します：

```yaml
name: フォルダ暗号化
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
  - id: wait
    type: sleep
    duration: "1000"
  - id: close-tab
    type: obsidian-command
    command: "workspace:close"
  - id: increment
    type: set
    name: index
    value: "{{index}} + 1"
    next: loop
  - id: done
    type: dialog
    title: "完了"
    message: "{{index}} 件のファイルを暗号化しました"
```

> **Note:** 暗号化コマンドは非同期で実行されるため、`sleep` ノードで処理完了を待ってからタブを閉じています。

### sleep

指定した時間だけワークフローの実行を一時停止します。非同期操作の完了を待つ場合に便利です。

```yaml
- id: wait
  type: sleep
  duration: "1000"
```

| プロパティ | 説明 |
|------------|------|
| `duration` | スリープ時間（ミリ秒、必須、`{{変数}}` 対応） |

**例:**
```yaml
- id: run-command
  type: obsidian-command
  command: "some-plugin:async-operation"
  path: "notes/file.md"
- id: wait-for-completion
  type: sleep
  duration: "2000"
- id: close
  type: obsidian-command
  command: "workspace:close"
```

---

**例: ragujuary を使った RAG 検索**

[ragujuary](https://github.com/takeshy/ragujuary) は Gemini File Search Store を管理する CLI ツールで、MCP サーバー機能を搭載しています。

1. インストールとセットアップ:
```bash
go install github.com/takeshy/ragujuary@latest
export GEMINI_API_KEY=your-api-key

# ストアを作成してファイルをアップロード
ragujuary upload --create -s mystore ./docs

# MCP サーバーを起動（--transport http を使用、sse ではない）
ragujuary serve --transport http --port 8080 --serve-api-key mysecretkey
```

2. ワークフロー例:
```yaml
name: RAG 検索
nodes:
  - id: query
    type: mcp
    url: "http://localhost:8080"
    tool: "query"
    args: '{"store_name": "mystore", "question": "認証の仕組みについて教えて", "show_citations": true}'
    headers: '{"X-API-Key": "mysecretkey"}'
    saveTo: result
  - id: show
    type: dialog
    title: "検索結果"
    message: "{{result}}"
    markdown: true
    button1: "OK"
```

---

## ワークフロー終了

`next: end` でワークフローを明示的に終了：

```yaml
- id: save
  type: note
  path: "output.md"
  content: "{{result}}"
  next: end    # ここでワークフロー終了

- id: branch
  type: if
  condition: "{{cancel}}"
  trueNext: end      # true 分岐でワークフロー終了
  falseNext: continue
```

## 変数展開

`{{variable}}` 構文で変数を参照：

```yaml
# 基本
path: "{{folder}}/{{filename}}.md"

# オブジェクト/配列アクセス
url: "https://api.example.com?lat={{geo.latitude}}"
content: "{{items[0].name}}"

# ネストされた変数（ループ用）
path: "{{parsed.notes[{{counter}}].path}}"
```

### JSONエスケープ修飾子

`{{variable:json}}` を使用すると、JSON文字列に埋め込むために値をエスケープします。改行、クォート、その他の特殊文字を適切にエスケープします。

```yaml
# :jsonなし - 内容に改行やクォートがあると壊れる
args: '{"text": "{{content}}"}'  # 特殊文字があるとエラー

# :jsonあり - どんな内容でも安全
args: '{"text": "{{content:json}}"}'  # OK - 適切にエスケープ
```

これは、ファイル内容やユーザー入力を `mcp` や `http` ノードのJSONボディに渡す際に必須です。

## スマート入力ノード

`prompt-selection` と `prompt-file` ノードは実行コンテキストを自動検出：

| ノード | パネル | ホットキー | イベント |
|--------|--------|------------|----------|
| `prompt-file` | ファイル選択ダイアログ | アクティブファイルを使用 | イベント対象ファイルを使用 |
| `prompt-selection` | 選択ダイアログ | 選択またはファイル全体を使用 | ファイル全体を使用 |

---

## イベントトリガー

Obsidian のイベントでワークフローを自動実行できます。

![イベントトリガー設定](event_setting.png)

### 対応イベント

| イベント | 説明 |
|----------|------|
| `create` | ファイル作成 |
| `modify` | ファイル変更/保存（5秒デバウンス） |
| `delete` | ファイル削除 |
| `rename` | ファイル名変更 |
| `file-open` | ファイルを開く |

### イベント変数

イベントでトリガーされると、以下の変数が自動設定されます：

| 変数 | 説明 |
|------|------|
| `__eventType__` | イベント種別：`create`, `modify`, `delete`, `rename`, `file-open` |
| `__eventFilePath__` | 対象ファイルのパス |
| `__eventFile__` | JSON: `{"path": "...", "basename": "...", "name": "...", "extension": "..."}` |
| `__eventFileContent__` | ファイル内容（create/modify/file-open イベント時） |
| `__eventOldPath__` | 変更前のパス（rename イベント時のみ） |

### ファイルパターン構文

glob パターンでイベント対象をフィルタ：

| パターン | マッチ対象 |
|----------|------------|
| `**/*.md` | 全フォルダの .md ファイル |
| `journal/*.md` | journal フォルダ直下の .md ファイル |
| `*.md` | ルートフォルダの .md ファイルのみ |
| `**/{daily,weekly}/*.md` | daily または weekly フォルダ内のファイル |
| `projects/[a-z]*.md` | 小文字で始まるファイル |
| `docs/**` | docs フォルダ配下のすべてのファイル |

### イベントトリガーワークフロー例

````markdown
```workflow
name: 新規ノート自動タグ付け
nodes:
  - id: getContent
    type: prompt-selection
    saveTo: content
  - id: analyze
    type: command
    prompt: "このノートに3つのタグを提案して:\n\n{{content}}"
    saveTo: tags
  - id: prepend
    type: note
    path: "{{__eventFilePath__}}"
    content: "---\ntags: {{tags}}\n---\n\n{{content}}"
    mode: overwrite
    confirm: false
```
````

**設定方法:** Workflow パネルで ⚡ をクリック → 「ファイル作成」を有効化 → パターン `**/*.md` を設定

---

## 実用例

### 1. ノート要約

````markdown
```workflow
name: ノート要約
nodes:
  - id: select
    type: prompt-file
    title: ノートを選択
    saveTo: content
    saveFileTo: fileInfo
  - id: parseFile
    type: json
    source: fileInfo
    saveTo: file
  - id: summarize
    type: command
    prompt: "このノートを要約して:\n\n{{content}}"
    saveTo: summary
  - id: save
    type: note
    path: "summaries/{{file.name}}"
    content: "# 要約\n\n{{summary}}\n\n---\n*元ノート: {{file.path}}*"
    mode: create
```
````

### 2. Web リサーチ

````markdown
```workflow
name: Web リサーチ
nodes:
  - id: topic
    type: dialog
    title: リサーチトピック
    inputTitle: トピック
    saveTo: input
  - id: search
    type: command
    model: gemini-3-flash-preview
    ragSetting: __websearch__
    prompt: |
      以下のトピックについて Web 検索して: {{input.input}}

      重要な事実、最近の動向、情報源を含めて。
    saveTo: research
  - id: save
    type: note
    path: "research/{{input.input}}.md"
    content: "# {{input.input}}\n\n{{research}}"
    mode: overwrite
```
````

### 3. 条件分岐処理

````markdown
```workflow
name: スマート要約
nodes:
  - id: input
    type: dialog
    title: 処理するテキストを入力
    inputTitle: テキスト
    multiline: true
    saveTo: userInput
  - id: branch
    type: if
    condition: "{{userInput.input.length}} > 500"
    trueNext: summarize
    falseNext: enhance
  - id: summarize
    type: command
    prompt: "この長いテキストを要約して:\n\n{{userInput.input}}"
    saveTo: result
    next: save
  - id: enhance
    type: command
    prompt: "この短いテキストを拡張・強化して:\n\n{{userInput.input}}"
    saveTo: result
    next: save
  - id: save
    type: note
    path: "processed/output.md"
    content: "{{result}}"
    mode: overwrite
```
````

### 4. 複数ノートの一括処理

````markdown
```workflow
name: タグ分析
nodes:
  - id: init
    type: variable
    name: counter
    value: 0
  - id: initReport
    type: variable
    name: report
    value: "# タグ提案\n\n"
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
    prompt: "3つのタグを提案して:\n\n{{content}}"
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

### 5. API 連携

````markdown
```workflow
name: 天気レポート
nodes:
  - id: city
    type: dialog
    title: 都市名
    inputTitle: 都市
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
    prompt: "天気レポートを作成:\n{{data}}"
    saveTo: summary
  - id: save
    type: note
    path: "weather/{{cityInput.input}}.md"
    content: "# {{cityInput.input}}の天気\n\n{{summary}}"
    mode: overwrite
```
````

### 6. 選択テキストの翻訳（ホットキー対応）

````markdown
```workflow
name: 選択テキストを翻訳
nodes:
  - id: getSelection
    type: prompt-selection
    saveTo: text
  - id: translate
    type: command
    prompt: "次のテキストを英語に翻訳してください:\n\n{{text}}"
    saveTo: translated
  - id: output
    type: note
    path: "translations/translated.md"
    content: "## 原文\n{{text}}\n\n## 翻訳\n{{translated}}\n\n---\n"
    mode: append
  - id: show
    type: open
    path: "translations/translated.md"
```
````

**ホットキー設定:**
1. ワークフローに `name:` フィールドを追加
2. ワークフローファイルを開き、ドロップダウンから対象ワークフローを選択
3. Workflow パネルフッターのキーボードアイコンをクリック
4. 設定 → ホットキー → "Workflow: 選択テキストを翻訳" を検索
5. ホットキーを割り当て（例：`Ctrl+Shift+T`）

### 7. サブワークフロー合成

**ファイル: `workflows/translate.md`**
````markdown
```workflow
name: Translator
nodes:
  - id: translate
    type: command
    prompt: "{{targetLang}}に翻訳:\n\n{{text}}"
    saveTo: translated
```
````

**ファイル: `workflows/main.md`**
````markdown
```workflow
name: 多言語エクスポート
nodes:
  - id: input
    type: dialog
    title: 翻訳するテキストを入力
    inputTitle: テキスト
    multiline: true
    saveTo: userInput
  - id: toJapanese
    type: workflow
    path: "workflows/translate.md"
    name: "Translator"
    input: '{"text": "{{userInput.input}}", "targetLang": "日本語"}'
    output: '{"japaneseText": "translated"}'
  - id: toSpanish
    type: workflow
    path: "workflows/translate.md"
    name: "Translator"
    input: '{"text": "{{userInput.input}}", "targetLang": "スペイン語"}'
    output: '{"spanishText": "translated"}'
  - id: save
    type: note
    path: "translations/output.md"
    content: |
      # 原文
      {{userInput.input}}

      ## 日本語
      {{japaneseText}}

      ## スペイン語
      {{spanishText}}
    mode: overwrite
```
````

### 8. インタラクティブなタスク選択

````markdown
```workflow
name: タスク処理
nodes:
  - id: selectTasks
    type: dialog
    title: タスクを選択
    message: 現在のノートに対して実行するタスクを選んでください
    options: "要約, 要点抽出, 英語に翻訳, 文法修正"
    multiSelect: true
    button1: 処理開始
    button2: キャンセル
    saveTo: selection
  - id: checkCancel
    type: if
    condition: "{{selection.button}} == 'キャンセル'"
    trueNext: cancelled
    falseNext: getFile
  - id: getFile
    type: prompt-file
    saveTo: content
  - id: process
    type: command
    prompt: |
      以下のタスクをこのテキストに対して実行してください：
      タスク: {{selection.selected}}

      テキスト:
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
    title: キャンセル
    message: 操作がキャンセルされました。
    button1: OK
    next: end
```
````

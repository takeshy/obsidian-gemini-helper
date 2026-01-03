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
| プロンプト | `prompt-file`, `prompt-selection`, `dialog` | ユーザー入力ダイアログ |
| 合成 | `workflow` | 別のワークフローをサブワークフローとして実行 |

---

## ノードリファレンス

### command

モデルと検索設定を指定して LLM プロンプトを実行。

```yaml
- id: search
  type: command
  model: gemini-3-flash-preview  # 任意: 特定のモデル
  ragSetting: __websearch__      # 任意: __websearch__, __none__, または設定名
  prompt: "{{topic}}を検索"
  saveTo: result
```

| プロパティ | 説明 |
|------------|------|
| `prompt` | LLM に送るプロンプト（必須） |
| `model` | モデルを指定（例：`gemini-3-flash-preview`） |
| `ragSetting` | `__websearch__`（Web 検索）、`__none__`（検索なし）、設定名、または省略で現在の設定 |
| `saveTo` | 応答を保存する変数名 |

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

### http

HTTP リクエストを実行。

```yaml
- id: fetch
  type: http
  url: "https://api.example.com/data"
  method: POST
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
| `headers` | JSON オブジェクトまたは `Key: Value` 形式（1行1つ） |
| `body` | リクエストボディ（POST/PUT/PATCH 用） |
| `saveTo` | レスポンスボディを保存する変数 |
| `saveStatus` | HTTP ステータスコードを保存する変数 |
| `throwOnError` | `true` で 4xx/5xx 応答時にエラーをスロー |

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
| `saveTo` | 結果を保存する変数: `{"button": "確認", "selected": [...], "input": "..."}` |

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

### prompt-file

ファイル選択ダイアログを表示、またはホットキーモードでアクティブファイルを使用。

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
| `forcePrompt` | `true` でホットキーモードでも常にダイアログ表示 |
| `saveTo` | ファイル内容を保存する変数 |
| `saveFileTo` | ファイル情報 JSON を保存する変数 |

**ファイル情報形式:** `{"path": "folder/note.md", "basename": "note.md", "name": "note", "extension": "md"}`

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

### その他のノード

| ノード | プロパティ |
|--------|------------|
| `note-read` | `path`, `saveTo` |
| `note-search` | `query`, `searchContent`, `limit`, `saveTo` |
| `folder-list` | `folder`, `saveTo` |
| `open` | `path` |
| `json` | `source`, `saveTo` |

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

## スマート入力ノード

`prompt-selection` と `prompt-file` ノードはホットキーコンテキストを自動検出：

| ノード | ホットキー経由 | パネルから実行 |
|--------|----------------|----------------|
| `prompt-selection` | 現在の選択を直接使用 | 選択ダイアログを表示 |
| `prompt-file` | アクティブファイルを直接使用 | ファイル選択ダイアログを表示 |

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

# エージェントスキル

エージェントスキルは、カスタム指示、参考資料、実行可能なワークフローを提供することでAIの機能を拡張します。スキルは[OpenAI Codex](https://github.com/openai/codex)などのツールで使用されている業界標準のパターンに従います。

## フォルダ構成

スキルはVault内の設定可能なフォルダに保存されます（デフォルト: `skills/`）。各スキルは`SKILL.md`ファイルを含むサブフォルダです：

```
skills/
├── code-review/
│   ├── SKILL.md            # スキル定義（必須）
│   ├── references/          # 参考資料（オプション）
│   │   ├── style-guide.md
│   │   └── checklist.md
│   └── workflows/           # 実行可能なワークフロー（オプション）
│       └── run-lint.md
├── meeting-notes/
│   ├── SKILL.md
│   └── references/
│       └── template.md
```

## SKILL.md のフォーマット

各`SKILL.md`ファイルは、メタデータ用のYAMLフロントマターと指示用のMarkdown本文で構成されます：

```markdown
---
name: Code Review
description: Reviews code blocks in notes for quality and best practices
workflows:
  - path: workflows/run-lint.md
    description: Run linting on the current note
---

あなたはコードレビューアシスタントです。コードをレビューする際は：

1. 一般的なバグやアンチパターンをチェック
2. 可読性の改善を提案
3. エラーハンドリングが適切か確認
4. フォーマットルールについてはスタイルガイドを参照
```

### フロントマターのフィールド

| フィールド | 必須 | 説明 |
|-------|----------|-------------|
| `name` | いいえ | スキルの表示名。デフォルトはフォルダ名 |
| `description` | いいえ | スキル選択画面に表示される短い説明 |
| `workflows` | いいえ | ワークフロー参照のリスト（下記参照） |

### ワークフロー参照

フロントマターで宣言されたワークフローは、AIが呼び出せるFunction Callingツールとして登録されます：

```yaml
workflows:
  - path: workflows/run-lint.md
    name: lint              # オプションのカスタムID（デフォルトはパスベースのID）
    description: Run linting on the current note
```

`workflows/`サブディレクトリ内のワークフローは、フロントマターで宣言しなくても自動検出されます。自動検出されたワークフローはファイルのベース名が説明として使用されます。

## 参考資料

参考資料は`references/`サブフォルダに配置します。スキルが有効な場合、これらは自動的に読み込まれAIのコンテキストに含まれます。以下の用途に使用します：

- スタイルガイドやコーディング規約
- テンプレートや例
- チェックリストや手順書
- ドメイン固有の知識

## ワークフロー

スキルのワークフローは[ワークフロービルダー](../README_ja.md#ワークフロービルダー)と同じフォーマットを使用します。ワークフローのMarkdownファイルを`workflows/`サブフォルダに配置します：

````markdown
```workflow
name: Run Lint
nodes:
  - id: read
    type: prompt-file
    saveTo: file
  - id: lint
    type: command
    prompt: "Check the following for lint issues:\n{{file.content}}"
    saveTo: result
  - id: show
    type: dialog
    title: Lint Results
    message: "{{result}}"
```
````

ワークフローを持つスキルが有効な場合、AIはこれらのワークフローを実行するための`run_skill_workflow`ツールを受け取ります。ワークフローIDの形式は`skillName/workflowName`です（例：`Code Review/workflows_run-lint`）。

### インタラクティブ実行

スキルのワークフローはインタラクティブモーダルで実行されます（ワークフローパネルと同様）：

- リアルタイムのステータスを表示する実行進捗モーダルが表示されます
- インタラクティブプロンプト（`dialog`、`prompt-file`、`prompt-selection`）がユーザーに表示されます
- 確認ダイアログはユーザーの承認が必要です
- AIはワークフローの実行ログをツール結果として受け取ります

## チャットでのスキルの使用

### セットアップ

1. プラグイン設定を開く
2. **エージェントスキル**セクションを見つける
3. スキルフォルダのパスを設定（デフォルト: `skills`）

### スキルの有効化

スキルが利用可能な場合、チャット入力エリアに表示されます：

1. スキルチップエリアの横にある**+**ボタンをクリック
2. ドロップダウンから有効にするスキルを選択
3. 有効なスキルはチップとして表示され、**x**をクリックで削除可能

スキルが有効な場合：

- スキルの指示と参考資料がシステムプロンプトに注入されます
- スキルにワークフローがある場合、`run_skill_workflow`ツールが利用可能になります
- アシスタントメッセージにどのスキルが使用されたかが表示されます

### スラッシュコマンド

チャット入力で `/folder-name` と入力することで、スキルを直接呼び出せます：

- **`/folder-name`** — スキルを有効化して即座に送信します。AIはスキルのインストラクションとワークフローを積極的に使用します。
- **`/folder-name メッセージ`** — スキルを有効化し、「メッセージ」も一緒に送信します。
- `/` を入力するとオートコンプリートに利用可能なスキルが表示されます。選択すると即座に送信されます。

コマンドにはスキルの表示名ではなくフォルダ名を使用します。例：`skills/weekly-report/` にあるスキルは `/weekly-report` で呼び出します。

### CLIモード対応

スキルはCLIバックエンド（Gemini CLI、Claude CLI、Codex CLI）でも動作します。CLIプロバイダーはFunction Callingをサポートしていないため、スキルワークフローはテキストベースの規約を使用します：AIが `[RUN_WORKFLOW: workflowId]` マーカーを出力し、プラグインが自動的にワークフローを実行して結果を表示します。

### 例：スキルの作成

1. フォルダを作成：`skills/summarizer/`
2. `skills/summarizer/SKILL.md`を作成：

```markdown
---
name: Summarizer
description: Summarizes notes in bullet-point format
---

要約を求められた場合は、以下のルールに従ってください：

- 簡潔な箇条書きを使用
- 関連する項目を見出しの下にグループ化
- 重要な日付とアクションアイテムを含める
- 要約は500語以内に収める
```

3. チャットを開き、**+**をクリックして「Summarizer」スキルを有効化
4. AIにノートの要約を依頼すると、スキルの指示に従って回答します

## スキルの例

### 文体ガイド（指示 + 参考資料）

参考資料を使って一貫した文章スタイルを維持するスキル。

#### フォルダ構成

```
skills/
└── writing-style/
    ├── SKILL.md
    └── references/
        └── style-guide.md
```

#### `SKILL.md`

```markdown
---
name: Writing Style
description: ブログ記事の一貫したトーンとフォーマットを維持する
---

あなたはライティングアシスタントです。参考資料にあるスタイルガイドに常に従ってください。

テキストをレビューまたは執筆する際は：

1. スタイルガイドで指定された声のトーンを使用する
2. フォーマットルールに従う（見出し、リスト、強調）
3. 語彙の好み（推奨語/避けるべき語）を適用する
4. 既存のテキストをレビューする際はスタイル違反を指摘する
```

#### `references/style-guide.md`

```markdown
# ブログスタイルガイド

## 声のトーン
- 会話的だがプロフェッショナル
- 能動態を推奨
- チュートリアルでは二人称（「あなた」）、お知らせでは一人称複数（「私たちは」）

## フォーマット
- メインセクションにH2、サブセクションにH3
- 3項目以上は箇条書きリストを使用
- UI要素と重要用語は太字
- コードブロックには言語タグを付ける

## 語彙
- 推奨：「利用する」より「使う」、「開始する」より「始める」、「促進する」より「助ける」
- 避ける：説明なしの専門用語、受動態、冗長語（「非常に」「本当に」「ただ」）
```

---

### 日報（指示 + ワークフロー）

ワークフローで今日のエントリーを作成する日報スキル。

#### フォルダ構成

```
skills/
└── daily-journal/
    ├── SKILL.md
    └── workflows/
        └── create-entry.md
```

#### `SKILL.md`

```markdown
---
name: Daily Journal
description: エントリー作成機能付き日報アシスタント
workflows:
  - path: workflows/create-entry.md
    description: テンプレートから今日の日報エントリーを作成
---

あなたは日報アシスタントです。ユーザーの一日を振り返る手助けをしてください。

ユーザーが日報エントリーの作成を依頼した場合：

1. まずワークフローで今日のノートファイルを作成する
2. ハイライト、課題、学びについて質問する
3. ## ハイライト / ## 課題 / ## 学び の構造でエントリーをフォーマットする
4. 温かく励ましのトーンを維持する
5. ユーザーが行き詰まっているようであれば振り返りのプロンプトを提案する
```

#### `workflows/create-entry.md`

````markdown
```workflow
name: 日報エントリー作成
nodes:
  - id: date
    type: set
    name: today
    value: "{{__date__}}"
  - id: create
    type: note
    path: "Journal/{{today}}.md"
    content: |
      # {{today}}

      ## ハイライト


      ## 課題


      ## 学び


      ## 明日の予定
    mode: create
    saveTo: result
  - id: open
    type: open
    path: "Journal/{{today}}.md"
```
````

使い方：スキルを有効にして「今日の日報を作成して」と依頼すると、AIがワークフローでファイルを作成し、記入をサポートします。

---

### 議事録（指示 + 参考資料 + ワークフロー）

カスタム指示、テンプレート参考資料、作成ワークフローを組み合わせたフル機能スキル。

#### フォルダ構成

```
skills/
└── meeting-notes/
    ├── SKILL.md
    ├── references/
    │   └── template.md
    └── workflows/
        └── create-meeting.md
```

#### `SKILL.md`

```markdown
---
name: Meeting Notes
description: テンプレートと自動作成による構造化された議事録作成
workflows:
  - path: workflows/create-meeting.md
    description: 参加者とアジェンダ付きの新しい議事録を作成
---

あなたは議事録アシスタントです。参考資料にあるテンプレートに従ってください。

議事録の作成を手伝う際は：

1. ワークフローで議事録ファイルを作成する
2. テンプレートの構造に正確に従う
3. アクションアイテムを担当者と期限付きで記録する。形式: `- [ ] [担当者] アクションアイテム (期限: YYYY-MM-DD)`
4. 決定事項を議論と明確に分けてまとめる
5. 会議後、アクションアイテムをタスクとして抽出することを提案する
```

#### `references/template.md`

```markdown
# 議事録テンプレート

## 必須セクション

### ヘッダー
- **タイトル**: 会議のトピック
- **日付**: YYYY-MM-DD
- **参加者**: 参加者リスト

### アジェンダ
議論トピックの番号付きリスト。

### ノート
アジェンダ項目ごとに整理された議論の詳細。サブ見出しを使用。

### 決定事項
決定された事項の箇条書きリスト。各項目は明確で実行可能であること。

### アクションアイテム
担当者と期限付きのチェックボックスリスト：
- [ ] [担当者] 説明 (期限: YYYY-MM-DD)

### 次のステップ
フォローアップと次回会議日程の簡潔なまとめ（該当する場合）。
```

#### `workflows/create-meeting.md`

````markdown
```workflow
name: 議事録作成
nodes:
  - id: date
    type: set
    name: today
    value: "{{__date__}}"
  - id: gen
    type: command
    prompt: |
      議事録のファイルパスと初期コンテンツを生成してください。
      今日の日付は {{today}} です。
      会議のトピック: {{topic}}
      参加者: {{attendees}}

      JSONオブジェクトのみを返してください：
      {"path": "Meetings/YYYY-MM-DD Topic.md", "content": "...テンプレートに従ったmarkdownコンテンツ..."}

      テンプレート構造を使用：日付/参加者付きヘッダー、アジェンダ（トピックから）、空のノート/決定事項/アクションアイテム/次のステップセクション。
    saveTo: generated
  - id: parse
    type: json
    input: "{{generated}}"
    saveTo: parsed
  - id: create
    type: note
    path: "{{parsed.path}}"
    content: "{{parsed.content}}"
    mode: create
    saveTo: result
  - id: open
    type: open
    path: "{{parsed.path}}"
```
````

使い方：スキルを有効にして「Aliceさん、Bobさん、Carolさんとのデザインレビューの議事録を作成して」と依頼すると、AIがワークフローでトピック/参加者から構造化されたノートを作成して開きます。

---

## 設定

| 設定 | デフォルト | 説明 |
|---------|---------|-------------|
| スキルフォルダ | `skills` | Vault内のスキルフォルダのパス |

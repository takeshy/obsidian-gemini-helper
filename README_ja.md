# Gemini Helper for Obsidian

[![DeepWiki](https://img.shields.io/badge/DeepWiki-takeshy%2Fobsidian--gemini--helper-blue.svg?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTQgMTloMTZhMiAyIDAgMCAwIDItMlY3YTIgMiAwIDAgMC0yLTJINWEyIDIgMCAwIDAtMiAydjEyYTIgMiAwIDAgMSAyLTJ6Ii8+PHBhdGggZD0iTTkgMTV2LTQiLz48cGF0aCBkPSJNMTIgMTV2LTIiLz48cGF0aCBkPSJNMTUgMTV2LTQiLz48L3N2Zz4=)](https://deepwiki.com/takeshy/obsidian-gemini-helper)

**無料・オープンソース**の Obsidian 向け AI アシスタント。Google Gemini を活用した**チャット**、**ワークフロー自動化**、**RAG**を搭載。

> **v1.11.0以降、このプラグインはGemini関連の機能に特化しました。**
> CLI サポートは削除されました。CLI および複数の LLM プロバイダー（OpenAI、Claude、OpenRouter、Local LLM）をサポートする新しいプラグイン [obsidian-llm-hub](https://github.com/takeshy/obsidian-llm-hub) を作成しました。
> また、GemiHub（Google Drive）との連携は [obsidian-gemihub](https://github.com/takeshy/obsidian-gemihub) に分離しました。

### 関連プラグイン

| プラグイン | 説明 |
|-----------|------|
| obsidian-gemini-helper | Gemini に特化（RAG は File Search API） |
| obsidian-llm-hub | LLM 全般に対応、Desktop Only（RAG は Embedding、gemini-embedding-2-preview にも対応） |
| obsidian-local-llm-hub | Local LLM 専門（RAG はローカル Embedding のみ） |
| obsidian-gemihub | Web 版 gemini-helper である GemiHub と Google Drive 経由でファイル連携 |

---

> **このプラグインは完全に無料です。** [ai.google.dev](https://ai.google.dev) から Google Gemini API キー（無料または有料）が必要です。

## 主な機能

- **AI チャット** - ストリーミング応答、ファイル添付、Vault 操作、スラッシュコマンド
- **ワークフロービルダー** - ビジュアルノードエディタと 24 種類のノードでマルチステップタスクを自動化
- **編集履歴** - AI による変更を差分表示で追跡・復元
- **RAG** - Vault 全体の知的検索（Retrieval-Augmented Generation）
- **Web 検索** - Google 検索で最新情報を取得
- **画像生成** - Gemini 画像モデルで画像を作成
- **暗号化** - チャット履歴とワークフロー実行ログをパスワード保護

![チャットでの画像生成](docs/images/chat_image.png)

## API キー

このプラグインには Google Gemini API キーが必要です。以下から選択できます：

| 機能         | 無料 API キー  | 有料 API キー     |
| ------------ | -------------- | ----------------- |
| 基本チャット | ✅             | ✅                |
| Vault 操作   | ✅             | ✅                |
| Web 検索     | ✅             | ✅                |
| RAG          | ✅（制限あり） | ✅                |
| ワークフロー | ✅             | ✅                |
| 画像生成     | ❌             | ✅                |
| モデル       | Flash, Gemma   | Flash, Pro, Image |
| 料金         | **無料**       | 従量課金          |

### 無料 API キーのヒント

- **レート制限**はモデルごとで毎日リセット。別モデルに切り替えて作業を継続。
- **RAG同期**は制限あり。毎日「Sync Vault」を実行（アップロード済みファイルはスキップ）。

---

# AI チャット

AI チャット機能は、Obsidian Vault と統合された Google Gemini との対話型インターフェースを提供します。

![チャット画面](docs/images/chat.png)

## チャットを開く
- リボンの Gemini アイコンをクリック
- コマンド: "Gemini Helper: Open chat"
- トグル: "Gemini Helper: Toggle chat / editor"

## チャット操作
- **Enter** - メッセージ送信
- **Shift+Enter** - 改行
- **停止ボタン** - 生成を停止
- **+ ボタン** - 新規チャット
- **履歴ボタン** - 過去のチャットを読み込み

## スラッシュコマンド

`/` で呼び出せる再利用可能なプロンプトテンプレート：

- `{selection}`（選択テキスト）と `{content}`（アクティブノート）を含むテンプレート定義
- コマンドごとにモデルと検索設定を指定可能
- `/` を入力すると利用可能なコマンドを表示

**デフォルト:** `/infographic` - コンテンツを HTML インフォグラフィックに変換

![インフォグラフィック例](docs/images/chat_infographic.png)

## @ メンション

`@` を入力してファイルや変数を参照：

- `{selection}` - 選択テキスト
- `{content}` - アクティブノートの内容
- 任意の Vault ファイル - 参照して挿入（パスのみ挿入、内容は AI がツール経由で読み込み）

> [!NOTE]
> **`{selection}` と `{content}` の動作について：** Markdown View から Chat View にフォーカスが移動すると、通常は選択が解除されます。これを防ぐため、ビュー切替時に選択内容を変数に保持し、Markdown View 上の選択箇所を背景色でハイライト表示します。`{selection}` は選択テキストがある場合のみ @ の候補に表示されます。
>
> `{selection}` と `{content}` はどちらも入力エリアでは**意図的に展開されません**。チャット入力欄は狭いため、長いテキストを展開すると入力が困難になるためです。実際にメッセージを送信する際に展開され、送信済みメッセージを確認すると展開後の内容が表示されます。

> [!NOTE]
> Vault ファイルの @メンションはファイルパスのみを挿入します。AI がツールでコンテンツを読み取ります。

## ファイル添付

ファイルを直接添付：画像（PNG, JPEG, GIF, WebP）、PDF、テキストファイル、音声（MP3, WAV, FLAC, AAC, Opus, OGG）、動画（MP4, WebM, MOV, AVI, MKV）

## Function Calling（Vault 操作）

AI が Vault を直接操作するツール：

| ツール                 | 説明                                         |
| ---------------------- | -------------------------------------------- |
| `read_note`            | ノート内容を読み取り                         |
| `create_note`          | 新規ノート作成                               |
| `propose_edit`         | 確認ダイアログ付き編集                       |
| `propose_delete`       | 確認ダイアログ付き削除                       |
| `bulk_propose_edit`    | 複数ファイルの一括編集（選択ダイアログ付き） |
| `bulk_propose_delete`  | 複数ファイルの一括削除（選択ダイアログ付き） |
| `search_notes`         | 名前またはコンテンツで Vault を検索          |
| `list_notes`           | フォルダ内ノート一覧                         |
| `rename_note`          | リネーム/移動                                |
| `create_folder`        | 新規フォルダ作成                             |
| `list_folders`         | Vault 内フォルダ一覧                         |
| `get_active_note_info` | アクティブノートの情報取得                   |
| `get_rag_sync_status`  | RAG 同期状態を確認                           |
| `bulk_propose_rename`  | 選択ダイアログ付き一括リネーム               |

### Vault ツールモード

AI が Chat でノートを扱う際は Vault ツールを経由します。添付ボタンの下にあるデータベースアイコン（📦）から、AI が使用できる Vault ツールを制御できます：

| モード              | 説明                   | 使用可能なツール                  |
| ------------------- | ---------------------- | --------------------------------- |
| **Vault: 全て**     | Vault への完全アクセス | すべてのツール                    |
| **Vault: 検索なし** | 検索ツールを除外       | `search_notes`、`list_notes` 以外 |
| **Vault: オフ**     | Vault アクセスなし     | なし                              |

**各モードの使い分け：**

- **Vault: 全て** - 通常使用のデフォルトモード。AI は Vault の読み書き・検索が可能です。
- **Vault: 検索なし** - RAG のみで検索したい場合や、対象ファイルが事前にわかっている場合に使用。Vault 検索を省略することでトークンを節約し、レスポンスも速くなります。
- **Vault: オフ** - Vault へのアクセスが不要な場合に使用。

> **Note:** RAG、Web Search、Vault ツール、MCP は Interactions API により同時使用可能です。

## 安全な編集

AI が `propose_edit` を使用時：

1. 確認ダイアログで変更内容をプレビュー
2. **適用** をクリックでファイルに書き込み
3. **破棄** をクリックでファイルを変更せずキャンセル

> 確認するまでファイルは変更されません。

## 編集履歴

ノートへの変更を追跡・復元：

- **自動追跡** - すべての AI 編集（チャット、ワークフロー）と手動変更を記録
- **ファイルメニューからアクセス** - Markdown ファイルを右クリック：
  - **スナップショット** - 現在の状態をスナップショットとして保存
  - **履歴** - 編集履歴モーダルを開く

- **コマンドパレット** - "Show edit history" コマンドからもアクセス可能
- **差分表示** - 追加・削除を色分けして変更箇所を正確に表示
- **復元** - ワンクリックで以前のバージョンに戻す
- **コピー** - 履歴バージョンを新しいファイルとして保存（デフォルト名: `{filename}_{datetime}.md`）
- **リサイズ可能なモーダル** - ドラッグで移動、角からリサイズ

**差分の表示形式：**

- `+` 行は古いバージョンに存在していた内容
- `-` 行は新しいバージョンで追加された内容

**仕組み：**

編集履歴はスナップショットベースのアプローチを使用：

1. **スナップショット作成** - ファイルが初めて開かれるか AI によって変更されると、その内容のスナップショットが保存される
2. **差分記録** - ファイルが変更されると、新しい内容とスナップショットの差分が履歴エントリとして記録される
3. **スナップショット更新** - 各変更後、スナップショットは新しい内容に更新される
4. **復元** - 以前のバージョンに復元するには、スナップショットから差分を逆順に適用

**履歴が記録されるタイミング：**

- AI チャット編集（`propose_edit` ツール）
- ワークフローのノート変更（`note` ノード）
- コマンドによる手動保存
- ファイルを開いた時にスナップショットと異なる場合の自動検出

**保存場所：** 編集履歴はメモリ上に保存され、Obsidian の再起動時にクリアされます。永続的なバージョン管理は Obsidian 組み込みのファイル復元機能でカバーされます。

![編集履歴モーダル](docs/images/edit_history.png)

## RAG

Vault の知的検索（Retrieval-Augmented Generation）：

- **対応ファイル** - Markdown、PDF、Office文書（Doc、Docx、XLS、XLSX、PPTX）
- **Internal モード** - Vault ファイルを Google File Search に同期
- **External モード** - 既存のストア ID を使用
- **差分同期** - 変更ファイルのみアップロード
- **対象フォルダ** - インデックスするフォルダを指定
- **除外パターン** - 正規表現でファイルを除外

![RAG設定](docs/images/setting_rag.png)

## MCPサーバー

MCP（Model Context Protocol）サーバーは、Vault操作以外のAI機能を拡張する追加ツールを提供します。

**セットアップ：**

1. プラグイン設定 → **MCPサーバー**セクションを開く
2. **サーバーを追加**をクリック
3. サーバー名とURLを入力
4. 認証用のオプションヘッダー（JSON形式）を設定
5. **接続テスト**をクリックして接続を確認し、利用可能なツールを取得
6. サーバー設定を保存

> **注意：** 保存前に接続テストが必須です。これによりサーバーへの接続が確認され、利用可能なツールが表示されます。

![MCPサーバー設定](docs/images/setting_mcp.png)

**MCPツールの使用方法：**

- **チャットで：** データベースアイコン（📦）をクリックしてツール設定を開きます。会話ごとにMCPサーバーを有効/無効にできます。
- **ワークフローで：** `mcp`ノードを使用してMCPサーバーツールを呼び出します。

**ツールヒント：** 接続テスト成功後、利用可能なツール名が保存され、設定画面とチャットUIの両方に表示されます。

### MCP Apps（インタラクティブUI）

一部のMCPツールは、ツール結果を視覚的に操作できるインタラクティブUIを返します。この機能は[MCP Apps仕様](https://github.com/anthropics/anthropic-cookbook/tree/main/misc/mcp_apps)に基づいています。

**仕組み：**

- MCPツールがレスポンスメタデータで`ui://`リソースURIを返すと、プラグインはHTMLコンテンツを取得してレンダリングします
- UIはセキュリティのためサンドボックス化されたiframe内で表示されます（`sandbox="allow-scripts allow-forms"`）
- インタラクティブアプリはJSON-RPCブリッジを通じて追加のMCPツールを呼び出したり、コンテキストを更新できます

**チャットでの表示：**
- MCP Appsはアシスタントメッセージ内にインラインで表示され、展開/折りたたみボタンがあります
- ⊕をクリックでフルスクリーン展開、⊖で折りたたみ

**ワークフローでの表示：**
- MCP Appsはワークフロー実行中にモーダルダイアログで表示されます
- ワークフローはユーザー操作を待機し、モーダルが閉じられると続行します

> **セキュリティ：** すべてのMCP Appコンテンツは制限された権限でサンドボックス化されたiframe内で実行されます。iframeは親ページのDOM、Cookie、ローカルストレージにアクセスできません。`allow-scripts`と`allow-forms`のみが有効です。

## エージェントスキル

カスタム指示、参考資料、実行可能なワークフローでAIの機能を拡張します。スキルは[OpenAI Codex](https://github.com/openai/codex)の`.codex/skills/`など、業界標準のエージェントスキルパターンに従います。

- **ビルトインスキル** - Obsidian固有の知識（Markdown、Canvas、Bases）が最初から組み込み済み。[kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)に基づく
- **カスタム指示** - `SKILL.md`ファイルでドメイン固有の動作を定義
- **参考資料** - `references/`にスタイルガイド、テンプレート、チェックリストを含める
- **ワークフロー統合** - スキルがワークフローをFunction Callingツールとして公開可能
- **スラッシュコマンド** - `/folder-name` と入力してスキルを即座に実行・送信
- **選択的有効化** - 会話ごとにアクティブなスキルを選択
- **スキルチップをクリックで開く** - 入力エリアやアシスタントメッセージに表示されるアクティブなスキルチップをクリックすると、対応する `SKILL.md` が開きます（ビルトインスキルは静的ラベル表示）
- **ワークフローエラーからの復旧** - チャット中にスキルワークフローが失敗した場合、失敗したツール呼び出しに **ワークフローを開く** ボタンが表示されます。クリックするとファイルが開き、Gemini ビューが Workflow / skill タブに切り替わるので、そのまま編集・再実行できます

スキルの作成もワークフローと同じ方法で — **+ New (AI)** を選択し、**「エージェントスキルとして作成」** にチェックを入れて説明を記述するだけ。AI が `SKILL.md` の指示とワークフローの両方を生成します。既存のスキルを編集するには、`SKILL.md` を開いて Workflow / skill タブの **AIでスキルを変更** をクリック。AI が指示本文と参照先ワークフローを一括で更新します。

> **セットアップ手順と例については、[SKILLS.md](docs/SKILLS_ja.md)を参照してください**

---

# ワークフロービルダー

Markdown ファイル内で自動化ワークフローを構築。**プログラミング知識は不要**です。やりたいことを自然言語で説明するだけで、AI がワークフローを作成します。

![ビジュアルワークフローエディタ](docs/images/visual_workflow.png)

## ワークフローの実行

**サイドバーから：**
1. サイドバーで **Workflow / skill** タブを開く
2. `workflow` コードブロックを含むファイルを開く
3. ドロップダウンからワークフローを選択（または **Browse all workflows** で Vault 内の全ワークフローを検索）
4. **Run** をクリックして実行
5. **History** をクリックして過去の実行を確認

**コマンドパレットから（Run Workflow）：**

「Gemini Helper: Run Workflow」コマンドを使用すると、どこからでもワークフローを閲覧・実行できます：

1. コマンドパレットを開いて "Run Workflow" を検索
2. ワークフローコードブロックを含むすべての Vault ファイルを閲覧（`workflows/` フォルダ内のファイルが優先表示）
3. ワークフローの内容と AI 生成履歴をプレビュー
4. ワークフローを選択して **Run** をクリックして実行

![ワークフロー実行モーダル](docs/images/workflow_list.png)

ワークフローファイルに移動せずに素早くワークフローを実行できるので便利です。

![ワークフロー履歴](docs/images/workflow_history.png)

**実行履歴をエクスポート：** 実行履歴を Obsidian Canvas としてビジュアル分析。History モーダルで **Open Canvas view** をクリックして Canvas ファイルを作成。

> **Note:** Canvas ファイルはワークスペースフォルダに動的に作成されます。確認後、不要になったら手動で削除してください。

![履歴キャンバスビュー](docs/images/history_canvas.png)

## AI によるワークフロー & スキル作成

**YAML 構文やノードタイプを学ぶ必要はありません。** やりたいことを自然言語で説明するだけ：

1. Gemini サイドバーの **Workflow / skill** タブを開く
2. ドロップダウンから **+ New (AI)** を選択
3. やりたいことを記述：_「選択したノートを要約して summaries フォルダに保存するワークフローを作成して」_
4. ワークフローではなくエージェントスキルを作成したい場合は **「エージェントスキルとして作成」** にチェック
5. モデルを選択して **Generate** をクリック
6. AI がまず平易な言葉の **プラン** を出力します。確認して **OK** で続行、**再計画** でフィードバックを与えてやり直し、**Cancel** で中止
7. 生成後、AI が結果を **レビュー** します。問題が見つかった場合は **OK**（確認ダイアログ付き）、**再修正**（レビューフィードバックで再生成）、**Cancel** から選択。問題なしの場合は自動で続行
8. 最終プレビューを承認するとワークフローが保存されます

> **ヒント：** 既にワークフローがあるファイルでドロップダウンから **+ New (AI)** を使用すると、出力先パスがカレントファイルにデフォルト設定されます。生成されたワークフローはそのファイルに追記されます。

**任意のファイルからワークフローを作成：**

ワークフローコードブロックがないファイルで Workflow / skill タブを開くと、**「Create workflow with AI」** ボタンが表示されます。クリックして新規ワークフローを生成（デフォルト出力先：`workflows/{{name}}.md`）。

**@ ファイル参照：**

説明フィールドで `@` を入力するとファイルを参照できます：
- `@{selection}` - 現在のエディタ選択範囲
- `@{content}` - アクティブなノートの内容
- `@path/to/file.md` - Vault 内の任意のファイル

Generate をクリックすると、ファイルの内容が AI リクエストに直接埋め込まれます。YAML フロントマターは自動的に除去されます。

> **ヒント：** Vault 内の既存のワークフロー例やテンプレートを基にワークフローを作成する際に便利です。

**ファイル添付：**

添付ボタンをクリックして、ワークフロー生成リクエストにファイル（画像、PDF、テキストファイル）を添付できます。AI に視覚的なコンテキストや例を提供する際に便利です。

**外部 LLM の利用（プロンプトコピー / レスポンス貼り付け）：**

任意の外部 LLM（Claude、GPT など）を使用してワークフローを生成できます：

1. 通常通りワークフロー名と説明を入力
2. **Copy Prompt** をクリック - プロンプト全体がクリップボードにコピーされます
3. お好みの LLM にプロンプトを貼り付け
4. LLM のレスポンスをコピー
5. 表示された **Paste Response** テキストエリアに貼り付け
6. **Apply** をクリックしてワークフローを作成

貼り付けるレスポンスは、生の YAML でも `` ```workflow `` コードブロックを含む完全な Markdown ドキュメントでも構いません。Markdown レスポンスはそのまま保存され、LLM が含めたドキュメントも保持されます。

![AI でワークフロー作成](docs/images/create_workflow_with_ai.png)

**モーダル操作：**

AI ワークフローモーダルはドラッグ＆ドロップでの位置調整と角からのリサイズをサポートし、快適な編集体験を提供します。

**リクエスト履歴：**

AI で生成したワークフローは、コードブロックの上に履歴エントリが保存されます：
- タイムスタンプとアクション（作成/修正）
- リクエストの内容
- 参照したファイルの内容（折りたたみセクション内）
**既存ワークフローの修正も同様に：**
1. 任意のワークフローを読み込み
2. **AI Modify** ボタン（スパークルアイコン）をクリック
3. 変更内容を記述：_「要約を日本語に翻訳するステップを追加して」_
4. 作成時と同じ plan → generate → review フローが実行されます。レビュー結果に対して **再修正** を何度でも押せ、押すたびに新しい生成パスと新しいレビューが走るので、最終的に表示されるレビューは常に確定する YAML と一致します
5. 変更前後の diff を確認
6. **Apply Changes** をクリックして更新

**AI でスキルを変更：**

アクティブファイルが `SKILL.md` の場合、Workflow / skill タブには通常のワークフロー修正ボタンの代わりに（または並べて）**「AIでスキルを変更」** ボタンが表示されます。スキル全体 — SKILL.md の指示本文と参照先ワークフローファイル — を 1 回の操作で更新し、スキルの frontmatter（name、description、workflows エントリ）を保持します。

**実行履歴の参照：**

AI でワークフローを修正する際、過去の実行結果を参照して AI に問題点を伝えることができます：

1. **実行履歴を参照** ボタンをクリック
2. リストから実行記録を選択（エラーがある実行はハイライト表示）
3. 含めたいステップを選択（エラーステップはデフォルトで選択済み）
4. AI がステップの入出力データを受け取り、何が問題だったかを理解

ワークフローのデバッグに特に有効です。「ステップ 2 のエラーを修正して」と伝えるだけで、AI はどの入力が失敗の原因だったかを正確に把握できます。

**リクエスト履歴：**

ワークフローを再生成する（プレビューで「No」をクリック）と、セッション中の全ての過去のリクエストが AI に渡されます。これにより、複数回の修正にわたる完全なコンテキストを AI が理解できます。

**手動ワークフロー編集：**

ビジュアルノードエディタでドラッグ＆ドロップ操作でワークフローを直接編集。

![手動ワークフロー編集](docs/images/modify_workflow_manual.png)

**ファイルから再読み込み：**
- ドロップダウンから **Reload from file** を選択して、Markdown ファイルからワークフローを再インポート

## 利用可能なノードタイプ

24 種類のノードタイプでワークフローを構築できます：

| カテゴリ       | ノード                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| 変数           | `variable`, `set`                                                      |
| 制御           | `if`, `while`                                                          |
| LLM            | `command`                                                              |
| データ         | `http`, `json`, `script`                                               |
| ノート         | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` |
| ファイル       | `file-explorer`, `file-save`                                           |
| プロンプト     | `prompt-file`, `prompt-selection`, `dialog`                            |
| 合成           | `workflow`                                                             |
| RAG            | `rag-sync`                                                             |
| 外部連携       | `mcp`, `obsidian-command`                                              |
| ユーティリティ | `sleep`                                                                |

> **詳細なノード仕様と実例は [WORKFLOW_NODES_ja.md](docs/WORKFLOW_NODES_ja.md) を参照してください**

## ホットキーモード

キーボードショートカットでワークフローを即座に実行：

1. ワークフローに `name:` フィールドを追加
2. ワークフローファイルを開いてドロップダウンから選択
3. Workflow パネルフッターのキーボードアイコン（⌨️）をクリック
4. 設定 → ホットキー → "Workflow: [ワークフロー名]" を検索
5. ホットキーを割り当て（例：`Ctrl+Shift+T`）

ホットキー実行時：

- `prompt-file` はアクティブファイルを自動使用（ダイアログなし）
- `prompt-selection` は現在の選択を使用、選択がなければファイル全体を使用

## イベントトリガー

Obsidian のイベントでワークフローを自動実行：

![イベントトリガー設定](docs/images/event_setting.png)

| イベント       | 説明                                      |
| -------------- | ----------------------------------------- |
| ファイル作成   | 新規ファイル作成時にトリガー              |
| ファイル変更   | ファイル保存時にトリガー（5秒デバウンス） |
| ファイル削除   | ファイル削除時にトリガー                  |
| ファイル名変更 | ファイル名変更時にトリガー                |
| ファイルを開く | ファイルを開いた時にトリガー              |

**イベントトリガーの設定：**

1. ワークフローに `name:` フィールドを追加
2. ワークフローファイルを開いてドロップダウンから選択
3. Workflow パネルフッターの zap アイコン（⚡）をクリック
4. トリガーするイベントを選択
5. 必要に応じてファイルパターンフィルターを追加

**ファイルパターン例：**

- `**/*.md` - 全フォルダのすべての Markdown ファイル
- `journal/*.md` - journal フォルダ内の Markdown ファイルのみ
- `*.md` - ルートフォルダ内の Markdown ファイルのみ
- `**/{daily,weekly}/*.md` - daily または weekly フォルダ内のファイル
- `projects/[a-z]*.md` - 小文字で始まるファイル

**イベント変数：** イベント実行時、以下の変数が自動設定されます：

| 変数                   | 説明                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| `_eventType`        | イベント種別：`create`, `modify`, `delete`, `rename`, `file-open` |
| `_eventFilePath`    | 対象ファイルのパス                                                |
| `_eventFile`        | ファイル情報 JSON（path, basename, name, extension）              |
| `_eventFileContent` | ファイル内容（create/modify/file-open イベント時）                |
| `_eventOldPath`     | 変更前パス（rename イベント時のみ）                               |

> **Note:** `prompt-file` と `prompt-selection` ノードはイベント実行時に自動的にイベントファイルを使用します。`prompt-selection` はファイル全体を選択として扱います。

---

# 共通

## 対応モデル

### 有料プラン

| モデル                   | 説明                                      |
| ------------------------ | ----------------------------------------- |
| Gemini 3.1 Pro Preview | 最新のフラッグシップモデル、1Mコンテキスト（推奨） |
| Gemini 3.1 Pro Preview (Custom Tools) | カスタムツールとbash向けに最適化されたエージェントワークフロー |
| Gemini 3 Flash Preview | 高速モデル、1Mコンテキスト、最高のコストパフォーマンス |
| Gemini 3.1 Flash Lite Preview | 最もコスト効率の高いモデル |
| Gemini 2.5 Flash | 高速モデル、1Mコンテキスト |
| Gemini 2.5 Pro           | Proモデル、1Mコンテキスト               |
| Gemini 3 Pro (Image)     | Pro品質の画像生成、4K                          |
| Gemini 3.1 Flash (Image) | 高速・低コストの画像生成 |

> **Thinking モード:** チャットでは、メッセージに「考えて」「分析して」「検討して」などのキーワードが含まれると Thinking モードが有効になります。ただし、**Gemini 3.1 Pro** はキーワードに関係なく常に Thinking モードで動作します。このモデルは Thinking の無効化をサポートしていません。

**Always Think トグル:**

キーワードなしで Flash モデルの Thinking モードを強制的に ON にできます。Database icon（📦）をクリックしてツールメニューを開き、**Always Think** のトグルを確認してください：

- **Flash** — デフォルトは OFF。チェックすると Flash モデルで常に Thinking を有効にします。
- **Flash Lite** — デフォルトは ON。Flash Lite は Thinking を有効にしてもコストと速度の差がほとんどないため、ON のままにすることを推奨します。

トグルが ON の場合、メッセージの内容に関わらずそのモデルファミリーで常に Thinking が有効になります。OFF の場合は、既存のキーワードベースの検出が使用されます。

![Always Think Settings](docs/images/setting_thinking.png)

### 無料プラン

| モデル                  | Vault 操作 |
| ----------------------- | ---------- |
| Gemini 2.5 Flash        | ✅         |
| Gemini 2.5 Flash Lite   | ✅         |
| Gemini 3 Flash Preview  | ✅         |
| Gemini 3.1 Flash Lite Preview | ✅         |
| Gemma 4 (31B, 26B A4B MoE) | ✅      |

## インストール

### BRAT（推奨）

1. [BRAT](https://github.com/TfTHacker/obsidian42-brat) プラグインをインストール
2. BRAT 設定 → 「Add Beta plugin」を開く
3. `https://github.com/takeshy/obsidian-gemini-helper` を入力
4. コミュニティプラグイン設定でプラグインを有効化

### 手動インストール

1. リリースから `main.js`, `manifest.json`, `styles.css` をダウンロード
2. `.obsidian/plugins/` に `gemini-helper` フォルダを作成
3. ファイルをコピーして Obsidian 設定で有効化

### ソースからビルド

```bash
git clone https://github.com/takeshy/obsidian-gemini-helper
cd obsidian-gemini-helper
npm install
npm run build
```

## 設定

### API 設定

1. [ai.google.dev](https://ai.google.dev) で API キーを取得
2. プラグイン設定で入力
3. API プラン（無料/有料）を選択

![基本設定](docs/images/setting_basic.png)

### ワークスペース設定

- **System Prompt** - AI への追加指示
- **Tool Limits** - 関数呼び出し制限の設定

![ツール制限](docs/images/setting_tool_history.png)

### 暗号化

チャット履歴とワークフロー実行ログを個別にパスワード保護。

**設定手順:**

1. プラグイン設定でパスワードを設定（公開鍵暗号方式で安全に保存）

![暗号化初期設定](docs/images/setting_initial_encryption.png)

2. 設定後、各ログタイプの暗号化を切り替え:
   - **AIチャット履歴を暗号化** - チャット会話ファイルを暗号化
   - **ワークフロー実行ログを暗号化** - ワークフロー履歴ファイルを暗号化

![暗号化設定](docs/images/setting_encryption.png)

各設定は独立して有効/無効を切り替えできます。

**機能:**

- **個別制御** - どのログを暗号化するか選択可能（チャット、ワークフロー、または両方）
- **自動暗号化** - 設定に基づいて新規ファイルは保存時に暗号化
- **パスワードキャッシュ** - セッション中は一度入力すればOK
- **専用ビューア** - 暗号化ファイルはプレビュー付きの専用エディタで開く
- **復号オプション** - 必要に応じて個別ファイルの暗号化を解除

**仕組み:**

```
【セットアップ - パスワード設定時に1回だけ】
パスワード → 鍵ペア生成（RSA） → 秘密鍵を暗号化 → 設定に保存

【暗号化 - ファイルごと】
ファイル内容 → 新しいAES鍵で暗号化 → AES鍵を公開鍵で暗号化
→ ファイルに保存: 暗号化データ + 暗号化秘密鍵（設定からコピー） + salt

【復号】
パスワード + salt → 秘密鍵を復元 → AES鍵を復号 → ファイル内容を復号
```

- 鍵ペアは1回だけ生成（RSA生成は重い）、AES鍵はファイルごとに生成
- 各ファイルに保存: 暗号化コンテンツ + 暗号化秘密鍵（設定からコピー） + salt
- ファイルは自己完結型 — パスワードだけで復号可能、プラグイン依存なし

<details>
<summary>Python復号スクリプト（クリックで展開）</summary>

```python
#!/usr/bin/env python3
"""プラグインなしでGemini Helper暗号化ファイルを復号"""
import base64, sys, re, getpass
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric import padding

def decrypt_file(filepath: str, password: str) -> str:
    with open(filepath, 'r') as f:
        content = f.read()

    # YAMLフロントマターを解析
    match = re.match(r'^---\n([\s\S]*?)\n---\n([\s\S]*)$', content)
    if not match:
        raise ValueError("無効な暗号化ファイル形式")

    frontmatter, encrypted_data = match.groups()
    key_match = re.search(r'key:\s*(.+)', frontmatter)
    salt_match = re.search(r'salt:\s*(.+)', frontmatter)
    if not key_match or not salt_match:
        raise ValueError("フロントマターにkeyまたはsaltがありません")

    enc_private_key = base64.b64decode(key_match.group(1).strip())
    salt = base64.b64decode(salt_match.group(1).strip())
    data = base64.b64decode(encrypted_data.strip())

    # パスワードから鍵を導出
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100000)
    derived_key = kdf.derive(password.encode())

    # 秘密鍵を復号
    iv, enc_priv = enc_private_key[:12], enc_private_key[12:]
    private_key_pem = AESGCM(derived_key).decrypt(iv, enc_priv, None)
    private_key = serialization.load_der_private_key(base64.b64decode(private_key_pem), None)

    # 暗号化データを解析: key_length(2) + enc_aes_key + iv(12) + enc_content
    key_len = (data[0] << 8) | data[1]
    enc_aes_key = data[2:2+key_len]
    content_iv = data[2+key_len:2+key_len+12]
    enc_content = data[2+key_len+12:]

    # RSA秘密鍵でAES鍵を復号
    aes_key = private_key.decrypt(enc_aes_key, padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None))

    # コンテンツを復号
    return AESGCM(aes_key).decrypt(content_iv, enc_content, None).decode('utf-8')

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"使用法: {sys.argv[0]} <暗号化ファイル>")
        sys.exit(1)
    password = getpass.getpass("パスワード: ")
    print(decrypt_file(sys.argv[1], password))
```

必要: `pip install cryptography`

</details>

> **警告:** パスワードを忘れると、暗号化ファイルは復元できません。パスワードは安全に保管してください。

> **ヒント:** ディレクトリ内のすべてのファイルを一括暗号化するには、ワークフローを使用します。[WORKFLOW_NODES_ja.md](docs/WORKFLOW_NODES_ja.md#obsidian-command) の「ディレクトリ内の全ファイルを暗号化」の例を参照してください。

![ファイル暗号化ワークフロー](docs/images/enc.png)

**セキュリティ上のメリット:**

- **AIチャットからの保護** - 暗号化ファイルはAIのVault操作（`read_note`ツール）で読み取ることができません。これにより、APIキーなどの機密データがチャット中に誤って漏洩することを防ぎます。
- **ワークフローからのアクセス** - ワークフローでは`note-read`ノードを使用して暗号化ファイルを読み取れます。アクセス時にパスワードダイアログが表示され、入力後はセッション中キャッシュされます。
- **シークレットの安全な保管** - APIキーをワークフローに直接記述する代わりに、暗号化ファイルに保存できます。ワークフローはパスワード認証後に実行時にキーを読み取ります。

### スラッシュコマンド

- `/` で呼び出すカスタムプロンプトテンプレートを定義
- コマンドごとにモデルと検索設定を指定可能

![スラッシュコマンド](docs/images/setting_slash_command.png)

## 動作要件

- Obsidian v0.15.0 以上
- Google AI API キー
- デスクトップとモバイル対応

## プライバシー

**ローカルに保存されるデータ：**

- API キー（Obsidian 設定に保存）
- チャット履歴（Markdown ファイル、暗号化オプションあり）
- ワークフロー実行履歴（暗号化オプションあり）
- 暗号化キー（秘密鍵はパスワードで暗号化）

**Google に送信されるデータ：**

- すべてのチャットメッセージと添付ファイルは Google Gemini API に送信されます
- RAGを有効にすると、Vault ファイルが Google File Search にアップロードされます
- Web 検索を有効にすると、検索クエリが Google Search に送信されます

**サードパーティサービスへの送信：**

- ワークフローの `http` ノードは、ワークフローで指定された任意の URL にデータを送信できます

**MCP サーバー（オプション）：**

- MCP（Model Context Protocol）サーバーは、ワークフローの `mcp` ノード用にプラグイン設定で構成できます
- MCP サーバーは追加のツールと機能を提供する外部サービスです

**セキュリティに関する注意：**

- 実行前にワークフローを確認してください。`http` ノードは Vault データを外部エンドポイントに送信できます
- ワークフローの `note` ノードはデフォルトで書き込み前に確認ダイアログを表示します
- `confirmEdits: false` を設定したスラッシュコマンドは、Apply/Discard ボタンを表示せずにファイル編集を自動適用します
- 機密情報の管理：API キーやトークンをワークフロー YAML（`http` ヘッダー、`mcp` 設定など）に直接記載しないでください。代わりに暗号化ファイルに保存し、`note-read` ノードで実行時に読み込んでください。ワークフローはパスワード入力で暗号化ファイルを読み取れます。

データ保持ポリシーについては [Google AI 利用規約](https://ai.google.dev/terms) を参照してください。

## ライセンス

MIT

## リンク

- [Gemini API ドキュメント](https://ai.google.dev/docs)
- [Obsidian プラグインドキュメント](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## サポート

このプラグインが役に立ったら、コーヒーをおごってください！

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)

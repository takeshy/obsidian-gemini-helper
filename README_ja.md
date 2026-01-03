# Gemini Helper for Obsidian

**無料・オープンソース**の Obsidian 向け AI アシスタント。Google Gemini を活用した**チャット**、**ワークフロー自動化**、**セマンティック検索**を搭載。

> **このプラグインは完全に無料です。** Google Gemini API キー（無料または有料）、または [Gemini CLI](https://github.com/google-gemini/gemini-cli) 経由で Google アカウントが必要です。

## 主な機能

- **AI チャット** - ストリーミング応答、ファイル添付、Vault 操作、スラッシュコマンド
- **ワークフロービルダー** - ビジュアルノードエディタと 17 種類のノードでマルチステップタスクを自動化
- **セマンティック検索** - RAG による Vault 全体の知的検索
- **Web 検索** - Google 検索で最新情報を取得
- **画像生成** - Gemini 画像モデルで画像を作成

## Google API キーの選択肢

このプラグインには Google Gemini API キーまたは Google アカウント（Gemini CLI 経由）が必要です。以下から選択できます：

| 機能 | 無料 API キー | 有料 API キー | Gemini CLI |
|------|---------------|---------------|------------|
| 基本チャット | ✅ | ✅ | ✅ |
| Vault 操作 | ✅ | ✅ | 読み取り/検索のみ |
| Web 検索 | ✅ | ✅ | ❌ |
| セマンティック検索 | ✅（制限あり） | ✅ | ❌ |
| ワークフロー | ✅ | ✅ | ✅ |
| 画像生成 | ❌ | ✅ | ❌ |
| モデル | Flash, Gemma | Flash, Pro, Image | **Gemini 2.5 Pro** |
| 料金 | **無料** | 従量課金 | **無料** |

> [!TIP]
> **Gemini CLI** を使えば、Google アカウントだけで **Gemini 2.5 Pro**（フラッグシップモデル）が使えます！[Gemini CLI](https://github.com/google-gemini/gemini-cli) をインストールし、`gemini` を実行して `/auth` で認証。

### 無料 API キーのヒント

- **レート制限**はモデルごとで毎日リセット。別モデルに切り替えて作業を継続。
- **セマンティック検索同期**は制限あり。毎日「Sync Vault」を実行（アップロード済みファイルはスキップ）。
- **Gemma モデル**や **Gemini CLI** はチャットでの Vault 操作に非対応ですが、**ワークフローでは `note`、`note-read` などのノードでノートの読み書きが可能**です。`{content}` と `{selection}` 変数も使用可能。

---

# AI チャット

AI チャット機能は、Obsidian Vault と統合された Google Gemini との対話型インターフェースを提供します。

![チャット画面](chat.png)

## スラッシュコマンド

`/` で呼び出せる再利用可能なプロンプトテンプレート：

- `{selection}`（選択テキスト）と `{content}`（アクティブノート）を含むテンプレート定義
- コマンドごとにモデルと検索設定を指定可能
- `/` を入力すると利用可能なコマンドを表示

**デフォルト:** `/infographic` - コンテンツを HTML インフォグラフィックに変換

![インフォグラフィック例](chat_infographic.png)

## @ メンション

`@` を入力してファイルや変数を参照：

- `{selection}` - 選択テキスト
- `{content}` - アクティブノートの内容
- 任意の Vault ファイル - 参照して挿入（パスのみ挿入、内容は AI がツール経由で読み込み）

> [!NOTE]
> Vault ファイルの@メンションは、ファイルパスのみが挿入され、AI がツール経由でファイル内容を読み込みます。Gemma モデルは Vault 操作ツールに非対応のため機能しません。Gemini CLI はシェル経由で読み込み可能ですが、応答形式が異なる場合があります。

## ファイル添付

ファイルを直接添付：画像（PNG, JPEG, GIF, WebP）、PDF、テキストファイル

## Function Calling（Vault 操作）

AI が Vault を直接操作するツール：

| ツール | 説明 |
|--------|------|
| `read_note` | ノート内容を読み取り |
| `create_note` | 新規ノート作成 |
| `propose_edit` | 確認ダイアログ付き編集 |
| `propose_delete` | 確認ダイアログ付き削除 |
| `bulk_propose_edit` | 複数ファイルの一括編集（選択ダイアログ付き） |
| `bulk_propose_delete` | 複数ファイルの一括削除（選択ダイアログ付き） |
| `search_notes` | 名前またはコンテンツで Vault を検索 |
| `list_notes` | フォルダ内ノート一覧 |
| `rename_note` | リネーム/移動 |
| `create_folder` | 新規フォルダ作成 |
| `list_folders` | Vault 内フォルダ一覧 |
| `get_active_note_info` | アクティブノートの情報取得 |
| `get_rag_sync_status` | RAG 同期状態を確認 |

## 安全な編集

AI が `propose_edit` を使用時：
1. 確認ダイアログで変更内容をプレビュー
2. **適用** をクリックでファイルに書き込み
3. **破棄** をクリックでファイルを変更せずキャンセル

> 確認するまでファイルは変更されません。

## セマンティック検索

RAG による Vault の知的検索：

- **Internal モード** - Vault ファイルを Google File Search に同期
- **External モード** - 既存のストア ID を使用
- **差分同期** - 変更ファイルのみアップロード
- **対象フォルダ** - インデックスするフォルダを指定
- **除外パターン** - 正規表現でファイルを除外

![セマンティック検索設定](setting_semantic_search.png)

---

# ワークフロービルダー

Markdown ファイル内で自動化ワークフローを構築。**プログラミング知識は不要**です。やりたいことを自然言語で説明するだけで、AI がワークフローを作成します。

![ビジュアルワークフローエディタ](visual_workflow.png)

## AI によるワークフロー作成

**YAML 構文やノードタイプを学ぶ必要はありません。** やりたいことを自然言語で説明するだけ：

1. Gemini サイドバーの **Workflow** タブを開く
2. ドロップダウンから **+ New (AI)** を選択
3. やりたいことを記述：*「選択したノートを要約して summaries フォルダに保存するワークフローを作成して」*
4. **Generate** をクリック - AI が完全なワークフローを作成

![AI でワークフロー作成](create_workflow_with_ai.png)

**既存ワークフローの修正も同様に：**
1. 任意のワークフローを読み込み
2. **AI Modify** ボタンをクリック
3. 変更内容を記述：*「要約を日本語に翻訳するステップを追加して」*
4. 確認して適用

![AI ワークフロー修正](modify_workflow_with_ai.png)

## クイックスタート（手動）

手動でワークフローを記述することもできます。任意の Markdown ファイルにワークフローコードブロックを追加：

````markdown
```workflow
name: クイック要約
nodes:
  - id: input
    type: dialog
    title: トピックを入力
    inputTitle: トピック
    saveTo: topic
  - id: generate
    type: command
    prompt: "{{topic.input}}について簡潔に要約して"
    saveTo: result
  - id: save
    type: note
    path: "summaries/{{topic.input}}.md"
    content: "{{result}}"
    mode: create
```
````

Gemini サイドバーの **Workflow** タブを開いて実行。

## 利用可能なノードタイプ

17 種類のノードタイプでワークフローを構築できます：

| カテゴリ | ノード |
|----------|--------|
| 変数 | `variable`, `set` |
| 制御 | `if`, `while` |
| LLM | `command` |
| データ | `http`, `json` |
| ノート | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` |
| プロンプト | `prompt-file`, `prompt-selection`, `dialog` |
| 合成 | `workflow` |

> **詳細なノード仕様と実例は [WORKFLOW_NODES_ja.md](WORKFLOW_NODES_ja.md) を参照してください**

---

# 共通

## 対応モデル

### 有料プラン
| モデル | 説明 |
|--------|------|
| Gemini 3 Flash Preview | 高速モデル、1M コンテキスト（デフォルト） |
| Gemini 3 Pro Preview | フラッグシップモデル、1M コンテキスト |
| Gemini 2.5 Flash Lite | 軽量フラッシュモデル |
| Gemini 2.5 Flash (Image) | 画像生成、1024px |
| Gemini 3 Pro (Image) | プロ画像生成、4K |

### 無料プラン
| モデル | Vault 操作 |
|--------|------------|
| Gemini 2.5 Flash | ✅ |
| Gemini 2.5 Flash Lite | ✅ |
| Gemini 3 Flash Preview | ✅ |
| Gemma 3 (27B/12B/4B/1B) | ❌ |

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

![基本設定](setting_basic.png)

### Gemini CLI
1. [Gemini CLI](https://github.com/google-gemini/gemini-cli) をインストール
2. `gemini` → `/auth` で認証
3. 設定で「Command line mode」を有効化
4. 「Verify」で確認

**制限:** Vault 読み取り専用、セマンティック/Web 検索なし

### ワークスペース設定
- **Workspace Folder** - チャット履歴と設定の保存先
- **System Prompt** - AI への追加指示
- **Tool Limits** - 関数呼び出し制限の設定
- **Slash Commands** - カスタムプロンプトテンプレートの定義

![ツール制限・スラッシュコマンド](setting_tool_limit_slash_command.png)

## 使い方

### チャットを開く
- リボンの Gemini アイコンをクリック
- コマンド: "Gemini Helper: Open chat"
- トグル: "Gemini Helper: Toggle chat / editor"

### チャット操作
- **Enter** - メッセージ送信
- **Shift+Enter** - 改行
- **停止ボタン** - 生成を停止
- **+ ボタン** - 新規チャット
- **履歴ボタン** - 過去のチャットを読み込み

### ワークフローの使い方
1. サイドバーで **Workflow** タブを開く
2. `workflow` コードブロックを含むファイルを開く
3. ドロップダウンからワークフローを選択
4. **Run** で実行
5. **History** で過去の実行を確認

![ワークフロー履歴](workflow_history.png)

**Canvas へエクスポート:** 実行履歴を Obsidian Canvas としてビジュアル化。

![履歴キャンバスビュー](history_canvas.png)

### AI ワークフロー生成

**AI で新規ワークフローを作成：**
1. ワークフロードロップダウンから **+ New (AI)** を選択
2. ワークフロー名と出力先パス（`{{name}}` 変数対応）を入力
3. ワークフローの動作を自然言語で記述
4. モデルを選択して **Generate** をクリック
5. ワークフローが自動的に作成・保存される

**AI で既存ワークフローを修正：**
1. 既存のワークフローを読み込み
2. **AI Modify** ボタン（スパークルアイコン）をクリック
3. 変更したい内容を記述
4. 変更前後の比較を確認
5. **Apply Changes** で更新を適用

![AI ワークフロー修正](modify_workflow_with_ai.png)

**手動ワークフロー編集：**

ビジュアルノードエディタでドラッグ＆ドロップ操作でワークフローを直接編集。

![手動ワークフロー編集](modify_workflow_manual.png)

**ファイルから再読み込み：**
- ドロップダウンから **Reload from file** を選択して、Markdown ファイルからワークフローを再インポート

## 動作要件

- Obsidian v0.15.0 以上
- Google AI API キー（または Gemini CLI）
- デスクトップ版・モバイル版対応

## プライバシー

**ローカルに保存されるデータ：**
- API キー（Obsidian 設定に保存）
- チャット履歴（Markdown ファイルとして）
- ワークフロー実行履歴

**Google に送信されるデータ：**
- すべてのチャットメッセージと添付ファイルは Google Gemini API に送信されます
- セマンティック検索を有効にすると、Vault ファイルが Google File Search にアップロードされます
- Web 検索を有効にすると、検索クエリが Google Search に送信されます

**サードパーティサービスへの送信：**
- ワークフローの `http` ノードは、ワークフローで指定された任意の URL にデータを送信できます

**セキュリティに関する注意：**
- 実行前にワークフローを確認してください。`http` ノードは Vault データを外部エンドポイントに送信できます
- ワークフローの `note` ノードはデフォルトで書き込み前に確認ダイアログを表示します
- `confirmEdits: false` を設定したスラッシュコマンドは、Apply/Discard ボタンを表示せずにファイル編集を自動適用します

データ保持ポリシーについては [Google AI 利用規約](https://ai.google.dev/terms) を参照してください。

## ライセンス

MIT

## リンク

- [Gemini API ドキュメント](https://ai.google.dev/docs)
- [Obsidian プラグインドキュメント](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## サポート

このプラグインが役に立ったら、コーヒーをおごってください！

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)

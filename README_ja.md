# Gemini Helper for Obsidian

Google Gemini を活用した Obsidian 向け AI アシスタントプラグインです。File Search RAG によるセマンティック検索機能を搭載しています。

## スクリーンショット

### AI チャット画面
![チャット画面](chat.png)

### 設定画面
![設定画面](settings.png)

## 機能

### AI チャットインターフェース
- **ストリーミング応答** - リアルタイムで応答が表示され、自然な会話フローを実現
- **モデル選択** - チャット画面から直接 Gemini モデルを切り替え可能
- **RAG 設定選択** - チャット画面から RAG 設定を切り替え可能
- **チャット履歴** - Markdown 形式で自動保存（閲覧・編集可能）
- **会話スレッド** - 同じチャット内でコンテキストを維持
- **生成停止** - 停止ボタンで AI の応答を途中で停止可能
- **メッセージコピー** - ワンクリックでメッセージをクリップボードにコピー

### ファイル添付
メッセージにファイルを直接添付できます：
- **画像** - PNG, JPEG, GIF, WebP
- **ドキュメント** - PDF ファイル
- **テキストファイル** - プレーンテキスト, Markdown, CSV, JSON

### Function Calling（Vault 操作）
AI が以下のツールを使って直接 Vault を操作できます：

| ツール | 説明 |
|--------|------|
| `read_note` | ノート名またはアクティブノートの内容を読み取り |
| `create_note` | 新規ノートを作成（内容・タグ指定可） |
| `propose_edit` | ノートを編集（適用/破棄ボタンで確認） |
| `search_notes` | ファイル名またはコンテンツで検索 |
| `list_notes` | フォルダ内または Vault 全体のノート一覧 |
| `create_folder` | 新規フォルダを作成 |
| `list_folders` | Vault 内の全フォルダ一覧 |
| `get_active_note_info` | アクティブノートのメタ情報を取得 |
| `rename_note` | ノートのリネーム・移動 |
| `delete_note` | ノートを削除（デフォルト無効） |
| `get_rag_sync_status` | ファイルの RAG 同期状態を確認 |

### 安全な編集機能
AI が `propose_edit` でノートを編集する際：
1. 変更がファイルに直接適用されます
2. 元の内容はメモリにバックアップされます
3. 変更を確認し、**適用** で確定、**破棄** で元に戻せます

### RAG（File Search）統合
- **複数 RAG 設定** - 複数の RAG 設定を作成・管理可能
- **セマンティック検索** - AI を活用した意味ベースの Vault 全体検索
- **RAG インジケーター** - RAG が使用された際に表示
- **Internal モード** - Vault のファイルを新しい RAG ストアに同期
- **External モード** - 既存の RAG ストアを使用（複数ストア ID 対応）
- **差分同期** - 変更されたファイルのみアップロード（チェックサムベース）
- **対象フォルダ指定** - RAG インデックスに含めるフォルダを指定可能
- **除外パターン** - 正規表現で特定ファイルを除外
- **同期進捗表示** - リアルタイムの進捗表示とキャンセル機能
- **ストア管理** - 設定から RAG ストアを削除可能

## 対応モデル

| モデル | 説明 |
|--------|------|
| Gemini 3 Pro Preview | 最新のフラッグシップモデル（1M コンテキスト） |
| Gemini 2.5 Pro | 複雑なタスク向けの安定版 Pro モデル |
| Gemini 2.5 Flash | 高速で高性能なモデル |
| Gemini 2.5 Flash Lite | 軽量版 Flash モデル |
| Gemini 2.0 Flash | 高速で効率的なモデル |
| Gemini 2.0 Flash Lite | シンプルなタスク向け軽量モデル |

## インストール

### 手動インストール
1. 最新リリース（`main.js`、`manifest.json`、`styles.css`）をダウンロード
2. Vault の `.obsidian/plugins/` ディレクトリに `gemini-helper` フォルダを作成
3. ダウンロードしたファイルをコピー
4. Obsidian 設定 > コミュニティプラグイン でプラグインを有効化

### ソースからビルド
```bash
git clone https://github.com/your-repo/obsidian-gemini-helper
cd obsidian-gemini-helper
npm install
npm run build
```

`main.js`、`manifest.json`、`styles.css` を Vault のプラグインフォルダにコピーしてください。

## 設定

### API 設定
1. [ai.google.dev](https://ai.google.dev) で Google AI API キーを取得
2. プラグイン設定で API キーを入力
3. デフォルトモデルを選択

### ワークスペース設定
- **Workspace Folder** - チャット履歴と RAG 設定の保存先
- **Save Chat History** - チャットセッションの保存 ON/OFF
- **System Prompt** - AI への追加指示（例：「常に日本語で回答してください」）

### RAG 設定
1. **Enable RAG** - File Search RAG 機能の ON/OFF
2. **RAG Setting** - RAG 設定を選択または作成
3. **+** ボタンで新しい RAG 設定を作成
4. 鉛筆アイコンでリネーム、ゴミ箱アイコンで削除

#### ストアモード
- **Internal（Vault Sync）** - Vault のファイルを Google の File Search に同期
  - **Target Folders** - インデックスに含めるフォルダ（カンマ区切り、空欄で全体）
  - **Excluded Patterns** - ファイルを除外する正規表現パターン（1行に1つ）
    - 例: `^daily/` は daily フォルダ内のファイルを除外
    - 例: `\.excalidraw\.md$` は Excalidraw ファイルを除外
  - **Sync Vault** - ファイルを RAG ストアにアップロード
  - **Reset Sync State** - ローカルの同期状態をクリア（次回同期で全ファイル再アップロード）
  - **Delete RAG Store** - Google サーバーから RAG ストアを完全に削除

- **External（Existing Store）** - 既存の RAG ストアを使用
  - **RAG Store IDs** - ストア ID を入力（1行に1つ、複数可）
  - 複数の Vault 間でストアを共有したり、事前に作成したストアを使用する場合に便利

## 使い方

### チャットを開く
- 左リボンの Gemini アイコンをクリック
- またはコマンドパレット: "Gemini Helper: Open chat"

### チャット操作
- **Enter** - メッセージ送信
- **Shift+Enter** - 改行
- **クリップアイコン** - ファイルを添付
- **停止ボタン** - 生成を停止（生成中に表示）
- **+ ボタン** - 新規チャット開始
- **履歴ボタン** - 過去のチャットを表示・読み込み

### モデル & RAG 選択
入力欄の下にあるドロップダウンから選択：
- **モデルドロップダウン** - 会話中でもモデルを切り替え可能
- **RAG ドロップダウン** - 使用する RAG 設定を選択（RAG 有効時に表示）

### RAG 同期
1. 設定で RAG を有効化
2. 新しい RAG 設定を作成するか、既存のものを選択
3. 対象フォルダと除外パターンを設定（Internal モードの場合）
4. 「Sync Vault」をクリックしてインデックス作成
5. チャット画面で RAG 設定を選択
6. AI が質問に回答する際にセマンティック検索を使用するようになります
7. 「RAG」インジケーターで RAG が使用されたか確認できます

## 動作要件

- Obsidian v0.15.0 以上
- Google AI API キー
- デスクトップ版のみ（モバイル非対応）

## プライバシー

- API キーは Vault の設定ファイルにローカル保存されます
- RAG 有効時、ファイルは Google の File Search API にアップロードされます
- チャット履歴は Vault 内に Markdown ファイルとしてローカル保存されます
- RAG 設定はワークスペースフォルダ内の `.gemini-workspace.json` に保存されます

## 開発

```bash
# 依存パッケージのインストール
npm install

# 開発ビルド（ウォッチモード）
npm run dev

# プロダクションビルド
npm run build
```

## ライセンス

MIT

## クレジット

使用ライブラリ:
- [@google/genai](https://www.npmjs.com/package/@google/genai) - Google Gemini SDK
- [React](https://react.dev/) - UI フレームワーク
- [Lucide React](https://lucide.dev/) - アイコン

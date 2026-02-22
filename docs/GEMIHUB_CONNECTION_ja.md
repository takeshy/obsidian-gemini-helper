# GemiHub 連携 (Google Drive 同期)

Obsidian の Vault を Google Drive と同期し、[GemiHub](https://gemihub.com) と完全互換で連携できます。Obsidian でノートを編集し、GemiHub の Web インターフェースからアクセスすることも、その逆も可能です。

## 概要

- **双方向同期** - ローカルの変更を Drive に Push、リモートの変更を Obsidian に Pull
- **GemiHub 互換** - 同じ `_sync-meta.json` フォーマットと GemiHub の暗号化認証を使用
- **コンフリクト解決** - 同じファイルが両方で編集された場合のコンフリクトを検出・解決
- **選択的同期** - パターンマッチングでファイル/フォルダを除外可能
- **バイナリ対応** - 画像、PDF、その他のバイナリファイルも同期

## 事前準備

[GemiHub](https://gemihub.com) アカウントで Google Drive 同期が設定済みである必要があります。プラグインは GemiHub の暗号化認証トークンを使用して Google Drive に接続します。

1. GemiHub にサインイン
2. **Settings** → **Obsidian Sync** セクションを開く
3. **Backup token** をコピー

## セットアップ

1. Obsidian の **設定** → **Gemini Helper** → **Google Drive sync** セクションまでスクロール
2. **Enable drive sync** をオンに切り替え
3. GemiHub からコピーした **Backup token** を貼り付け
4. **Setup** をクリックして Google Drive から暗号化認証を取得
5. **パスワード** を入力して現在のセッションの同期をアンロック

> Obsidian を再起動するたびに、同期セッションをアンロックするためのパスワード入力が求められます。

## 同期の仕組み

### Drive 上のファイル構造

すべての Vault ファイルは Drive 上のルートフォルダに**フラット**に格納されます。Drive 上のファイル名には Vault の完全パスが含まれます：

| Vault パス | Drive ファイル名 |
|---|---|
| `notes.md` | `notes.md` |
| `daily/2024-01-15.md` | `daily/2024-01-15.md` |
| `attachments/image.png` | `attachments/image.png` |

Drive 上にサブフォルダは作成されません（`trash/`、`sync_conflicts/`、`__TEMP__/` などのシステムフォルダを除く）。GemiHub も同じフラット構造を使用しています。

### 同期メタデータ

2つのメタデータファイルで同期状態を管理します：

- **`_sync-meta.json`**（Drive 上） - GemiHub と共有。同期対象ファイルの ID、チェックサム、タイムスタンプを保持。
- **`{workspaceFolder}/drive-sync-meta.json`**（ローカル） - Vault パスと Drive ファイル ID のマッピング、最終同期時のチェックサムを保持。

### Push

ローカルの変更を Google Drive にアップロードします。

1. Vault 内の全ファイルの MD5 チェックサムを計算
2. ローカル同期メタデータと比較し、変更ファイルを特定
3. リモートに未取得の変更がある場合、Push を拒否（先に Pull が必要）
4. 新規・変更ファイルを Drive にアップロード
5. ローカルで削除されたファイルを Drive の `trash/` に移動（ソフトデリート）
6. Drive 上の `_sync-meta.json` を更新

### Pull

リモートの変更を Vault にダウンロードします。

1. リモートの `_sync-meta.json` を取得
2. ローカルのチェックサムを計算し、ローカル変更を検出
3. コンフリクトがある場合、コンフリクト解決モーダルを表示
4. ローカルにのみ存在するファイルを削除（Obsidian のゴミ箱に移動）
5. リモートの新規・変更ファイルを Vault にダウンロード
6. ローカル同期メタデータを更新

### Full Pull

すべてのローカルファイルをリモートバージョンで置き換えます。Vault を Drive の状態に完全にリセットしたい場合に使用します。

> **注意:** Drive に存在しないローカルファイルは削除されます（Obsidian のゴミ箱に移動）。

### コンフリクト解決

同じファイルがローカルとリモートの両方で変更された場合：

- モーダルにコンフリクトファイルの一覧が表示される
- 各ファイルについて **Keep local**（ローカルを保持）または **Keep remote**（リモートを保持）を選択
- 選ばれなかった方のバージョンは Drive の `sync_conflicts/` フォルダにバックアップ
- **編集・削除コンフリクト**（ローカルで編集、リモートで削除）の場合は **Restore (push to drive)**（復元して Drive に Push）または **Accept delete**（削除を受け入れる）を選択
- 一括操作: **Keep all local** / **Keep all remote**

## データ管理

### ゴミ箱

同期中に削除されたファイルは、完全に削除されるのではなく Drive の `trash/` フォルダに移動されます。設定画面から以下の操作が可能です：

- **Restore** - ファイルをゴミ箱からルートフォルダに戻す
- **Delete permanently** - ファイルを Drive から完全に削除

### コンフリクトバックアップ

コンフリクト解決時に選ばれなかったバージョンは Drive の `sync_conflicts/` に保存されます。以下の操作が可能です：

- **Restore** - バックアップをルートフォルダに復元（現在のバージョンを上書き）
- **Delete** - バックアップを完全に削除

### 一時ファイル

GemiHub が一時保存したファイルは Drive の `__TEMP__/` に格納されます。以下の操作が可能です：

- **Apply** - 一時ファイルの内容を対応する Drive ファイルに適用
- **Delete** - 一時ファイルを削除

3つの管理モーダルすべてで、ファイルプレビューと一括操作がサポートされています。

## 設定項目

| 設定 | 説明 | デフォルト |
|---|---|---|
| **Enable drive sync** | 同期機能の有効/無効 | オフ |
| **Backup token** | GemiHub の設定（Obsidian Sync セクション）から貼り付け | - |
| **Auto sync check** | 定期的にリモートの変更をチェックしてカウントを更新 | オフ |
| **Sync check interval** | チェック間隔（分） | 5 |
| **Exclude patterns** | 除外パス（1行1パターン、`*` ワイルドカード対応） | `node_modules/` |

## コマンド

コマンドパレットから4つのコマンドが利用可能です：

| コマンド | 説明 |
|---|---|
| **Drive sync: push to drive** | ローカルの変更を Drive に Push |
| **Drive sync: pull to local** | リモートの変更を Vault に Pull |
| **Drive sync: full push to drive** | すべてのローカルファイルを Drive に Push |
| **Drive sync: full pull to local** | すべてのローカルファイルをリモートバージョンで置き換え |

## 除外ファイル

以下は常に同期から除外されます：

- `_sync-meta.json`, `settings.json`
- `history/`, `trash/`, `sync_conflicts/`, `__TEMP__/`, `plugins/`, `.trash/`, `node_modules/`
- Obsidian 設定ディレクトリ（`.obsidian/` またはカスタム設定）
- 設定で定義したユーザー除外パターン

### 除外パターンの構文

- `folder/` - フォルダとその中身を除外
- `*.tmp` - Glob パターン（すべての `.tmp` ファイルにマッチ）
- `*.log` - Glob パターン（すべての `.log` ファイルにマッチ）
- `drafts/` - `drafts` フォルダを除外

## トラブルシューティング

### "Remote has pending changes. Please pull first."

リモートの Drive に未取得の変更があります。Push の前に **Pull to local** を実行してください。

### "Drive sync: no remote data found. Push first."

Drive 上に `_sync-meta.json` が存在しません。**Push to drive** を実行して同期を初期化してください。

### パスワードのアンロックに失敗する

- GemiHub と同じパスワードを使用しているか確認してください
- GemiHub でパスワードを変更した場合は、設定画面の **Reset auth** を使用し、新しい Backup token で再セットアップしてください

### コンフリクトモーダルが繰り返し表示される

両方に変更があります。各ファイルについてローカルまたはリモートを選択し、すべてのコンフリクトを解決してください。全コンフリクト解決後、Pull が自動的に続行されます。

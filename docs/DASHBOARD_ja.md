# ダッシュボード

ウィジェットのレスポンシブグリッドから、自分専用の**ホーム/概要ページ**を構築できます。ダッシュボードは `.dashboard` ファイルで、**Bases ビュー**・**ノート**・**Web ページ**・**タイムライン**・**カンバンボード**・**ワークフロー出力**をドラッグ＆リサイズ可能なグリッドに配置します。通常のノートと同じように開くだけで、ライブで編集可能なボードが表示されます。

![ダッシュボード](images/dashboard.png)

---

## ダッシュボード vs Canvas

Obsidian の **Canvas** とダッシュボードは似ていますが、解決する課題が異なります:

| | ダッシュボード | Canvas |
|---|-----------|--------|
| **コンテンツ** | **ライブ** — Bases ビュー、タイムライン、カンバンボード、ワークフロー出力、ノートが自動的に更新されます | **静的** — カードは手動で配置するスナップショット |
| **レイアウト** | レスポンシブグリッド（12 カラム。狭い画面では単一列に再配置） | 絶対座標の自由な無限平面 |
| **目的** | 状況確認のために開く構造化された**ホーム/概要**ページ | **思考**の空間 — アイデアを並べ、矢印で繋ぐ |
| **AI** | チャットから作成（`dashboard` スキルがファイルと裏の `.base` データを構築） | 手動配置 |
| **閲覧** | 触っても崩れない読み取り専用の表示モード | 常に編集可能 |

要するに、**ダッシュボード**はライブで一目で把握できる概要（タスク、生成されたダイジェスト、埋め込みページ）に、**Canvas**は自由配置の空間的な思考や関係づけに使います。本質的なトレードオフは**動的 vs 静的**と**レスポンシブグリッド vs 自由配置**です。

---

## ダッシュボードを作成する

ダッシュボードの作成方法は 2 通りあります:

1. **コマンド** — コマンドパレットから **「Gemini Helper: ダッシュボードを作成」** を実行します。`Dashboards/` フォルダ配下に新しいファイル（`Dashboard`、`Dashboard 2`…）を作成して開きます。
2. **AI に依頼** — プラグインには組み込みの **`dashboard`** エージェントスキルが付属しています。チャットで有効化し、欲しいものを説明してください（*「アクティブなタスク、ウェルカムノート、今日の天気を表示するホームページ」*）。AI が `.dashboard` ファイルと、必要な `.base` ファイルを作成します。

ダッシュボードは Vault 内のプレーンな `.dashboard` ファイルとして保存されるため、他のノートと同様に同期・バージョン管理されます。ワークフローウィジェットの結果は、通常の Vault ファイルとして `Dashboards/Data/` に別途保存されます。

---

## 編集モード

各ダッシュボードは**表示モード**で開きます。ツールバーで切り替えます:

- **編集** — 編集モードに入ります: ウィジェットをドラッグして移動、右下隅をドラッグしてリサイズ、**歯車**で設定、**ゴミ箱**で削除します。
- **+ ウィジェットを追加** — ウィジェットパレットを開きます（編集モードのみ）。
- **元に戻す / やり直し** — このセッションで行ったレイアウト変更をたどります。
- **完了** — 表示モードに戻ります。

> すべての編集は**自動保存**されます — 別途保存ボタンはありません。

---

## ウィジェットの種類

編集モードで **+ ウィジェットを追加** をクリックしてウィジェットの種類を選びます:

![ウィジェットを追加パレット](images/dashboard_widgets.png)

### Base — Bases ビューを埋め込む

Obsidian の**ネイティブ Bases UI**（テーブル / カード / リスト / マップ）を使って `.base` ファイルの名前付きビューを表示します。これがメインのデータウィジェットです — ノートのリスト・テーブル・カード表示には、独自実装せずこれを使ってください。

![Base ウィジェットの設定](images/dashboard_base.png)

| 設定 | 説明 |
|---------|-------------|
| **Base ファイル** | `.base` ファイルへの Vault パス |
| **ビュー** | 表示するビュー名。空にすると base の最初のビューを使用 |
| **新規 Base** | `Dashboards/Bases/` 配下に新しい `.base` ファイルを作成 |
| **ビューエディタ** | 選択したビューの名前、種類、順序、並び替え、上限、フィルター、カード画像、リストのインデント、Raw YAML を編集 |
| **AI で作成 / AI で編集** | 新しい `.base` ファイルを作成、または選択中のファイルへの編集を差分確認付きで提案 |

The same `.base` file can be referenced by multiple Base widgets — for example, one widget per view (Active / Done / Backlog). If the `.base` file changes outside the settings panel, the editor reloads it before saving so it does not overwrite newer content with stale state.

### Markdown — ノートを埋め込む

既存の Markdown ノートを読み取り専用の埋め込みとしてインライン表示します（ノート全体を開くリンク付き）。

![Markdown ウィジェットの設定](images/dashboard_markdown.png)

| 設定 | 説明 |
|---------|-------------|
| **Markdown ノート** | 埋め込むノートへの Vault パス（検索可能なピッカー） |

### Web Embed — Web ページを埋め込む

Web ページを iframe に埋め込みます。

![Web Embed ウィジェットの設定](images/dashboard_web.png)

| 設定 | 説明 |
|---------|-------------|
| **URL** | 埋め込むページ |
| **ヘッダーを表示** | URL とブラウザで開くボタンを含むコンパクトなヘッダーを表示。既存ウィジェットでは既定でオン。 |

> [!NOTE]
> 一部のサイトは `X-Frame-Options` / `Content-Security-Policy` ヘッダーを送出して埋め込みをブロックし、空白で表示されます。

### Workflow — ワークフロー出力を表示する

既存の[ワークフロー](WORKFLOW_NODES_ja.md)を**ヘッドレス**で実行し、その出力を Markdown または HTML で表示します。動的に生成されたコンテンツ（ダイジェスト、要約、レポート）をダッシュボードに置けます。

![Workflow ウィジェットの設定](images/dashboard_workflow.png)

| 設定 | 説明 |
|---------|-------------|
| **出力フォーマット** | `Markdown` または `HTML`（HTML はサンドボックス化された iframe で表示） |
| **Workflow** | 実行するワークフローノート |
| **AI で作成** | このウィジェット用に新しいワークフローを作成（または選択中のものを編集） |
| **出力変数** | 出力文字列を保持するワークフロー変数（既定 `result`） |
| **実行** | ワークフローを今すぐ実行して結果をキャッシュ |
| **自動更新間隔（分）** | `0` = 手動のみ。それ以外は、キャッシュ結果がこの値より古いときに開いた際に一度自動実行 |

> [!IMPORTANT]
> **ワークフローウィジェットはライブではなくキャッシュから表示します。** 重いワークフローをボードを開くたびに再実行しないよう、表示パスは**キャッシュされた結果のみ**を読み込みます。実行されるのは次の場合だけです:
> - **実行**をクリックしたとき（ウィジェットヘッダーまたは設定パネル）、または
> - ダッシュボードを開き、キャッシュ結果が自動更新間隔より古いとき。
>
> 結果は `Dashboards/Data/<encoded dashboard path>.json` に通常の Vault ファイルとして保存されます。そのため `.dashboard` ファイルを肥大化させずに再オープン後も出力が残り、他のファイルと同様に同期、push/pull、レビュー、バージョン管理の対象になります。ワークフローは Markdown/HTML 出力を文字列変数（既定 `result`）に格納する必要があります — カード/テーブル出力は非対応です。無人で実行されるため、ワークフローは対話ノード（`prompt-*`、`dialog`）を使用できません。

### Kanban — ドラッグでステータスを変更

**タグ** および/または **フォルダ** フィルターに一致するノートを、フロントマターの **ステータスプロパティ** によって列にグループ化したカードとして表示します。カードを別の列にドラッグすると、そのノートのステータスが更新されます（`processFrontMatter` で書き込み）。 カードを列内で上下にドラッグすると、そのボード専用の手動順序が保存されます。カードをクリックするとモーダルでノートをプレビューでき、モーダルの遷移アイコンで新しいタブにノートを開きます。ボードは **表示モード** で操作でき、カードを動かすのに編集モードに入る必要はありません。

![Kanban ボード](images/dashboard_kanban.png)

ヘッダーには任意の **タイトル**（1 つのダッシュボードに複数のボードを置くときに便利）と **新規** ボタンが表示されます。新規ボタンはカードのタイトル入力と列選択の小さなモーダルを開き、このボードのフィルターに既に一致するノートを作成します — 設定したフォルダに配置し、設定したタグを付け、選んだ列のステータスを設定します。新しいカードはボード上に表示され（ダッシュボードに留まります）、開きたいときにクリックします。

ボードは編集モードのウィジェット設定から構成します:

![Kanban 設定](images/dashboard_kanban_edit.png)

| 設定 | 説明 |
|---------|-------------|
| **ボードのタイトル** | ボードのヘッダーに表示。複数のボードでダッシュボードを共有するときに便利。 |
| **タグフィルター** | このタグを持つノートのみ表示（`#` なし）。空 = すべてのタグ。 |
| **フォルダフィルター** | このプレフィックスでパスが始まるノートのみ表示。空 = Vault 全体。 |
| **ステータスプロパティ** | カードのステータスを保持するフロントマターのプロパティ（既定 `status`）。 |
| **タイトルプロパティ** | カードのタイトルとして表示するフロントマターのプロパティ。空 = ファイル名。 |
| **列** | ステータス値の順序付きリスト。各列は **値**（プロパティと照合）と **ラベル**（ヘッダーに表示）を持つ。 |
| **表示フィールド** | 各カードのタイトル下に表示する frontmatter プロパティ名の順序付きリスト（例: `priority`, `due`）。各項目は `name: value` として表示され、空の値はスキップされ、リスト値はカンマで結合されます。 |
| **未該当カードの列を表示** | オンのとき、どの列にも一致しないステータスのカードが追加の「未指定」列に表示される（既定オン）。 |

### Timeline — 日付付き投稿を記録する

短い日付付き投稿を `Dashboards/Timeline/<name>/` 配下に、1 日 1 Markdown ファイルとして保存します。投稿には `#タグ`、画像添付、ピン留めを含められます。ウィジェットは逆時系列フィード、本文/タグ/日付フィルター、新規投稿用 composer を表示します。長い投稿や埋め込みノートは既定で折り畳まれ、**もっと見る / 閉じる** で展開できます。折り畳みの行数・文字数のしきい値は設定できます。composer とインライン編集欄には、画像添付ボタンの横に **AI で編集** ボタンがあります。指示を入力し、生成結果をモーダル内の差分で確認してから textarea に適用できます。

| 設定 | 説明 |
|---------|-------------|
| **Timeline 名** | `Dashboards/Timeline/` 配下のフォルダ名 |
| **表示する最新投稿数** | 古い投稿を読み込む前に最初に表示する最近の投稿数 |
| **折り畳む行数** | 折り畳みプレビューを表示する推定表示行数のしきい値（既定 `8`） |
| **折り畳む文字数** | 折り畳みプレビューを表示する文字数のしきい値（既定 `440`） |

各日付ファイルは `<YYYY-MM-DD>.md` です。投稿区切りの `---` は、その後に timeline marker または ISO timestamp が続く場合だけ区切りとして扱われるため、投稿本文中の通常の Markdown 水平線は保持されます。

投稿内の `[[wikilinks]]` はクリックでプレビューモーダルを開き、モーダルの遷移アイコンからノートを開けます。埋め込み記事のリンクは別タブで開けます。

未知のウィジェットタイプ（例えば新しいプラグインバージョン由来）は**保存時に保持**され、プレースホルダーとして表示されるため、見慣れないダッシュボードを編集してもデータが失われることはありません。

---

## レスポンシブレイアウト

グリッドにはコンテナ幅で切り替わる 2 つのブレークポイントがあります:

| ブレークポイント | 条件 | レイアウト |
|------------|------|--------|
| **`lg`**（広い） | ≥ 768px | 編集モードで配置したレイアウト（既定 12 カラム） |
| **`sm`**（狭い） | < 768px | ウィジェットが**全幅の単一列**に再配置され、上から下へ積み重なる |

既定では `sm` レイアウトは広いレイアウトから**自動的に導出**されます（垂直位置の順）。狭い画面でウィジェットを動かした場合、その明示的な `sm` 位置は保持され、残りのウィジェットはその周囲の空きを埋めます。

---

## AI でウィジェットを作成する

**Base** と **Workflow** ウィジェットの設定パネルには **AI で作成** ボタンがあります:

- **Base** ウィジェットでは、`.base` ファイルの AI 作成ダイアログを開きます。AI は読み取り専用ツール（読み取り、検索、一覧）でノートを調べ、作成前に適切な frontmatter プロパティを見つけられます。たとえば、カバー画像付きのカードビューを依頼しても、プロパティ名を指定する必要はありません。base が既に選択されている場合、ボタンは **AI で編集** になります。現在の `.base` に対する提案の **差分** と、**追加指示** 欄が表示され、**適用** 前に内容を調整できます。
- **Workflow** ウィジェットでは、ウィジェットに合わせたワークフローを生成（または編集）します — AI は出力変数に単一の Markdown/HTML 文字列を生成し、対話ノードを避けるよう指示されるため、結果はヘッドレスで表示されます。生成後、ウィジェットは**自動的に実行・更新**されます。

チャットから組み込みの **`dashboard`** エージェントスキルを使ってダッシュボード全体を作成することもできます。このスキルは `.dashboard` スキーマと Bases 作成リファレンスを把握しています。

---

## `.dashboard` ファイル形式

`.dashboard` ファイルは YAML です。通常は手で編集しません（ビジュアルエディタと AI が管理します）が、参照とラウンドトリップの安全性のためにスキーマをここに記載します。

```yaml
version: 1
grid:
  cols: 12        # column count (default 12)
  rowHeight: 80   # pixels per grid row
  gap: 8          # pixels between cells
widgets:
  - id: <uuid>                            # unique id (UUID-like string)
    type: base | markdown | web | workflow | kanban | timeline
    layout:
      lg: { x: 0, y: 0, w: 6, h: 4 }      # required: position on the wide grid
      sm: { x: 0, y: 0, w: 12, h: 4 }     # optional: auto-derived (stacked) if omitted
    config: { ... }                       # per-widget-type config (see below)
```

- **`layout.lg`** は広い（≥768px）グリッド上の位置です。`x`/`y` は 0 始まりの左上セル、`w`/`h` はグリッドセル単位の幅/高さです。
- **`layout.sm`** は狭い画面での位置です。省略すると全幅で自動的に積み重ねられます。
- ウィジェットが重ならないように配置してください。`y` を増やして縦に積みます。

### ウィジェットごとの `config`

```yaml
# base
config:
  base: Dashboards/Bases/Tasks.base   # vault path to the .base file
  view: Active                     # view name; omit/empty = first view

# markdown
config:
  path: Home.md                    # vault path to a markdown note

# web
config:
  url: https://example.com
  showHeader: true                    # optional; false hides the URL/open header

# workflow
config:
  workflow: workflows/Daily Digest.md  # vault path to the workflow note
  output: markdown                     # markdown | html
  outputVariable: result               # variable holding the output string
  refreshInterval: 60                  # minutes; 0/omit = manual refresh only

# kanban
config:
  tag: task                            # optional tag filter (without #)
  folder: ""                           # optional folder path prefix
  statusProperty: status               # frontmatter property holding the status
  titleProperty: ""                    # frontmatter property for card title (empty = file name)
  displayFields: [priority, due]       # frontmatter properties shown on each card
  cardOrder: [Tasks/A.md, Tasks/B.md]   # optional manual order persisted by drag/drop
  columns:                             # ordered list of status values
    - value: todo
      label: To Do
    - value: in-progress
      label: In Progress
    - value: done
      label: Done
  showUnspecified: true                # show cards with no/unknown status
# timeline
config:
  name: Journal                        # stores posts under Dashboards/Timeline/Journal/
  latestCount: 20
  collapseLineLimit: 8
  collapseCharLimit: 440
```

### 完全な例

```yaml
version: 1
grid:
  cols: 12
  rowHeight: 80
  gap: 8
widgets:
  - id: tasks-active
    type: base
    layout: { lg: { x: 0, y: 0, w: 8, h: 6 } }
    config:
      base: Dashboards/Bases/Tasks.base
      view: Active
  - id: readme
    type: markdown
    layout: { lg: { x: 8, y: 0, w: 4, h: 6 } }
    config:
      path: Home.md
  - id: docs
    type: web
    layout: { lg: { x: 0, y: 6, w: 12, h: 4 } }
    config:
      url: https://help.obsidian.md
  - id: journal
    type: timeline
    layout: { lg: { x: 0, y: 10, w: 6, h: 6 } }
    config:
      name: Journal
      latestCount: 20
      collapseLineLimit: 8
      collapseCharLimit: 440
```

---

## ヒントとメモ

- **データを先に作る。** Base ウィジェットでは、ウィジェットを向ける前に `.base` ファイル（とそのビュー）を作成します。AI ダッシュボードスキルはこれを一度に行います。
- **ビューでグループ化。** データを複製せず、1 つの `.base` を複数の Base ウィジェット（Active / Done / Backlog）で再利用します。
- **ワークフローウィジェットは軽く保つ。** 結果をキャッシュします。開くたびに実行するのではなく、適切な**自動更新間隔**を設定し、出力を `result` に格納します。
- **デスクトップのみ。** ダッシュボード（プラグインの他の機能と同様）は Obsidian デスクトップで動作します。
- **ファイルは Vault 内にあります。** ダッシュボードは `Dashboards/` 配下に `.dashboard` ファイルとして、ワークフロー結果は `Dashboards/Data/`、タイムライン投稿は `Dashboards/Timeline/`、生成された Bases は `Dashboards/Bases/` に保存されます。これらは通常の Vault ファイルで、ノートと同様に同期/バージョン管理されます。

> 関連: [ワークフローノード](WORKFLOW_NODES_ja.md) · [エージェントスキル](SKILLS_ja.md)

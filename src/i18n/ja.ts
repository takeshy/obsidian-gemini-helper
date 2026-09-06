// Japanese translations
export const ja: Record<string, string> = {
  // Settings - Headings
  "settings.externalSkills": "外部skills",

  // Settings - API
  "settings.googleApiKey": "Google APIキー",
  "settings.googleApiKey.desc": "ai.google.devで取得したAPIキー。この端末の安全なストレージに保存されるため、同期している端末ごとに入力が必要です。",
  "settings.googleApiKey.missingOnDevice": "このVaultではGoogle APIキーが設定されていますが、この端末には保存されていません。この端末でGeminiを使うには、Gemini Helperの設定でAPIキーを入力してください。",
  "settings.apiPlan": "APIプラン",
  "settings.apiPlan.desc": "APIキーのプランタイプを選択（利用可能なモデルと検索機能に影響）",
  "settings.apiPlan.paid": "有料",
  "settings.apiPlan.free": "無料",

  // Settings - Workspace

  "settings.aiVaultToolAllowedFolders": "AIが自動アクセスできるフォルダ",
  "settings.aiVaultToolAllowedFolders.desc": "任意設定: AIに自動的に読ませたくないディレクトリがある場合、AIがアクセスしてよいフォルダだけを指定します。",
  "settings.aiVaultToolAllowedFolders.invalidPath": "AIが自動アクセスできるフォルダはVault相対パスで指定し、'.' や '..' を含めないでください。",
  "settings.aiVaultToolAllowedFolders.placeholder": "例: Public, Shared/Docs",

  // Settings - External skills
  "settings.externalSkillsRepository": "ソースリポジトリ",
  "settings.externalSkillsRepository.desc": "skillは公式リポジトリ {{repo}} から取り込み、Vaultの skills/ にコピーします。各skillには manifest.json が必須です。",
  "settings.externalSkills.retry": "再試行",
  "settings.externalSkills.loading": "利用可能なskillを読み込み中…",
  "settings.externalSkills.loadFailed": "skillの読み込みに失敗しました: {{error}}",
  "settings.externalSkills.noSkills": "公式リポジトリに対応するskillが見つかりませんでした。",
  "settings.externalSkills.allInstalled": "利用可能なskillはすべてインストール済みです。",
  "settings.externalSkills.install": "skillをインストール",
  "settings.externalSkills.install.desc": "公式リポジトリからskillを選んでインストールします。",
  "settings.externalSkills.installButton": "インストール",
  "settings.externalSkills.installSkipped": "{{id}} をインストールできませんでした: {{reason}}",
  "settings.externalSkills.installed": "インストール済みskill",
  "settings.externalSkills.noVersion": "バージョン情報なし",
  "settings.externalSkills.updateAvailable": "更新あり",
  "settings.externalSkills.check": "更新を確認",
  "settings.externalSkills.upToDate": "最新です (v{{version}})。",
  "settings.externalSkills.notInCatalog": "このskillは公式リポジトリに存在しません。",
  "settings.externalSkills.updateConfirm": "{{name}} を v{{from}} から v{{to}} に更新しますか？",
  "settings.importSkills": "skillsを取り込み",
  "settings.importSkills.done": "{{skills}}個のskill、{{files}}個のファイルを取り込みました",
  "settings.importSkills.failed": "skillsの取り込みに失敗しました: {{error}}",

  // Settings - Knowledge sources
  "settings.okfSources": "OKF",

  // Settings - Tool limits

  // Settings - Slash commands

  // Settings - Slash command modal

  // Settings - RAG

  // Settings - RAG Store
  "settings.storeMode": "ストアモード",
  "settings.storeMode.desc": "内部：Vaultファイルを同期。外部：既存のセマンティック検索ストアを使用。",
  "settings.storeModeInternal": "内部（Vault同期）",
  "settings.storeModeExternal": "外部（既存ストア）",
  "settings.storeIds": "セマンティック検索ストアID",
  "settings.storeIds.desc": "外部セマンティック検索ストアID（1行に1つ）",
  "settings.storeIds.placeholder": "例：fileSearchStores/xxx",
  "settings.storeCount": "ストア数",
  "settings.storeCountDesc": "{{count}}個のストアが構成されています",
  "settings.currentStoreId": "現在のストアID",
  "settings.copyStoreId": "ストアIDをコピー",
  "settings.storeIdCopied": "ストアIDをクリップボードにコピーしました",
  "settings.metadataFilter": "メタデータフィルタ",
  "settings.metadataFilter.desc": "検索時に適用する Gemini File Search のメタデータフィルタ。内部同期では path、extension、basename、folder、modified、size を付与します。",
  "settings.metadataFilter.placeholder": "例：extension = \"pdf\" OR folder = \"notes\"",
  "settings.metadataFilter.help": "メタデータフィルタの構文を表示",
  "settings.metadataFilter.helpTitle": "メタデータフィルタの構文",
  "settings.metadataFilter.helpIntro": "メタデータフィルタは、検索時に Gemini File Search の対象を絞ります。文字列比較、数値比較、AND/OR で条件を組み合わせられます。",
  "settings.metadataFilter.helpKeys": "利用できるメタデータ",
  "settings.metadataFilter.helpKeyPath": "Vault相対のファイルパス",
  "settings.metadataFilter.helpKeyExtension": "小文字の拡張子",
  "settings.metadataFilter.helpKeyBasename": "拡張子を除いたファイル名",
  "settings.metadataFilter.helpKeyFolder": "親フォルダのパス",
  "settings.metadataFilter.helpKeyModified": "Unix epoch milliseconds の更新時刻",
  "settings.metadataFilter.helpKeySize": "バイト単位のファイルサイズ",
  "settings.metadataFilter.helpExamples": "例",
  "settings.metadataFilter.helpNote": "modified は Date.now() と同じミリ秒 timestamp です。日付はミリ秒に変換してから使います。",

  // Settings - Sync
  "settings.syncVault": "Vaultを同期",
  "settings.syncStatus": "{{count}}ファイルがインデックス済み | 最終同期: {{lastSync}}",
  "settings.syncing": "同期中...",
  "settings.syncUploading": "アップロード中",
  "settings.syncSkipping": "スキップ中",
  "settings.syncDeleting": "削除中",
  "settings.syncResult": "同期: {{uploaded}}件アップロード、{{skipped}}件スキップ、{{deleted}}件削除",
  "settings.resetSyncState": "同期状態をリセット",
  "settings.resetSyncState.desc": "ローカルの同期状態をクリア。次回の同期ですべてのファイルを再アップロードします。",
  "settings.resetSyncStateConfirm": "同期状態をリセットしますか？",
  "settings.deleteStore": "セマンティック検索ストアを削除",
  "settings.deleteStore.desc": "現在のセマンティック検索ストアとサーバー上のすべてのインデックスデータを削除",
  "settings.deleteStoreConfirm": "セマンティック検索ストアを削除しますか？サーバー上のすべてのインデックスデータが削除されます。この操作は元に戻せません。",
  "settings.storeDeleted": "セマンティック検索ストアを削除しました",
  "settings.deleteStoreFailed": "ストアの削除に失敗しました: {{error}}",

  // Settings - RAG Files Modal
  "settings.viewFiles": "ファイル一覧",
  "settings.ragFiles.title": "{{name}} のファイル",
  "settings.ragFiles.searchPlaceholder": "ファイルを検索...",
  "settings.ragFiles.filterAll": "すべて",
  "settings.ragFiles.filterRegistered": "登録済み",
  "settings.ragFiles.filterPending": "保留中",
  "settings.ragFiles.noFiles": "ファイルが見つかりません",
  "settings.ragFiles.registered": "登録済み",
  "settings.ragFiles.pending": "保留中",
  "settings.ragFiles.fileCount": "{{count}} 件",

  // Common buttons
  "common.ok": "OK",
  "common.error": "エラー: ",

  // RAG Setting Name Modal
  "modal.nameCannotBeEmpty": "名前を入力してください",
  "modal.name": "名前",
  "modal.enterName": "名前を入力",

  // Chat
  "chat.savedAsNote": "{{path}}に保存しました",
  "chat.chatDeleted": "チャットを削除しました",
  "chat.rateLimitPaid": "このモデルはレート制限されている可能性があります。明日まで別のモデルを試してください。",
  "chat.extendToolLimitTitle": "ツール呼び出し上限を延長しますか？",
  "chat.extendToolLimitMessage": "ツール呼び出しの残り回数が {{remaining}} 回になりました（使用済み: {{used}}/{{currentLimit}}）。このレスポンスに追加する回数を指定してください。",
  "chat.extendToolLimitInput": "追加するツール呼び出し回数",
  "chat.extendToolLimitConfirm": "追加する",
  "chat.errorOccurred": "エラーが発生しました: {{message}}",
  "chat.unknownError": "不明なエラー",
  "chat.helpTitle": "Gemini Helper ヘルプ",
  "chat.helpDescription": "組み込みのヘルプOKFを有効にして、Gemini Helperの機能、設定、ワークフロー、RAG、OKF、ダッシュボード、トラブルシュートについて質問できます。",
  "chat.askGeminiHelperHelp": "Gemini Helperについて質問",
  "chat.helpQuestionDraft": "Gemini Helperでは何ができますか？",
  "chat.yesterday": "昨日",

  // InputArea
  "okf.builtinHelpDescription": "組み込みのGemini Helper機能リファレンス",
  "input.knowledgeLabel": "ナレッジソース",

  // MessageBubble
  "message.gemini": "Gemini",
  // Diff viewer

  // Tool display labels

  // Workflow Panel - Node Types

  // Workflow Panel - UI Strings
  "workflow.generation.outputPathTaken": "{{path}} には既にワークフローがあります。別の出力パスを選択してください。",
  "workflow.multipleBlocksInFile": "1つのファイル内に複数のワークフローブロックが見つかりました。各ファイルに含められるワークフローは1つだけです。ファイルを手動で分割するか、移行アクションを使用してください。",
  "workflow.noCodeBlockFound": "ワークフローのコードブロックが見つかりません",
  "workflow.migrate": "個別のファイルに分割",
  "workflow.migrateConfirm": "このファイルには複数のワークフローブロックが含まれています。そのうち{{count}}個を新しい兄弟ファイルに分割しますか？\n\n{{files}}\n\n元のファイルには最初のワークフローが残ります。元のファイルパスを参照していたスキル機能、ホットキー、イベントトリガーは最初のワークフローに紐づいたままになります。必要に応じて手動で新しいファイルを指すよう設定してください。",
  "workflow.migrateSuccess": "移行が完了しました: {{count}}個のワークフローを兄弟ファイルに分割しました。",

  // Common - Edit

  // Edit Confirmation Modal

  // Value Prompt Modal

  // Dialog Prompt Modal (titles passed dynamically)

  // Edit History

  // Workflow Modals

  // Edit History Modal

  // Diff Modal

  // Edit History Buttons

  // Status bar

  // Commands

  // Workflow Selector Modal

  // Errors

  // Encryption
  "settings.encryption": "暗号化",
  "settings.encryptChatHistory": "AIチャット履歴を暗号化",
  "settings.encryptChatHistory.desc": "AIチャット履歴ファイルを暗号化します。内容を見るにはパスワードが必要です。",
  "settings.encryptWorkflowHistory": "ワークフロー実行ログを暗号化",
  "settings.encryptWorkflowHistory.desc": "ワークフロー実行ログファイルを暗号化します。内容を見るにはパスワードが必要です。",
  "settings.encryptionSetup": "暗号化の設定",
  "settings.encryptionSetup.desc": "暗号化鍵を生成します。暗号化はパスワード不要ですが、復号化にはパスワードが必要です。",
  "settings.encryptionSetupBtn": "暗号化鍵を生成",
  "settings.encryptionPassword": "暗号化パスワード",
  "settings.encryptionPassword.desc": "秘密鍵を保護するパスワード。復号化に必要です。",
  "settings.encryptionPassword.placeholder": "パスワードを入力",
  "settings.encryptionConfirmPassword": "パスワードを確認",
  "settings.encryptionConfirmPassword.placeholder": "パスワードを再入力",
  "settings.encryptionPasswordMismatch": "パスワードが一致しません",
  "settings.encryptionSetupSuccess": "暗号化鍵の生成に成功しました",
  "settings.encryptionSetupFailed": "暗号化の設定に失敗しました: {{error}}",
  "settings.encryptionConfigured": "暗号化が設定済み",
  "settings.encryptionConfigured.desc": "暗号化鍵が設定されています。以下で暗号化するログを選択してください。",
  "settings.encryptionResetKeys": "暗号化鍵をリセット",
  "settings.encryptionResetKeys.desc": "新しい暗号化鍵を生成します。以前の暗号化されたチャットは読めなくなります。",
  "settings.encryptionResetKeysConfirm": "暗号化鍵をリセットしますか？以前に暗号化されたチャット履歴は読めなくなります。",
  "settings.encryptionKeysReset": "暗号化鍵がリセットされました",

  // Decryption
  "chat.encryptedChat": "暗号化されたチャット",
  "chat.decryptFailed": "復号化に失敗しました。パスワードを確認してください。",
  "chat.decrypted": "復号化に成功しました",

  // Workflow Generation Modal

  // Workflow Preview Modal

  // Workflow Confirm Modal

  // Execution History Select Modal

  // Workflow Execution Modal

  // CryptView - File Encryption

  // Skills Settings

  // Skills UI

  // MCP Server Settings

  // Input - MCP tool hint

  // HTML Preview Modal

  // AI Workflow Modal
  "aiWorkflow.pastePlaceholder": "Claude、GPT等が出力したMarkdown（```workflowブロック含む）またはYAMLを貼り付け...",

  // Edit History Modal

  // Node Editor Modal

  // MCP Apps

  // Langfuse settings

  // Dashboard
};

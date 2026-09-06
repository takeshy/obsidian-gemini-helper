// Korean translations
export const ko: Record<string, string> = {
  // Settings - Headings
  "settings.externalSkills": "외부 스킬",

  // Settings - API
  "settings.googleApiKey": "Google API 키",
  "settings.googleApiKey.desc": "ai.google.dev에서 발급받은 API 키입니다. 이 기기의 로컬 비밀 저장소에 저장되므로 동기화된 각 기기에서 별도로 입력해야 합니다.",
  "settings.googleApiKey.missingOnDevice": "이 보관소에는 Google API 키가 설정되어 있지만 이 기기에는 저장되어 있지 않습니다. Gemini Helper 설정에서 API 키를 입력하세요.",
  "settings.apiPlan": "API 플랜",
  "settings.apiPlan.desc": "API 키의 플랜 유형을 선택하세요 (사용 가능한 모델과 검색 기능에 영향)",
  "settings.apiPlan.paid": "유료",
  "settings.apiPlan.free": "무료",

  // Settings - Workspace

  "settings.aiVaultToolAllowedFolders": "AI가 자동으로 접근할 수 있는 폴더",
  "settings.aiVaultToolAllowedFolders.desc": "선택 사항: AI가 자동으로 읽지 않았으면 하는 디렉터리가 있다면 AI가 접근해도 되는 폴더만 지정하세요.",
  "settings.aiVaultToolAllowedFolders.invalidPath": "폴더는 볼트 기준 상대 경로여야 하며 . 또는 .. 세그먼트를 포함할 수 없습니다.",
  "settings.aiVaultToolAllowedFolders.placeholder": "예: public, shared/docs",
  "settings.externalSkillsRepository": "소스 저장소",
  "settings.externalSkillsRepository.desc": "스킬은 공식 저장소 {{repo}}에서 가져와 vault의 skills/ 폴더로 복사됩니다. 각 스킬에는 manifest.json이 포함되어야 합니다.",
  "settings.externalSkills.retry": "다시 시도",
  "settings.externalSkills.loading": "사용 가능한 스킬을 불러오는 중…",
  "settings.externalSkills.loadFailed": "스킬을 불러오지 못했습니다: {{error}}",
  "settings.externalSkills.noSkills": "공식 저장소에서 호환되는 스킬을 찾을 수 없습니다.",
  "settings.externalSkills.allInstalled": "사용 가능한 모든 스킬이 이미 설치되어 있습니다.",
  "settings.externalSkills.install": "스킬 설치",
  "settings.externalSkills.install.desc": "공식 저장소에서 스킬을 선택하여 설치합니다.",
  "settings.externalSkills.installButton": "설치",
  "settings.externalSkills.installSkipped": "{{id}}을(를) 설치할 수 없습니다: {{reason}}",
  "settings.externalSkills.installed": "설치된 스킬",
  "settings.externalSkills.noVersion": "버전 없음",
  "settings.externalSkills.updateAvailable": "업데이트 사용 가능",
  "settings.externalSkills.check": "업데이트 확인",
  "settings.externalSkills.upToDate": "이미 최신 상태입니다 (v{{version}}).",
  "settings.externalSkills.notInCatalog": "이 스킬은 공식 저장소에 없습니다.",
  "settings.externalSkills.updateConfirm": "{{name}}을(를) v{{from}}에서 v{{to}}(으)로 업데이트하시겠습니까?",
  "settings.importSkills": "스킬 가져오기",
  "settings.importSkills.done": "스킬 {{skills}}개, 파일 {{files}}개를 가져왔습니다",
  "settings.importSkills.failed": "스킬을 가져오지 못했습니다: {{error}}",
  "settings.okfSources": "OKF",

  // Settings - Tool limits

  // Settings - Slash commands

  // Settings - Slash command modal

  // Settings - RAG

  // Settings - RAG Store
  "settings.storeMode": "스토어 모드",
  "settings.storeMode.desc": "내부: 볼트 파일 동기화. 외부: 기존 시맨틱 검색 스토어 사용.",
  "settings.storeModeInternal": "내부 (볼트 동기화)",
  "settings.storeModeExternal": "외부 (기존 스토어)",
  "settings.storeIds": "시맨틱 검색 스토어 ID",
  "settings.storeIds.desc": "외부 시맨틱 검색 스토어 ID (한 줄에 하나씩)",
  "settings.storeIds.placeholder": "예: fileSearchStores/xxx",
  "settings.storeCount": "스토어 수",
  "settings.storeCountDesc": "{{count}}개의 스토어가 구성됨",
  "settings.currentStoreId": "현재 스토어 ID",
  "settings.copyStoreId": "스토어 ID 복사",
  "settings.storeIdCopied": "스토어 ID가 클립보드에 복사됨",
  "settings.metadataFilter": "메타데이터 필터",
  "settings.metadataFilter.desc": "쿼리 시점에 적용되는 선택적 메타데이터 필터로, path, extension, basename, folder, modified, size 같은 내부 동기화 메타데이터를 사용합니다",
  "settings.metadataFilter.placeholder": "확장자 또는 폴더로 필터링",
  "settings.metadataFilter.help": "메타데이터 필터 구문 표시",
  "settings.metadataFilter.helpTitle": "메타데이터 필터 구문",
  "settings.metadataFilter.helpIntro": "메타데이터 필터는 쿼리 시점에 파일 검색 결과를 제한합니다. 문자열 비교, 숫자 비교, and/or를 사용하여 조건을 결합하세요.",
  "settings.metadataFilter.helpKeys": "사용 가능한 메타데이터",
  "settings.metadataFilter.helpKeyPath": "vault 상대 파일 경로",
  "settings.metadataFilter.helpKeyExtension": "소문자 파일 확장자",
  "settings.metadataFilter.helpKeyBasename": "확장자를 제외한 파일 이름",
  "settings.metadataFilter.helpKeyFolder": "상위 폴더 경로",
  "settings.metadataFilter.helpKeyModified": "유닉스 에포크 밀리초 단위의 수정 시간",
  "settings.metadataFilter.helpKeySize": "바이트 단위 파일 크기",
  "settings.metadataFilter.helpExamples": "예시",
  "settings.metadataFilter.helpNote": "modified 값은 밀리초 타임스탬프를 사용합니다. 날짜를 사용하기 전에 밀리초로 변환하세요.",

  // Settings - Sync
  "settings.syncVault": "볼트 동기화",
  "settings.syncStatus": "{{count}}개 파일 인덱스됨 | 마지막 동기화: {{lastSync}}",
  "settings.syncing": "동기화 중...",
  "settings.syncUploading": "업로드 중",
  "settings.syncSkipping": "건너뛰기",
  "settings.syncDeleting": "삭제 중",
  "settings.syncResult": "동기화: {{uploaded}}개 업로드됨, {{skipped}}개 건너뜀, {{deleted}}개 삭제됨",
  "settings.resetSyncState": "동기화 상태 재설정",
  "settings.resetSyncState.desc": "로컬 동기화 상태를 지웁니다. 다음 동기화에서 모든 파일을 다시 업로드합니다.",
  "settings.resetSyncStateConfirm": "동기화 상태를 재설정하시겠습니까?",
  "settings.deleteStore": "시맨틱 검색 스토어 삭제",
  "settings.deleteStore.desc": "현재 시맨틱 검색 스토어와 서버의 모든 인덱스된 데이터 삭제",
  "settings.deleteStoreConfirm": "시맨틱 검색 스토어를 삭제하시겠습니까? 서버의 모든 인덱스된 데이터가 삭제됩니다. 이 작업은 취소할 수 없습니다.",
  "settings.storeDeleted": "시맨틱 검색 스토어 삭제됨",
  "settings.deleteStoreFailed": "스토어 삭제 실패: {{error}}",

  // Settings - RAG Files Modal
  "settings.viewFiles": "파일 보기",
  "settings.ragFiles.title": "{{name}}의 파일",
  "settings.ragFiles.searchPlaceholder": "파일 검색...",
  "settings.ragFiles.filterAll": "전체",
  "settings.ragFiles.filterRegistered": "등록됨",
  "settings.ragFiles.filterPending": "대기 중",
  "settings.ragFiles.noFiles": "파일을 찾을 수 없습니다",
  "settings.ragFiles.registered": "등록됨",
  "settings.ragFiles.pending": "대기 중",
  "settings.ragFiles.fileCount": "{{count}} 파일",

  // Common buttons
  "common.ok": "확인",
  "common.error": "오류: ",

  // RAG Setting Name Modal
  "modal.nameCannotBeEmpty": "이름은 비워둘 수 없습니다",
  "modal.name": "이름",
  "modal.enterName": "이름 입력",

  // Chat
  "chat.savedAsNote": "{{path}}에 저장됨",
  "chat.chatDeleted": "채팅 삭제됨",
  "chat.rateLimitPaid": "이 모델이 속도 제한될 수 있습니다. 내일까지 다른 모델을 시도하세요.",
  "chat.extendToolLimitTitle": "도구 호출 한도를 확장하시겠습니까?",
  "chat.extendToolLimitMessage": "어시스턴트에게 도구 호출이 {{remaining}}회 남았습니다 ({{used}}/{{currentLimit}} 사용). 이 응답에 호출을 추가하시겠습니까?",
  "chat.extendToolLimitInput": "추가 도구 호출",
  "chat.extendToolLimitConfirm": "호출 추가",
  "chat.errorOccurred": "죄송합니다, 오류가 발생했습니다: {{message}}",
  "chat.unknownError": "알 수 없는 오류",
  "chat.helpTitle": "Gemini Helper 도움말",
  "chat.helpDescription": "내장 도움말 지식 번들을 활성화하고 gemini helper의 기능, 설정, 워크플로우, 검색, 대시보드, 문제 해결에 대해 질문하세요.",
  "chat.askGeminiHelperHelp": "gemini helper에 대해 질문하기",
  "chat.helpQuestionDraft": "gemini helper로 무엇을 할 수 있나요?",
  "chat.yesterday": "어제",

  // InputArea
  "okf.builtinHelpDescription": "내장 gemini helper 기능 참조",
  "input.knowledgeLabel": "지식 소스",

  // MessageBubble
  "message.gemini": "Gemini",
  // Diff viewer

  // Tool display labels

  // Workflow Panel - Node Types

  // Workflow Panel - UI Strings
  "workflow.multipleBlocksInFile": "단일 파일에서 여러 워크플로우 블록이 발견되었습니다. 각 파일에는 워크플로우를 하나만 포함할 수 있습니다. 파일을 수동으로 분할하거나 마이그레이션 작업을 사용하세요.",
  "workflow.migrateConfirm": "이 파일에는 여러 워크플로우 블록이 포함되어 있습니다. 그 중 {{count}}개를 새 형제 파일로 분할하시겠습니까?\n\n{{files}}\n\n원본 파일에는 첫 번째 워크플로우가 유지됩니다. 원본 파일 경로를 참조하던 스킬 기능, 단축키, 이벤트 트리거는 첫 번째 워크플로우에 연결된 상태로 유지됩니다. 필요하면 수동으로 새 파일을 가리키도록 설정하세요.",
  "workflow.migrateSuccess": "마이그레이션 완료: 워크플로우 {{count}}개를 형제 파일로 분할했습니다.",

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
  "settings.encryption": "암호화",
  "settings.encryptChatHistory": "AI 채팅 기록 암호화",
  "settings.encryptChatHistory.desc": "AI 채팅 기록 파일을 암호화합니다. 내용을 보려면 비밀번호가 필요합니다.",
  "settings.encryptWorkflowHistory": "워크플로우 실행 로그 암호화",
  "settings.encryptWorkflowHistory.desc": "워크플로우 실행 로그 파일을 암호화합니다. 내용을 보려면 비밀번호가 필요합니다.",
  "settings.encryptionSetup": "암호화 설정",
  "settings.encryptionSetup.desc": "암호화 키를 생성합니다. 비밀번호 없이 암호화할 수 있지만, 복호화하려면 비밀번호가 필요합니다.",
  "settings.encryptionSetupBtn": "암호화 키 생성",
  "settings.encryptionPassword": "암호화 비밀번호",
  "settings.encryptionPassword.desc": "개인 키를 보호하는 비밀번호입니다. 복호화에 필요합니다.",
  "settings.encryptionPassword.placeholder": "비밀번호 입력",
  "settings.encryptionConfirmPassword": "비밀번호 확인",
  "settings.encryptionConfirmPassword.placeholder": "비밀번호 확인",
  "settings.encryptionPasswordMismatch": "비밀번호가 일치하지 않습니다",
  "settings.encryptionSetupSuccess": "암호화 키가 성공적으로 생성되었습니다",
  "settings.encryptionSetupFailed": "암호화 설정 실패: {{error}}",
  "settings.encryptionConfigured": "암호화 구성됨",
  "settings.encryptionConfigured.desc": "암호화 키가 설정되었습니다. 아래에서 암호화할 로그를 선택하세요.",
  "settings.encryptionResetKeys": "암호화 키 재설정",
  "settings.encryptionResetKeys.desc": "새 암호화 키를 생성합니다. 이전에 암호화된 채팅은 읽을 수 없게 됩니다.",
  "settings.encryptionResetKeysConfirm": "암호화 키를 재설정하시겠습니까? 이전에 암호화된 모든 채팅 기록을 읽을 수 없게 됩니다.",
  "settings.encryptionKeysReset": "암호화 키가 재설정되었습니다",

  // Decryption
  "chat.encryptedChat": "암호화된 채팅",
  "chat.decryptFailed": "복호화 실패. 비밀번호를 확인하세요.",
  "chat.decrypted": "복호화 성공",

  // Workflow Generation Modal

  // Workflow Preview Modal

  // Workflow Confirm Modal

  // Execution History Select Modal

  // Workflow Execution Modal

  // CryptView - File Encryption

  // MCP Server Settings

  // Input - MCP tool hint

  // Skills Settings

  // Skills UI

  // HTML Preview Modal

  // AI Workflow Modal
  "aiWorkflow.pastePlaceholder": "Claude, GPT 등에서 출력한 Markdown(```workflow 블록 포함) 또는 YAML을 붙여넣기...",

  // Edit History Modal

  // Node Editor Modal

  // MCP Apps

  // Langfuse settings

  // Dashboard
};

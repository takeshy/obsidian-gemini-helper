# Gemini Helper for Obsidian

[![DeepWiki](https://img.shields.io/badge/DeepWiki-takeshy%2Fobsidian--gemini--helper-blue.svg?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTQgMTloMTZhMiAyIDAgMCAwIDItMlY3YTIgMiAwIDAgMC0yLTJINWEyIDIgMCAwIDAtMiAydjEyYTIgMiAwIDAgMSAyLTJ6Ii8+PHBhdGggZD0iTTkgMTV2LTQiLz48cGF0aCBkPSJNMTIgMTV2LTIiLz48cGF0aCBkPSJNMTUgMTV2LTQiLz48L3N2Zz4=)](https://deepwiki.com/takeshy/obsidian-gemini-helper)

Google Gemini 기반의 **Chat**, **Workflow 자동화**, **RAG** 기능을 제공하는 **무료 오픈소스** Obsidian AI 어시스턴트입니다.

> **이 플러그인은 완전히 무료입니다.** [ai.google.dev](https://ai.google.dev)에서 Google Gemini API 키(무료 또는 유료)만 있으면 됩니다. 또는 CLI 도구를 사용할 수도 있습니다: [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Claude Code](https://github.com/anthropics/claude-code), [Codex CLI](https://github.com/openai/codex).

## 주요 기능

- **AI Chat** - 스트리밍 응답, 파일 첨부, vault 작업, 슬래시 명령어
- **Workflow Builder** - 비주얼 노드 편집기와 22개 노드 유형으로 다단계 작업 자동화
- **Edit History** - AI가 만든 변경 사항을 diff 뷰로 추적하고 복원
- **RAG** - vault 전체에서 지능적 검색을 위한 검색 증강 생성
- **Web Search** - Google Search를 통한 최신 정보 접근
- **Image Generation** - Gemini 이미지 모델로 이미지 생성
- **암호화** - 채팅 기록 및 워크플로우 실행 로그를 비밀번호로 보호

![채팅에서 이미지 생성](docs/images/chat_image.png)

## API 키 / CLI 옵션

이 플러그인은 Google Gemini API 키 또는 CLI 도구가 필요합니다. 다음 중 선택할 수 있습니다:

| 기능 | 무료 API 키 | 유료 API 키 | CLI |
|---------|--------------|--------------|-----|
| 기본 채팅 | ✅ | ✅ | ✅ |
| Vault 작업 | ✅ | ✅ | 읽기/검색만 가능 |
| Web Search | ✅ | ✅ | ❌ |
| RAG | ✅ (제한적) | ✅ | ❌ |
| Workflow | ✅ | ✅ | ✅ |
| Image Generation | ❌ | ✅ | ❌ |
| 모델 | Flash, Gemma | Flash, Pro, Image | Gemini CLI, Claude Code, Codex |
| 비용 | **무료** | 사용량에 따라 과금 | **무료** |

> [!TIP]
> **CLI 옵션**을 사용하면 계정만으로 플래그십 모델을 사용할 수 있습니다 - API 키가 필요 없습니다!
> - **Gemini CLI**: [Gemini CLI](https://github.com/google-gemini/gemini-cli) 설치 후, `gemini` 실행하고 `/auth`로 인증
> - **Claude CLI**: [Claude Code](https://github.com/anthropics/claude-code) 설치 (`npm install -g @anthropic-ai/claude-code`), `claude` 실행 후 인증
> - **Codex CLI**: [Codex CLI](https://github.com/openai/codex) 설치 (`npm install -g @openai/codex`), `codex` 실행 후 인증

### 무료 API 키 팁

- **Rate limit**은 모델별로 적용되며 매일 초기화됩니다. 모델을 전환하여 계속 작업할 수 있습니다.
- **RAG 동기화**는 제한이 있습니다. 매일 "Sync Vault"를 실행하세요 - 이미 업로드된 파일은 건너뜁니다.
- **Gemma 모델**과 **Gemini CLI**는 Chat에서 vault 작업을 지원하지 않지만, **Workflow에서는 `note`, `note-read` 등의 노드 유형을 사용하여 노트를 읽고 쓸 수 있습니다**. `{content}` 및 `{selection}` 변수도 작동합니다.

---

# AI Chat

AI Chat 기능은 Obsidian vault와 통합된 Google Gemini와의 대화형 인터페이스를 제공합니다.

![Chat Interface](docs/images/chat.png)

## 슬래시 명령어

`/`로 시작하는 재사용 가능한 프롬프트 템플릿을 만들 수 있습니다:

- `{selection}` (선택된 텍스트) 및 `{content}` (활성 노트)로 템플릿 정의
- 명령어별로 모델 및 검색 설정 재정의 가능
- `/`를 입력하면 사용 가능한 명령어 목록 표시

**기본 제공:** `/infographic` - 콘텐츠를 HTML 인포그래픽으로 변환

![Infographic Example](docs/images/chat_infographic.png)

## @ 멘션

`@`를 입력하여 파일과 변수를 참조할 수 있습니다:

- `{selection}` - 선택된 텍스트
- `{content}` - 활성 노트 내용
- 모든 vault 파일 - 탐색 및 삽입 (경로만 삽입; AI가 도구를 통해 내용 읽기)

> [!NOTE]
> Vault 파일 @멘션은 파일 경로만 삽입하며 AI가 도구를 통해 내용을 읽습니다. Gemma 모델에서는 작동하지 않습니다(vault 도구 미지원). Gemini CLI는 셸을 통해 파일을 읽을 수 있지만, 응답 형식이 다를 수 있습니다.

## 파일 첨부

파일을 직접 첨부할 수 있습니다: 이미지(PNG, JPEG, GIF, WebP), PDF, 텍스트 파일

## Function Calling (Vault 작업)

AI는 다음 도구를 사용하여 vault와 상호작용할 수 있습니다:

| 도구 | 설명 |
|------|-------------|
| `read_note` | 노트 내용 읽기 |
| `create_note` | 새 노트 생성 |
| `propose_edit` | 확인 대화상자와 함께 편집 |
| `propose_delete` | 확인 대화상자와 함께 삭제 |
| `bulk_propose_edit` | 선택 대화상자로 여러 파일 일괄 편집 |
| `bulk_propose_delete` | 선택 대화상자로 여러 파일 일괄 삭제 |
| `search_notes` | 이름 또는 내용으로 vault 검색 |
| `list_notes` | 폴더 내 노트 목록 |
| `rename_note` | 노트 이름 변경/이동 |
| `create_folder` | 새 폴더 생성 |
| `list_folders` | vault 내 폴더 목록 |
| `get_active_note_info` | 활성 노트 정보 가져오기 |
| `get_rag_sync_status` | RAG 동기화 상태 확인 |

### Vault 도구 모드

AI가 Chat에서 노트를 처리할 때 Vault 도구를 사용합니다. 첨부 버튼 아래의 데이터베이스 아이콘(📦)을 통해 AI가 사용할 수 있는 Vault 도구를 제어합니다:

| 모드 | 설명 | 사용 가능한 도구 |
|------|------|------------------|
| **Vault: 전체** | 전체 Vault 접근 | 모든 도구 |
| **Vault: 검색 제외** | 검색 도구 제외 | `search_notes`, `list_notes` 제외 전체 |
| **Vault: 끄기** | Vault 접근 없음 | 없음 |

**각 모드 사용 시기:**

- **Vault: 전체** - 일반 사용을 위한 기본 모드입니다. AI가 vault를 읽고, 쓰고, 검색할 수 있습니다.
- **Vault: 검색 제외** - RAG로만 검색하고 싶거나, 이미 대상 파일을 알고 있을 때 사용합니다. 중복 vault 검색을 피하여 토큰을 절약하고 응답 시간을 개선합니다.
- **Vault: 끄기** - vault 접근이 전혀 필요 없을 때 사용합니다.

**자동 모드 선택:**

| 조건 | 기본 모드 | 변경 가능 |
|------|-----------|-----------|
| CLI 모델 (Gemini/Claude/Codex CLI) | Vault: 끄기 | 아니오 |
| Gemma 모델 | Vault: 끄기 | 아니오 |
| Web Search 활성화 | Vault: 끄기 | 아니오 |
| Flash Lite + RAG | Vault: 끄기 | 아니오 |
| RAG 활성화 | Vault: 검색 제외 | 예 |
| RAG 없음 | Vault: 전체 | 예 |

**일부 모드가 강제되는 이유:**

- **CLI/Gemma 모델**: 이러한 모델은 함수 호출을 지원하지 않으므로 Vault 도구를 사용할 수 없습니다.
- **Web Search**: 설계상 Web Search가 활성화되면 Vault 도구가 비활성화됩니다.
- **Flash Lite + RAG**: RAG와 Vault 도구가 모두 활성화되면 Flash Lite 모델이 혼란스러워지고 제대로 작동하지 않습니다. RAG가 자동으로 우선시되고 Vault 도구가 비활성화됩니다.

## 안전한 편집

AI가 `propose_edit`을 사용할 때:
1. 확인 대화상자에 제안된 변경 사항이 표시됩니다
2. **Apply**를 클릭하여 파일에 변경 사항 적용
3. **Discard**를 클릭하여 파일 수정 없이 취소

> 변경 사항은 확인하기 전까지 기록되지 않습니다.

## Edit History

노트에 대한 변경 사항을 추적하고 복원합니다:

- **자동 추적** - 모든 AI 편집(채팅, 워크플로우)과 수동 변경 사항이 기록됩니다
- **파일 메뉴 접근** - Markdown 파일을 우클릭하여 접근:
  - **Snapshot** - 현재 상태를 스냅샷으로 저장
  - **History** - 편집 히스토리 모달 열기

![File Menu](docs/images/snap_history.png)

- **명령 팔레트** - "Show edit history" 명령어로도 사용 가능
- **Diff 뷰** - 색상으로 구분된 추가/삭제로 정확히 무엇이 변경되었는지 확인
- **복원** - 한 번의 클릭으로 이전 버전으로 되돌리기
- **크기 조절 가능한 모달** - 드래그하여 이동, 모서리에서 크기 조절

**Diff 표시:**
- `+` 줄은 이전 버전에 있었던 내용
- `-` 줄은 새 버전에 추가된 내용

**작동 방식:**

Edit history는 스냅샷 기반 접근 방식을 사용합니다:

1. **스냅샷 생성** - 파일이 처음 열리거나 AI에 의해 수정될 때 해당 내용의 스냅샷이 저장됩니다
2. **Diff 기록** - 파일이 수정되면 새 내용과 스냅샷 간의 차이가 히스토리 항목으로 기록됩니다
3. **스냅샷 업데이트** - 각 수정 후 스냅샷이 새 내용으로 업데이트됩니다
4. **복원** - 이전 버전으로 복원하려면 스냅샷에서 diff를 역순으로 적용합니다

**히스토리가 기록되는 시점:**
- AI 채팅 편집 (`propose_edit` 도구)
- 워크플로우 노트 수정 (`note` 노드)
- 명령어를 통한 수동 저장
- 파일 열기 시 스냅샷과 다른 경우 자동 감지

**저장 위치:**
- 히스토리 파일: `{workspaceFolder}/history/{filename}.history.md`
- 스냅샷 파일: `{workspaceFolder}/history/{filename}.snapshot.md`

**설정:**
- 플러그인 설정에서 활성화/비활성화
- diff의 컨텍스트 줄 수 설정
- 보존 제한 설정 (파일당 최대 항목 수, 최대 보존 기간)

![Edit History Modal](docs/images/edit_history.png)

## RAG

vault의 지능적 검색을 위한 검색 증강 생성:

- **지원 파일** - Markdown, PDF, 이미지(PNG, JPEG, GIF, WebP)
- **Internal 모드** - vault 파일을 Google File Search에 동기화
- **External 모드** - 기존 store ID 사용
- **증분 동기화** - 변경된 파일만 업로드
- **대상 폴더** - 포함할 폴더 지정
- **제외 패턴** - 파일 제외를 위한 정규식 패턴

![RAG Settings](docs/images/setting_rag.png)

## MCP 서버

MCP(Model Context Protocol) 서버는 Vault 작업 이외의 AI 기능을 확장하는 추가 도구를 제공합니다.

**설정:**

1. 플러그인 설정 → **MCP 서버** 섹션 열기
2. **서버 추가** 클릭
3. 서버 이름과 URL 입력
4. 인증을 위한 선택적 헤더 구성 (JSON 형식)
5. **연결 테스트** 클릭하여 확인하고 사용 가능한 도구 가져오기
6. 서버 구성 저장

> **참고:** 저장하기 전에 연결 테스트가 필요합니다. 이를 통해 서버에 접근할 수 있는지 확인하고 사용 가능한 도구를 표시합니다.

![MCP 서버 설정](docs/images/setting_mcp.png)

**MCP 도구 사용:**

- **채팅에서:** 데이터베이스 아이콘(📦)을 클릭하여 도구 설정을 엽니다. 대화별로 MCP 서버를 활성화/비활성화할 수 있습니다.
- **워크플로우에서:** `mcp` 노드를 사용하여 MCP 서버 도구를 호출합니다.

**도구 힌트:** 연결 테스트 성공 후 사용 가능한 도구 이름이 저장되어 설정과 채팅 UI 모두에 표시됩니다.

---

# Workflow Builder

Markdown 파일에서 직접 자동화된 다단계 워크플로우를 구축합니다. **프로그래밍 지식이 필요 없습니다** - 자연어로 원하는 것을 설명하면 AI가 워크플로우를 생성합니다.

![Visual Workflow Editor](docs/images/visual_workflow.png)

## AI 기반 워크플로우 생성

**YAML 문법이나 노드 유형을 배울 필요가 없습니다.** 일반 언어로 워크플로우를 설명하기만 하면 됩니다:

1. Gemini 사이드바에서 **Workflow** 탭 열기
2. 드롭다운에서 **+ New (AI)** 선택
3. 원하는 것을 설명: *"선택한 노트를 요약하고 summaries 폴더에 저장하는 워크플로우 만들어줘"*
4. **Generate** 클릭 - AI가 완전한 워크플로우 생성

![Create Workflow with AI](docs/images/create_workflow_with_ai.png)

**기존 워크플로우도 같은 방식으로 수정:**
1. 아무 워크플로우나 로드
2. **AI Modify** 버튼 클릭
3. 변경 사항 설명: *"요약을 일본어로 번역하는 단계 추가해줘"*
4. 검토 후 적용

![AI Workflow Modification](docs/images/modify_workflow_with_ai.png)

## 빠른 시작 (수동)

워크플로우를 수동으로 작성할 수도 있습니다. Markdown 파일에 workflow 코드 블록을 추가하세요:

````markdown
```workflow
name: Quick Summary
nodes:
  - id: input
    type: dialog
    title: Enter topic
    inputTitle: Topic
    saveTo: topic
  - id: generate
    type: command
    prompt: "Write a brief summary about {{topic.input}}"
    saveTo: result
  - id: save
    type: note
    path: "summaries/{{topic.input}}.md"
    content: "{{result}}"
    mode: create
```
````

Gemini 사이드바에서 **Workflow** 탭을 열어 실행하세요.

## 사용 가능한 노드 유형

워크플로우 구축에 22개 노드 유형을 사용할 수 있습니다:

| 카테고리 | 노드 |
|----------|-------|
| 변수 | `variable`, `set` |
| 제어 | `if`, `while` |
| LLM | `command` |
| 데이터 | `http`, `json` |
| 노트 | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` |
| 파일 | `file-explorer`, `file-save` |
| 프롬프트 | `prompt-file`, `prompt-selection`, `dialog` |
| 구성 | `workflow` |
| RAG | `rag-sync` |
| 외부 | `mcp`, `obsidian-command` |

> **자세한 노드 사양과 예제는 [WORKFLOW_NODES.md](docs/WORKFLOW_NODES_ko.md)를 참조하세요**

## 단축키 모드

키보드 단축키를 할당하여 워크플로우를 즉시 실행할 수 있습니다:

1. 워크플로우에 `name:` 필드 추가
2. 워크플로우 파일을 열고 드롭다운에서 워크플로우 선택
3. Workflow 패널 하단의 키보드 아이콘 (⌨️) 클릭
4. 설정 → 단축키 → "Workflow: [워크플로우 이름]" 검색
5. 단축키 할당 (예: `Ctrl+Shift+T`)

단축키로 실행 시:
- `prompt-file`은 자동으로 활성 파일 사용 (대화상자 없음)
- `prompt-selection`은 현재 선택 영역 사용, 선택 없으면 전체 파일 내용 사용

## 이벤트 트리거

Obsidian 이벤트에 의해 워크플로우가 자동으로 트리거될 수 있습니다:

![Event Trigger Settings](docs/images/event_setting.png)

| 이벤트 | 설명 |
|-------|-------------|
| File Created | 새 파일이 생성될 때 트리거 |
| File Modified | 파일이 저장될 때 트리거 (5초 디바운스) |
| File Deleted | 파일이 삭제될 때 트리거 |
| File Renamed | 파일 이름이 변경될 때 트리거 |
| File Opened | 파일이 열릴 때 트리거 |

**이벤트 트리거 설정:**
1. 워크플로우에 `name:` 필드 추가
2. 워크플로우 파일을 열고 드롭다운에서 워크플로우 선택
3. Workflow 패널 하단의 번개 아이콘 (⚡) 클릭
4. 워크플로우를 트리거할 이벤트 선택
5. 선택적으로 파일 패턴 필터 추가

**파일 패턴 예제:**
- `**/*.md` - 모든 폴더의 모든 Markdown 파일
- `journal/*.md` - journal 폴더의 Markdown 파일만
- `*.md` - 루트 폴더의 Markdown 파일만
- `**/{daily,weekly}/*.md` - daily 또는 weekly 폴더의 파일
- `projects/[a-z]*.md` - 소문자로 시작하는 파일

**이벤트 변수:** 이벤트에 의해 트리거될 때 다음 변수가 자동으로 설정됩니다:

| 변수 | 설명 |
|----------|-------------|
| `__eventType__` | 이벤트 유형: `create`, `modify`, `delete`, `rename`, `file-open` |
| `__eventFilePath__` | 영향을 받는 파일의 경로 |
| `__eventFile__` | 파일 정보가 포함된 JSON (path, basename, name, extension) |
| `__eventFileContent__` | 파일 내용 (create/modify/file-open 이벤트용) |
| `__eventOldPath__` | 이전 경로 (rename 이벤트에만 해당) |

> **참고:** `prompt-file` 및 `prompt-selection` 노드는 이벤트에 의해 트리거될 때 자동으로 이벤트 파일을 사용합니다. `prompt-selection`은 전체 파일 내용을 선택 영역으로 사용합니다.

---

# 공통 사항

## 지원 모델

### 유료 플랜
| 모델 | 설명 |
|-------|-------------|
| Gemini 3 Flash Preview | 빠른 모델, 1M 컨텍스트 (기본값) |
| Gemini 3 Pro Preview | 플래그십 모델, 1M 컨텍스트 |
| Gemini 2.5 Flash Lite | 경량 flash 모델 |
| Gemini 2.5 Flash (Image) | 이미지 생성, 1024px |
| Gemini 3 Pro (Image) | Pro 이미지 생성, 4K |

### 무료 플랜
| 모델 | Vault 작업 |
|-------|------------------|
| Gemini 2.5 Flash | ✅ |
| Gemini 2.5 Flash Lite | ✅ |
| Gemini 3 Flash Preview | ✅ |
| Gemma 3 (27B/12B/4B/1B) | ❌ |

## 설치

### BRAT (권장)
1. [BRAT](https://github.com/TfTHacker/obsidian42-brat) 플러그인 설치
2. BRAT 설정 열기 → "Add Beta plugin"
3. 입력: `https://github.com/takeshy/obsidian-gemini-helper`
4. 커뮤니티 플러그인 설정에서 플러그인 활성화

### 수동 설치
1. releases에서 `main.js`, `manifest.json`, `styles.css` 다운로드
2. `.obsidian/plugins/`에 `gemini-helper` 폴더 생성
3. 파일 복사 후 Obsidian 설정에서 활성화

### 소스에서 빌드
```bash
git clone https://github.com/takeshy/obsidian-gemini-helper
cd obsidian-gemini-helper
npm install
npm run build
```

## 설정

### API 설정
1. [ai.google.dev](https://ai.google.dev)에서 API 키 받기
2. 플러그인 설정에 입력
3. API 플랜 선택 (Free/Paid)

![Basic Settings](docs/images/setting_basic.png)

### CLI 모드 (Gemini / Claude / Codex)

**Gemini CLI:**
1. [Gemini CLI](https://github.com/google-gemini/gemini-cli) 설치
2. `gemini` → `/auth`로 인증
3. Gemini CLI 섹션에서 "Verify" 클릭

**Claude CLI:**
1. [Claude Code](https://github.com/anthropics/claude-code) 설치: `npm install -g @anthropic-ai/claude-code`
2. `claude`로 인증
3. Claude CLI 섹션에서 "Verify" 클릭

**Codex CLI:**
1. [Codex CLI](https://github.com/openai/codex) 설치: `npm install -g @openai/codex`
2. `codex`로 인증
3. Codex CLI 섹션에서 "Verify" 클릭

**CLI 제한 사항:** 읽기 전용 vault 작업, semantic/web search 없음

### Workspace 설정
- **Workspace Folder** - 채팅 기록 및 설정 저장 위치
- **System Prompt** - 추가 AI 지시사항
- **Tool Limits** - function call 제한 설정
- **Edit History** - AI가 만든 변경 사항을 추적하고 복원

![Tool Limits & Edit History](docs/images/setting_tool_history.png)

### 암호화

채팅 기록과 워크플로우 실행 로그를 개별적으로 비밀번호로 보호합니다.

**설정 방법:**

1. 플러그인 설정에서 비밀번호 설정 (공개키 암호화 방식으로 안전하게 저장)

![암호화 초기 설정](docs/images/setting_initial_encryption.png)

2. 설정 후 각 로그 유형의 암호화를 전환:
   - **AI 채팅 기록 암호화** - 채팅 대화 파일을 암호화
   - **워크플로우 실행 로그 암호화** - 워크플로우 기록 파일을 암호화

![암호화 설정](docs/images/setting_encryption.png)

각 설정은 독립적으로 활성화/비활성화할 수 있습니다.

**기능:**
- **개별 제어** - 암호화할 로그 선택 (채팅, 워크플로우 또는 둘 다)
- **자동 암호화** - 설정에 따라 새 파일이 저장 시 암호화
- **비밀번호 캐싱** - 세션당 한 번만 비밀번호 입력
- **전용 뷰어** - 암호화된 파일은 미리보기가 있는 보안 편집기에서 열림
- **복호화 옵션** - 필요시 개별 파일에서 암호화 제거

**작동 방식:**

```
[설정 - 비밀번호 설정 시 한 번만]
비밀번호 → 키 쌍 생성 (RSA) → 개인 키 암호화 → 설정에 저장

[암호화 - 각 파일]
파일 내용 → 새 AES 키로 암호화 → 공개 키로 AES 키 암호화
→ 파일에 저장: 암호화된 데이터 + 암호화된 개인 키 (설정에서 복사) + salt

[복호화]
비밀번호 + salt → 개인 키 복원 → AES 키 복호화 → 파일 내용 복호화
```

- 키 쌍은 한 번만 생성됨 (RSA 생성이 느림), AES 키는 파일별로 생성
- 각 파일에 저장: 암호화된 콘텐츠 + 암호화된 개인 키 (설정에서 복사) + salt
- 파일은 자체 완결형 — 비밀번호만으로 복호화 가능, 플러그인 의존성 없음

<details>
<summary>Python 복호화 스크립트 (클릭하여 펼치기)</summary>

```python
#!/usr/bin/env python3
"""플러그인 없이 Gemini Helper 암호화 파일 복호화"""
import base64, sys, re, getpass
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric import padding

def decrypt_file(filepath: str, password: str) -> str:
    with open(filepath, 'r') as f:
        content = f.read()

    match = re.match(r'^---\n([\s\S]*?)\n---\n([\s\S]*)$', content)
    if not match:
        raise ValueError("잘못된 암호화 파일 형식")

    frontmatter, encrypted_data = match.groups()
    key_match = re.search(r'key:\s*(.+)', frontmatter)
    salt_match = re.search(r'salt:\s*(.+)', frontmatter)
    if not key_match or not salt_match:
        raise ValueError("frontmatter에 key 또는 salt 없음")

    enc_private_key = base64.b64decode(key_match.group(1).strip())
    salt = base64.b64decode(salt_match.group(1).strip())
    data = base64.b64decode(encrypted_data.strip())

    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100000)
    derived_key = kdf.derive(password.encode())

    iv, enc_priv = enc_private_key[:12], enc_private_key[12:]
    private_key_pem = AESGCM(derived_key).decrypt(iv, enc_priv, None)
    private_key = serialization.load_der_private_key(base64.b64decode(private_key_pem), None)

    key_len = (data[0] << 8) | data[1]
    enc_aes_key = data[2:2+key_len]
    content_iv = data[2+key_len:2+key_len+12]
    enc_content = data[2+key_len+12:]

    aes_key = private_key.decrypt(enc_aes_key, padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None))

    return AESGCM(aes_key).decrypt(content_iv, enc_content, None).decode('utf-8')

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"사용법: {sys.argv[0]} <암호화_파일>")
        sys.exit(1)
    password = getpass.getpass("비밀번호: ")
    print(decrypt_file(sys.argv[1], password))
```

필요: `pip install cryptography`

</details>

> **경고:** 비밀번호를 잊으면 암호화된 파일을 복구할 수 없습니다. 비밀번호를 안전하게 보관하세요.

> **팁:** 디렉토리의 모든 파일을 한 번에 암호화하려면 워크플로우를 사용하세요. [WORKFLOW_NODES_ko.md](docs/WORKFLOW_NODES_ko.md#obsidian-command)의 "디렉토리의 모든 파일 암호화" 예제를 참조하세요.

![파일 암호화 워크플로우](docs/images/enc.png)

**보안 이점:**
- **AI 채팅으로부터 보호** - 암호화된 파일은 AI Vault 작업(`read_note` 도구)으로 읽을 수 없습니다. 이를 통해 API 키와 같은 민감한 데이터가 채팅 중 실수로 노출되는 것을 방지합니다.
- **비밀번호로 워크플로우 접근** - 워크플로우는 `note-read` 노드를 사용하여 암호화된 파일을 읽을 수 있습니다. 접근 시 비밀번호 대화 상자가 나타나고, 비밀번호는 세션 동안 캐시됩니다.
- **시크릿 안전하게 저장** - API 키를 워크플로우에 직접 작성하는 대신 암호화된 파일에 저장하세요. 워크플로우는 비밀번호 확인 후 런타임에 키를 읽습니다.

### 슬래시 명령어
- `/`로 시작하는 사용자 정의 프롬프트 템플릿 정의
- 명령어별로 모델 및 검색 설정 재정의 가능

![Slash Commands](docs/images/setting_slash_command.png)

## 사용법

### 채팅 열기
- 리본에서 Gemini 아이콘 클릭
- 명령어: "Gemini Helper: Open chat"
- 토글: "Gemini Helper: Toggle chat / editor"

### 채팅 컨트롤
- **Enter** - 메시지 전송
- **Shift+Enter** - 새 줄
- **Stop 버튼** - 생성 중지
- **+ 버튼** - 새 채팅
- **History 버튼** - 이전 채팅 불러오기

### 워크플로우 사용

**사이드바에서:**
1. 사이드바에서 **Workflow** 탭 열기
2. `workflow` 코드 블록이 있는 파일 열기
3. 드롭다운에서 워크플로우 선택
4. **Run**을 클릭하여 실행
5. **History**를 클릭하여 과거 실행 보기

**명령 팔레트에서 (Run Workflow):**

"Gemini Helper: Run Workflow" 명령을 사용하여 어디서든 워크플로우를 탐색하고 실행할 수 있습니다:

1. 명령 팔레트를 열고 "Run Workflow" 검색
2. 워크플로우 코드 블록이 있는 모든 Vault 파일 탐색 (`workflows/` 폴더의 파일이 먼저 표시됨)
3. 워크플로우 내용과 AI 생성 기록 미리보기
4. 워크플로우를 선택하고 **Run**을 클릭하여 실행

![워크플로우 실행 모달](docs/images/workflow_list.png)

워크플로우 파일로 먼저 이동하지 않고도 빠르게 워크플로우를 실행할 수 있어 유용합니다.

![Workflow History](docs/images/workflow_history.png)

**플로우차트로 시각화:** Workflow 패널에서 **Canvas** 버튼(격자 아이콘)을 클릭하여 워크플로우를 Obsidian Canvas로 내보낼 수 있습니다. 다음과 같은 시각적 플로우차트가 생성됩니다:
- 루프와 분기가 적절한 라우팅으로 명확하게 표시됨
- 조건 노드(`if`/`while`)가 예/아니오 경로를 표시
- 루프백 화살표가 노드를 우회하여 가독성 향상
- 각 노드가 전체 구성을 표시
- 빠른 탐색을 위한 원본 워크플로우 파일 링크 포함

![Workflow to Canvas](docs/images/workflow_to_canvas.png)

여러 분기와 루프가 있는 복잡한 워크플로우를 이해하는 데 특히 유용합니다.

**실행 기록 내보내기:** 실행 기록을 Obsidian Canvas로 시각적 분석. History 모달에서 **Open Canvas view**를 클릭하여 Canvas 파일을 생성.

> **참고:** Canvas 파일은 workspace 폴더에 동적으로 생성됩니다. 확인 후 더 이상 필요하지 않으면 수동으로 삭제하세요.

![History Canvas View](docs/images/history_canvas.png)

### AI 워크플로우 생성

**AI로 새 워크플로우 생성:**
1. 워크플로우 드롭다운에서 **+ New (AI)** 선택
2. 워크플로우 이름과 출력 경로 입력 (`{{name}}` 변수 지원)
3. 자연어로 워크플로우가 해야 할 일 설명
4. 모델 선택 후 **Generate** 클릭
5. 워크플로우가 자동으로 생성되고 저장됨

> **팁:** 이미 워크플로우가 있는 파일에서 드롭다운의 **+ New (AI)**를 사용하면 출력 경로가 현재 파일로 기본 설정됩니다. 생성된 워크플로우는 해당 파일에 추가됩니다.

**모든 파일에서 워크플로우 생성:**

워크플로우 코드 블록이 없는 파일에서 Workflow 탭을 열면 **"Create workflow with AI"** 버튼이 표시됩니다. 클릭하여 새 워크플로우를 생성합니다 (기본 출력: `workflows/{{name}}.md`).

**@ 파일 참조:**

설명 필드에 `@`를 입력하여 파일을 참조할 수 있습니다:
- `@{selection}` - 현재 에디터 선택 영역
- `@{content}` - 활성 노트 내용
- `@path/to/file.md` - Vault 내 모든 파일

Generate를 클릭하면 파일 내용이 AI 요청에 직접 포함됩니다. YAML 프론트매터는 자동으로 제거됩니다.

> **팁:** Vault에 있는 기존 워크플로우 예제나 템플릿을 기반으로 워크플로우를 만들 때 유용합니다.

**파일 첨부:**

첨부 버튼을 클릭하여 워크플로우 생성 요청에 파일(이미지, PDF, 텍스트 파일)을 첨부할 수 있습니다. AI에 시각적 컨텍스트나 예시를 제공하는 데 유용합니다.

**모달 컨트롤:**

AI 워크플로우 모달은 드래그 앤 드롭 위치 조정과 모서리에서 크기 조절을 지원하여 더 나은 편집 환경을 제공합니다.

**요청 기록:**

AI로 생성된 워크플로우는 워크플로우 코드 블록 위에 기록 항목을 저장합니다:
- 타임스탬프와 작업 (생성됨/수정됨)
- 요청 설명
- 참조된 파일 내용 (접을 수 있는 섹션으로)

![워크플로우 AI 기록](docs/images/workflow_ai_history.png)

**AI로 기존 워크플로우 수정:**
1. 기존 워크플로우 로드
2. **AI Modify** 버튼 (반짝이 아이콘) 클릭
3. 원하는 변경 사항 설명
4. 변경 전/후 비교 검토
5. **Apply Changes**를 클릭하여 업데이트

![AI Workflow Modification](docs/images/modify_workflow_with_ai.png)

**실행 기록 참조:**

AI로 워크플로우를 수정할 때 이전 실행 결과를 참조하여 AI가 문제를 이해하도록 도울 수 있습니다:

1. **실행 기록 참조** 버튼 클릭
2. 목록에서 실행 기록 선택 (오류가 있는 실행은 강조 표시)
3. 포함할 단계 선택 (오류 단계는 기본적으로 선택됨)
4. AI가 단계의 입력/출력 데이터를 받아 무엇이 잘못되었는지 이해

이것은 워크플로우 디버깅에 특히 유용합니다 - AI에게 "2단계의 오류를 수정해"라고 말하면 정확히 어떤 입력이 실패를 일으켰는지 볼 수 있습니다.

**요청 기록:**

워크플로우를 재생성할 때 (미리보기에서 "아니오" 클릭), 세션의 모든 이전 요청이 AI에 전달됩니다. 이를 통해 AI가 여러 반복에 걸친 수정의 전체 컨텍스트를 이해할 수 있습니다.

**수동 워크플로우 편집:**

드래그 앤 드롭 인터페이스로 비주얼 노드 편집기에서 직접 워크플로우를 편집합니다.

![Manual Workflow Editing](docs/images/modify_workflow_manual.png)

**파일에서 다시 로드:**
- 드롭다운에서 **Reload from file**을 선택하여 markdown 파일에서 워크플로우 다시 가져오기

## 요구 사항

- Obsidian v0.15.0+
- Google AI API 키 또는 CLI 도구 (Gemini CLI / Claude CLI / Codex CLI)
- 데스크톱 및 모바일 지원 (CLI 모드: 데스크톱만)

## 개인정보 보호

**로컬에 저장되는 데이터:**
- API 키 (Obsidian 설정에 저장)
- 채팅 기록 (Markdown 파일, 선택적으로 암호화)
- 워크플로우 실행 기록 (선택적으로 암호화)
- 암호화 키 (개인 키는 비밀번호로 암호화)

**Google로 전송되는 데이터:**
- 모든 채팅 메시지와 파일 첨부는 처리를 위해 Google Gemini API로 전송됩니다
- RAG가 활성화되면 vault 파일이 Google File Search에 업로드됩니다
- Web Search가 활성화되면 쿼리가 Google Search로 전송됩니다

**타사 서비스로 전송되는 데이터:**
- 워크플로우 `http` 노드는 워크플로우에 지정된 모든 URL로 데이터를 전송할 수 있습니다

**CLI 제공자 (선택 사항):**
- CLI 모드가 활성화되면 외부 CLI 도구 (gemini, claude, codex)가 child_process를 통해 실행됩니다
- 이는 사용자가 명시적으로 구성하고 확인한 경우에만 발생합니다
- CLI 모드는 데스크톱 전용입니다 (모바일에서 사용 불가)

**MCP 서버 (선택 사항):**
- MCP (Model Context Protocol) 서버는 워크플로우 `mcp` 노드에 대해 플러그인 설정에서 구성할 수 있습니다
- MCP 서버는 추가 도구와 기능을 제공하는 외부 서비스입니다

**보안 참고:**
- 워크플로우 실행 전 검토하세요 - `http` 노드가 vault 데이터를 외부 엔드포인트로 전송할 수 있습니다
- 워크플로우 `note` 노드는 파일 쓰기 전 확인 대화상자를 표시합니다 (기본 동작)
- `confirmEdits: false`가 설정된 슬래시 명령어는 Apply/Discard 버튼 없이 파일 편집을 자동 적용합니다
- 민감한 자격 증명: API 키나 토큰을 워크플로우 YAML에 직접 저장하지 마세요 (`http` 헤더, `mcp` 설정 등). 대신 암호화된 파일에 저장하고 `note-read` 노드를 사용하여 런타임에 가져오세요. 워크플로우는 비밀번호 프롬프트로 암호화된 파일을 읽을 수 있습니다.

데이터 보존 정책은 [Google AI 서비스 약관](https://ai.google.dev/terms)을 참조하세요.

## 라이선스

MIT

## 링크

- [Gemini API Docs](https://ai.google.dev/docs)
- [Obsidian Plugin Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## 지원

이 플러그인이 유용하다면 커피 한 잔 사주세요!

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)

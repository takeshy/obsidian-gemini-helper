# Gemini Helper for Obsidian

Google Gemini 기반의 **Chat**, **Workflow 자동화**, **RAG** 기능을 제공하는 **무료 오픈소스** Obsidian AI 어시스턴트입니다.

> **이 플러그인은 완전히 무료입니다.** [ai.google.dev](https://ai.google.dev)에서 Google Gemini API 키(무료 또는 유료)만 있으면 됩니다. 또는 CLI 도구를 사용할 수도 있습니다: [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Claude Code](https://github.com/anthropics/claude-code), [Codex CLI](https://github.com/openai/codex).

## 주요 기능

- **AI Chat** - 스트리밍 응답, 파일 첨부, vault 작업, 슬래시 명령어
- **Workflow Builder** - 비주얼 노드 편집기와 21개 노드 유형으로 다단계 작업 자동화
- **RAG** - vault 전체에서 지능적 검색을 위한 검색 증강 생성
- **Web Search** - Google Search를 통한 최신 정보 접근
- **Image Generation** - Gemini 이미지 모델로 이미지 생성

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

![Chat Interface](chat.png)

## 슬래시 명령어

`/`로 시작하는 재사용 가능한 프롬프트 템플릿을 만들 수 있습니다:

- `{selection}` (선택된 텍스트) 및 `{content}` (활성 노트)로 템플릿 정의
- 명령어별로 모델 및 검색 설정 재정의 가능
- `/`를 입력하면 사용 가능한 명령어 목록 표시

**기본 제공:** `/infographic` - 콘텐츠를 HTML 인포그래픽으로 변환

![Infographic Example](chat_infographic.png)

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

## 안전한 편집

AI가 `propose_edit`을 사용할 때:
1. 확인 대화상자에 제안된 변경 사항이 표시됩니다
2. **Apply**를 클릭하여 파일에 변경 사항 적용
3. **Discard**를 클릭하여 파일 수정 없이 취소

> 변경 사항은 확인하기 전까지 기록되지 않습니다.

## RAG

vault의 지능적 검색을 위한 검색 증강 생성:

- **지원 파일** - Markdown, PDF, 이미지(PNG, JPEG, GIF, WebP)
- **Internal 모드** - vault 파일을 Google File Search에 동기화
- **External 모드** - 기존 store ID 사용
- **증분 동기화** - 변경된 파일만 업로드
- **대상 폴더** - 포함할 폴더 지정
- **제외 패턴** - 파일 제외를 위한 정규식 패턴

![RAG Settings](setting_semantic_search.png)

---

# Workflow Builder

Markdown 파일에서 직접 자동화된 다단계 워크플로우를 구축합니다. **프로그래밍 지식이 필요 없습니다** - 자연어로 원하는 것을 설명하면 AI가 워크플로우를 생성합니다.

![Visual Workflow Editor](visual_workflow.png)

## AI 기반 워크플로우 생성

**YAML 문법이나 노드 유형을 배울 필요가 없습니다.** 일반 언어로 워크플로우를 설명하기만 하면 됩니다:

1. Gemini 사이드바에서 **Workflow** 탭 열기
2. 드롭다운에서 **+ New (AI)** 선택
3. 원하는 것을 설명: *"선택한 노트를 요약하고 summaries 폴더에 저장하는 워크플로우 만들어줘"*
4. **Generate** 클릭 - AI가 완전한 워크플로우 생성

![Create Workflow with AI](create_workflow_with_ai.png)

**기존 워크플로우도 같은 방식으로 수정:**
1. 아무 워크플로우나 로드
2. **AI Modify** 버튼 클릭
3. 변경 사항 설명: *"요약을 일본어로 번역하는 단계 추가해줘"*
4. 검토 후 적용

![AI Workflow Modification](modify_workflow_with_ai.png)

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

워크플로우 구축에 21개 노드 유형을 사용할 수 있습니다:

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
| 외부 | `mcp` |

> **자세한 노드 사양과 예제는 [WORKFLOW_NODES.md](WORKFLOW_NODES_ko.md)를 참조하세요**

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

![Event Trigger Settings](event_setting.png)

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

![Basic Settings](setting_basic.png)

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
- **Slash Commands** - 사용자 정의 프롬프트 템플릿 정의

![Tool Limit & Slash Commands](setting_tool_limit_slash_command.png)

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
1. 사이드바에서 **Workflow** 탭 열기
2. `workflow` 코드 블록이 있는 파일 열기
3. 드롭다운에서 워크플로우 선택
4. **Run**을 클릭하여 실행
5. **History**를 클릭하여 과거 실행 보기

![Workflow History](workflow_history.png)

**Canvas로 내보내기:** 실행 기록을 Obsidian Canvas로 보고 시각적으로 분석할 수 있습니다.

![History Canvas View](history_canvas.png)

### AI 워크플로우 생성

**AI로 새 워크플로우 생성:**
1. 워크플로우 드롭다운에서 **+ New (AI)** 선택
2. 워크플로우 이름과 출력 경로 입력 (`{{name}}` 변수 지원)
3. 자연어로 워크플로우가 해야 할 일 설명
4. 모델 선택 후 **Generate** 클릭
5. 워크플로우가 자동으로 생성되고 저장됨

**AI로 기존 워크플로우 수정:**
1. 기존 워크플로우 로드
2. **AI Modify** 버튼 (반짝이 아이콘) 클릭
3. 원하는 변경 사항 설명
4. 변경 전/후 비교 검토
5. **Apply Changes**를 클릭하여 업데이트

![AI Workflow Modification](modify_workflow_with_ai.png)

**수동 워크플로우 편집:**

드래그 앤 드롭 인터페이스로 비주얼 노드 편집기에서 직접 워크플로우를 편집합니다.

![Manual Workflow Editing](modify_workflow_manual.png)

**파일에서 다시 로드:**
- 드롭다운에서 **Reload from file**을 선택하여 markdown 파일에서 워크플로우 다시 가져오기

## 요구 사항

- Obsidian v0.15.0+
- Google AI API 키 또는 CLI 도구 (Gemini CLI / Claude CLI / Codex CLI)
- 데스크톱 및 모바일 지원 (CLI 모드: 데스크톱만)

## 개인정보 보호

**로컬에 저장되는 데이터:**
- API 키 (Obsidian 설정에 저장)
- 채팅 기록 (Markdown 파일로)
- 워크플로우 실행 기록

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

**보안 참고:**
- 워크플로우 실행 전 검토하세요 - `http` 노드가 vault 데이터를 외부 엔드포인트로 전송할 수 있습니다
- 워크플로우 `note` 노드는 파일 쓰기 전 확인 대화상자를 표시합니다 (기본 동작)
- `confirmEdits: false`가 설정된 슬래시 명령어는 Apply/Discard 버튼 없이 파일 편집을 자동 적용합니다

데이터 보존 정책은 [Google AI 서비스 약관](https://ai.google.dev/terms)을 참조하세요.

## 라이선스

MIT

## 링크

- [Gemini API Docs](https://ai.google.dev/docs)
- [Obsidian Plugin Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)

## 지원

이 플러그인이 유용하다면 커피 한 잔 사주세요!

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buymeacoffee)](https://buymeacoffee.com/takeshy)

# 에이전트 스킬

에이전트 스킬은 맞춤 지시, 참조 자료, 실행 가능한 워크플로우를 제공하여 AI의 기능을 확장합니다. 스킬은 [OpenAI Codex](https://github.com/openai/codex) 등의 도구에서 사용하는 업계 표준 패턴을 따릅니다.

## 내장 스킬

플러그인에는 [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)를 기반으로 한 세 가지 내장 스킬이 포함되어 있으며, AI에게 Obsidian 전용 파일 형식을 가르칩니다. 보관함 설정이 필요 없으며 즉시 사용할 수 있습니다.

| 스킬 | 설명 | 기본값 |
|------|------|--------|
| **obsidian-markdown** | Obsidian Flavored Markdown: 위키링크 `[[]]`, 콜아웃 `> [!note]`, 임베드 `![[]]`, 속성(프론트매터), 태그, 하이라이트, 댓글 | ON |
| **json-canvas** | JSON Canvas 파일 (`.canvas`): 노드, 엣지, 그룹, 색상, 레이아웃 | OFF |
| **obsidian-bases** | Obsidian Bases 파일 (`.base`): 필터, 수식, 뷰(테이블/카드/리스트/맵), 요약 | OFF |

내장 스킬은 스킬 선택기 드롭다운에 **built-in** 배지와 함께 표시됩니다. 다른 스킬과 마찬가지로 켜거나 끌 수 있습니다. 활성화된 스킬 칩에 마우스를 올리면 설명을 볼 수 있습니다.

**obsidian-markdown**이 활성화된 경우(기본값), AI는 표준 Markdown 링크 대신 위키링크를 사용하고, 콜아웃을 올바르게 포맷하며, 노트를 생성하거나 편집할 때 Obsidian의 프론트매터 규칙을 따릅니다.

## 사용자 정의 스킬

### 폴더 구조

스킬은 보관함 내 설정 가능한 폴더에 저장됩니다 (기본값: `skills/`). 각 스킬은 `SKILL.md` 파일을 포함하는 하위 폴더입니다:

```
skills/
├── code-review/
│   ├── SKILL.md            # 스킬 정의 (필수)
│   ├── references/          # 참조 문서 (선택)
│   │   ├── style-guide.md
│   │   └── checklist.md
│   └── workflows/           # 실행 가능한 워크플로우 (선택)
│       └── run-lint.md
├── meeting-notes/
│   ├── SKILL.md
│   └── references/
│       └── template.md
```

## SKILL.md 형식

각 `SKILL.md` 파일은 메타데이터를 위한 YAML 프론트매터와 지시사항을 위한 마크다운 본문으로 구성됩니다:

```markdown
---
name: Code Review
description: Reviews code blocks in notes for quality and best practices
workflows:
  - path: workflows/run-lint.md
    description: Run linting on the current note
---

You are a code review assistant. When reviewing code:

1. Check for common bugs and anti-patterns
2. Suggest improvements for readability
3. Verify error handling is adequate
4. Reference the style guide for formatting rules
```

### 프론트매터 필드

| 필드 | 필수 | 설명 |
|------|------|------|
| `name` | 아니오 | 스킬의 표시 이름. 기본값은 폴더 이름 |
| `description` | 아니오 | 스킬 선택기에 표시되는 짧은 설명 |
| `workflows` | 아니오 | 워크플로우 참조 목록 (아래 참조) |

### 워크플로우 참조

프론트매터에 선언된 워크플로우는 AI가 호출할 수 있는 Function Calling 도구로 등록됩니다:

```yaml
workflows:
  - path: workflows/run-lint.md
    name: lint              # 선택적 사용자 지정 ID (기본값은 경로 기반 ID)
    description: Run linting on the current note
```

`workflows/` 하위 디렉토리의 워크플로우는 프론트매터 선언 없이도 자동으로 검색됩니다. 자동 검색된 워크플로우는 파일 기본 이름을 설명으로 사용합니다.

## 참조 자료

`references/` 하위 폴더에 참조 문서를 배치하세요. 스킬이 활성화되면 이 문서들이 자동으로 로드되어 AI의 컨텍스트에 포함됩니다. 다음 용도로 사용하세요:

- 스타일 가이드 및 코딩 표준
- 템플릿 및 예제
- 체크리스트 및 절차
- 도메인별 지식

## 워크플로우

스킬 워크플로우는 [Workflow Builder](../README_ko.md#workflow-builder)와 동일한 형식을 사용합니다. `workflows/` 하위 폴더에 워크플로우 마크다운 파일을 배치하세요:

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

워크플로우가 있는 스킬이 활성화되면, AI는 이 워크플로우를 실행할 수 있는 `run_skill_workflow` 도구를 받습니다. 워크플로우 ID 형식은 `skillName/workflowName`입니다 (예: `Code Review/workflows_run-lint`).

### 인터랙티브 실행

스킬 워크플로우는 인터랙티브 모달로 실행됩니다 (워크플로우 패널과 동일):

- 실시간 상태를 표시하는 실행 진행 모달이 표시됩니다
- 대화형 프롬프트 (`dialog`, `prompt-file`, `prompt-selection`)가 사용자에게 표시됩니다
- 확인 대화상자는 사용자의 승인이 필요합니다
- AI는 워크플로우 실행 로그를 도구 결과로 받습니다

### 채팅으로 값 반환하기

AI가 `run_skill_workflow`를 통해 스킬 워크플로우를 호출하면 **이름이 `_`로 시작하지 않는 모든 변수는 자동으로 도구 결과의 일부로 채팅 AI에 반환됩니다**. 결과를 "출력"하기 위해 마지막에 `command` 노드를 추가할 필요가 없습니다 — 채팅 AI가 볼 값을 `saveTo:`로 저장하기만 하면 됩니다.

`command` 노드는 워크플로우 *내부*에서 별도의 LLM 호출을 실행하고 그 출력을 변수에 저장합니다. 채팅에 직접 쓰지 않습니다. 사용자가 특정 변수를 채팅 응답에 그대로 표시하길 원한다면 해당 지침을 SKILL.md 지침 본문에 작성하세요. 예:

> 워크플로우가 완료되면 `ogpMarkdown`의 값을 추가 설명 없이 사용자에게 그대로 출력하세요.

채팅 측 AI는 이러한 지침을 따라 해당 변수를 응답에 포함합니다.

### 오류 복구

채팅 중 스킬 워크플로우가 실패하면 실패한 도구 호출에 **워크플로우 열기** 버튼이 표시됩니다. 클릭하면 워크플로우 파일이 열리고 Gemini 뷰가 Workflow / skill 탭으로 전환되어 흐름을 편집하고 다시 실행할 수 있습니다. 아래의 힌트 라인은 실패한 단계에 대해 "AI로 워크플로우 수정" → "실행 이력 참조"로 이동할 수 있는 경로도 안내합니다.

## 채팅에서 스킬 사용하기

### 설정

내장 스킬은 별도 설정 없이 바로 사용할 수 있습니다. 사용자 정의 스킬을 추가하려면 보관함 루트에 `skills` 폴더를 생성하세요.

### 스킬 활성화

스킬이 사용 가능하면 채팅 입력 영역에 표시됩니다:

1. 스킬 칩 영역 옆의 **+** 버튼을 클릭합니다
2. 드롭다운에서 활성화할 스킬을 선택합니다
3. 활성화된 스킬은 칩으로 표시되며, **x**를 클릭하여 제거할 수 있습니다

스킬이 활성화되면:

- 스킬 지시사항과 참조 자료가 시스템 프롬프트에 주입됩니다
- 스킬에 워크플로우가 있으면 `run_skill_workflow` 도구가 사용 가능해집니다
- 어시스턴트 메시지에 사용된 스킬이 표시됩니다

### 슬래시 명령어

채팅 입력에 `/folder-name`을 입력하여 스킬을 직접 호출할 수 있습니다:

- **`/folder-name`** — 스킬을 활성화하고 즉시 전송합니다. AI가 스킬의 지침과 워크플로를 적극적으로 사용합니다.
- **`/folder-name 메시지`** — 스킬을 활성화하고 "메시지"를 함께 전송합니다.
- `/`를 입력하면 자동완성에 사용 가능한 스킬이 표시됩니다. 선택하면 즉시 전송됩니다.

명령어에는 스킬 표시 이름이 아닌 폴더 이름을 사용합니다 — 예: `skills/weekly-report/`에 있는 스킬은 `/weekly-report`로 호출합니다.

### 예제: 스킬 만들기

1. 폴더를 생성합니다: `skills/summarizer/`
2. `skills/summarizer/SKILL.md`를 생성합니다:

```markdown
---
name: Summarizer
description: Summarizes notes in bullet-point format
---

When asked to summarize, follow these rules:

- Use concise bullet points
- Group related items under headings
- Include key dates and action items
- Keep summaries under 500 words
```

3. 채팅을 열고 **+**를 클릭하여 "Summarizer" 스킬을 활성화합니다
4. AI에게 노트 요약을 요청하면 스킬의 지시사항을 따릅니다

## 스킬 예제

### 글쓰기 스타일 가이드 (지시 + 참조 자료)

참조 문서를 사용하여 일관된 글쓰기 스타일을 유지하는 스킬.

#### 폴더 구조

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
description: 블로그 게시물의 일관된 톤과 서식을 유지합니다
---

당신은 글쓰기 도우미입니다. 항상 참조 자료의 스타일 가이드를 따르세요.

텍스트를 검토하거나 작성할 때:

1. 스타일 가이드에 명시된 목소리와 톤을 사용하세요
2. 서식 규칙을 따르세요 (제목, 목록, 강조)
3. 어휘 선호도를 적용하세요 (선호하는 단어/피해야 할 단어)
4. 기존 텍스트를 검토할 때 스타일 위반 사항을 지적하세요
```

#### `references/style-guide.md`

```markdown
# 블로그 스타일 가이드

## 목소리와 톤
- 대화체이면서도 전문적으로
- 능동태 선호
- 튜토리얼에서는 2인칭("당신"), 공지사항에서는 1인칭 복수("우리")

## 서식
- 주요 섹션에 H2, 하위 섹션에 H3
- 3개 이상의 항목에는 글머리 기호 목록 사용
- UI 요소와 핵심 용어에 굵게 표시
- 언어 태그가 있는 코드 블록

## 어휘
- 선호: 불필요하게 어려운 표현보다 쉬운 표현 사용
- 피하기: 설명 없는 전문 용어, 수동태 구문, 군더더기 표현("매우", "정말로", "그냥")
```

---

### 일일 저널 (지시 + 워크플로우)

오늘의 항목을 생성하는 워크플로우가 포함된 일일 저널 스킬.

#### 폴더 구조

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
description: 항목 생성 기능이 있는 일일 저널 도우미
workflows:
  - path: workflows/create-entry.md
    description: 템플릿으로 오늘의 저널 항목 생성
---

당신은 저널링 도우미입니다. 사용자가 하루를 되돌아볼 수 있도록 도와주세요.

사용자가 저널 항목 작성을 요청할 때:

1. 먼저 워크플로우를 사용하여 오늘의 노트 파일을 생성하세요
2. 하이라이트, 도전, 배운 점에 대해 물어보세요
3. ## 하이라이트 / ## 도전 / ## 배운 점 구조로 항목을 작성하세요
4. 따뜻하고 격려하는 톤을 유지하세요
5. 사용자가 막혀 있는 것 같으면 성찰 질문을 제안하세요
```

#### `workflows/create-entry.md`

````markdown
```workflow
name: 저널 항목 생성
nodes:
  - id: date
    type: set
    name: today
    value: "{{_date}}"
  - id: create
    type: note
    path: "Journal/{{today}}.md"
    content: |
      # {{today}}

      ## 하이라이트


      ## 도전


      ## 배운 점


      ## 내일
    mode: create
    saveTo: result
  - id: open
    type: open
    path: "Journal/{{today}}.md"
```
````

사용법: 스킬을 활성화하고 "오늘의 저널 항목을 만들어 줘"라고 요청하면, AI가 워크플로우를 호출하여 파일을 생성한 후 내용 작성을 도와줍니다.

---

### 회의록 (지시 + 참조 자료 + 워크플로우)

맞춤 지시, 템플릿 참조 자료, 생성 워크플로우를 결합한 완전한 기능의 스킬.

#### 폴더 구조

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
description: 템플릿과 자동 생성 기능이 있는 구조화된 회의록 작성
workflows:
  - path: workflows/create-meeting.md
    description: 참석자와 안건이 포함된 새 회의록 생성
---

당신은 회의록 도우미입니다. 참조 자료의 템플릿을 따르세요.

회의록 작성을 도울 때:

1. 워크플로우를 사용하여 회의록 파일을 생성하세요
2. 템플릿 구조를 정확히 따르세요
3. 담당자와 마감일이 포함된 액션 아이템을 다음 형식으로 기록하세요: `- [ ] [담당자] 액션 아이템 (마감: YYYY-MM-DD)`
4. 결정 사항을 논의와 분리하여 명확하게 요약하세요
5. 회의 후, 액션 아이템을 작업으로 추출할 것을 제안하세요
```

#### `references/template.md`

```markdown
# 회의록 템플릿

## 필수 섹션

### 헤더
- **제목**: 회의 주제
- **날짜**: YYYY-MM-DD
- **참석자**: 참석자 목록

### 안건
논의 주제의 번호 매긴 목록.

### 노트
안건별로 정리된 논의 세부사항. 하위 제목을 사용하세요.

### 결정 사항
내린 결정의 글머리 기호 목록. 각 항목은 명확하고 실행 가능해야 합니다.

### 액션 아이템
담당자와 마감일이 있는 체크박스 목록:
- [ ] [담당자] 설명 (마감: YYYY-MM-DD)

### 다음 단계
후속 조치 및 해당되는 경우 다음 회의 날짜의 간략한 요약.
```

#### `workflows/create-meeting.md`

````markdown
```workflow
name: 회의록 생성
nodes:
  - id: date
    type: set
    name: today
    value: "{{_date}}"
  - id: gen
    type: command
    prompt: |
      회의록 파일 경로와 초기 내용을 생성하세요.
      오늘 날짜는 {{today}}입니다.
      회의 주제는: {{topic}}
      참석자: {{attendees}}

      JSON 객체만 반환하세요:
      {"path": "Meetings/YYYY-MM-DD Topic.md", "content": "...템플릿을 따르는 마크다운 내용..."}

      템플릿 구조를 사용하세요: 날짜/참석자가 있는 헤더, 안건(주제에서), 빈 노트/결정 사항/액션 아이템/다음 단계 섹션.
    saveTo: generated
  - id: parse
    type: json
    source: generated
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

사용법: 스킬을 활성화하고 "Alice, Bob, Carol과의 디자인 리뷰 회의록을 만들어 줘"라고 말하면, AI가 주제/참석자로 워크플로우를 호출하여 구조화된 노트를 생성하고 엽니다.

---

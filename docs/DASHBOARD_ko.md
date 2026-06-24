# 대시보드

위젯의 반응형 그리드로 나만의 **홈/개요 페이지**를 구성합니다. 대시보드는 `.dashboard` 파일로, **Bases 뷰**, **노트**, **웹 페이지**, **워크플로 출력**을 드래그·리사이즈 가능한 그리드에 배치합니다. 일반 노트처럼 열기만 하면 실시간으로 편집 가능한 보드가 표시됩니다.

![대시보드](images/dashboard.png)

---

## 대시보드 vs Canvas

Obsidian의 **Canvas**와 대시보드는 비슷해 보이지만 해결하는 문제가 다릅니다:

| | 대시보드 | Canvas |
|---|-----------|--------|
| **콘텐츠** | **라이브** — Bases 뷰, 워크플로 출력, 노트가 쿼리 기반으로 자동 업데이트 | **정적** — 카드는 수동으로 배치한 스냅샷 |
| **레이아웃** | 반응형 그리드(12 컬럼; 좁은 화면에서는 단일 열로 재배치) | 절대 좌표의 자유로운 무한 평면 |
| **목적** | 상태 확인을 위해 여는 구조화된 **홈/개요** 페이지 | **사고**의 공간 — 아이디어를 배치하고 화살표로 연결 |
| **AI** | 채팅에서 작성(`dashboard` 스킬이 파일과 기반이 되는 `.base` 데이터를 구축) | 수동 배치 |
| **보기** | 건드려도 흐트러지지 않는 읽기 전용 보기 모드 | 항상 편집 가능 |

요컨대, **대시보드**는 라이브로 한눈에 파악하는 개요(작업, 생성된 요약, 임베드된 페이지)에, **Canvas**는 자유로운 공간적 사고와 관계 설정에 사용하세요. 핵심 트레이드오프는 **동적 vs 정적**과 **반응형 그리드 vs 자유 배치**입니다.

---

## 대시보드 만들기

대시보드를 만드는 방법은 두 가지입니다:

1. **명령** — 명령 팔레트에서 **"Gemini Helper: 대시보드 만들기"** 를 실행합니다. `Dashboards/` 폴더 아래에 새 파일(`Dashboard`, `Dashboard 2`…)을 만들고 엽니다.
2. **AI에 요청** — 플러그인에는 내장 **`dashboard`** 에이전트 스킬이 포함되어 있습니다. 채팅에서 활성화하고 원하는 것을 설명하세요(*"활성 작업, 환영 노트, 오늘의 날씨를 표시하는 홈페이지"*). AI가 `.dashboard` 파일과 필요한 `.base` 파일을 만들어 줍니다.

대시보드는 볼트 내의 일반 `.dashboard` 파일로 저장되므로 다른 노트와 마찬가지로 동기화·버전 관리됩니다.

---

## 편집 모드

각 대시보드는 **보기 모드**로 열립니다. 도구 모음으로 전환합니다:

- **편집** — 편집 모드로 진입: 위젯을 드래그하여 이동, 위젯의 오른쪽 아래 모서리를 드래그하여 리사이즈, **톱니바퀴**로 위젯 구성, **휴지통**으로 삭제합니다.
- **+ 위젯 추가** — 위젯 팔레트를 엽니다(편집 모드 전용).
- **실행 취소 / 다시 실행** — 이 세션에서 수행한 레이아웃 변경을 단계별로 이동합니다.
- **완료** — 보기 모드로 돌아갑니다.

> 모든 편집은 **자동으로 저장**됩니다 — 별도의 저장 버튼은 없습니다.

---

## 위젯 유형

편집 모드에서 **+ 위젯 추가**를 클릭하여 위젯 유형을 선택합니다:

![위젯 추가 팔레트](images/dashboard_widgets.png)

### Base — Bases 뷰 임베드

Obsidian의 **네이티브 Bases UI**(테이블 / 카드 / 리스트 / 지도)를 사용하여 `.base` 파일의 이름이 지정된 뷰를 렌더링합니다. 이것이 기본 데이터 위젯입니다 — 노트의 리스트, 테이블, 카드 뷰에는 직접 구현하지 말고 이것을 사용하세요.

![Base 위젯 설정](images/dashboard_base.png)

| 설정 | 설명 |
|---------|-------------|
| **Base 파일** | `.base` 파일의 볼트 경로 |
| **뷰** | 렌더링할 뷰 이름; 비워 두면 base의 첫 번째 뷰를 사용 |
| **AI로 만들기** | 패널을 벗어나지 않고 새 `.base` 파일을 만들거나 선택한 파일을 편집 |

동일한 `.base` 파일을 여러 Base 위젯에서 참조할 수 있습니다 — 예를 들어 뷰별로 하나씩(Active / Done / Backlog).

### Markdown — 노트 임베드

기존 Markdown 노트를 읽기 전용 임베드로 인라인 렌더링합니다(전체 노트를 여는 링크 포함).

![Markdown 위젯 설정](images/dashboard_markdown.png)

| 설정 | 설명 |
|---------|-------------|
| **Markdown 노트** | 임베드할 노트의 볼트 경로(검색 가능한 선택기) |

### Web Embed — 웹 페이지 임베드

웹 페이지를 iframe에 임베드합니다.

![Web Embed 위젯 설정](images/dashboard_web.png)

| 설정 | 설명 |
|---------|-------------|
| **URL** | 임베드할 페이지 |

> [!NOTE]
> 일부 사이트는 임베드를 차단하는 `X-Frame-Options` / `Content-Security-Policy` 헤더를 보내며 비어 있게 표시됩니다.

### Workflow — 워크플로 출력 렌더링

기존 [워크플로](WORKFLOW_NODES_ko.md)를 **헤드리스**로 실행하고 그 출력을 Markdown 또는 HTML로 렌더링합니다. 이를 통해 동적으로 생성된 콘텐츠(다이제스트, 요약, 보고서)를 대시보드에 배치할 수 있습니다.

![Workflow 위젯 설정](images/dashboard_workflow.png)

| 설정 | 설명 |
|---------|-------------|
| **출력 형식** | `Markdown` 또는 `HTML`(HTML은 샌드박스 iframe에서 렌더링) |
| **Workflow** | 실행할 워크플로 노트 |
| **AI로 만들기** | 이 위젯용으로 새 워크플로를 만들거나 선택한 것을 편집 |
| **출력 변수** | 출력 문자열을 담는 워크플로 변수(기본값 `result`) |
| **실행** | 지금 워크플로를 실행하고 결과를 캐시 |
| **자동 새로 고침 간격(분)** | `0` = 수동 전용; 그 외에는 캐시된 결과가 이보다 오래된 경우 열 때 한 번 실행 |

> [!IMPORTANT]
> **워크플로 위젯은 실시간이 아니라 캐시에서 렌더링합니다.** 보드를 열 때마다 무거운 워크플로를 다시 실행하지 않도록, 렌더링 경로는 **캐시된 결과만** 읽습니다. 실행은 다음 경우에만 발생합니다:
> - **실행**을 클릭할 때(위젯 헤더 또는 설정 패널), 또는
> - 대시보드를 열고 캐시된 결과가 자동 새로 고침 간격보다 오래되었을 때.
>
> 결과는 대시보드 옆의 숨겨진 **사이드카 파일**에 저장되므로, `.dashboard` 파일을 비대하게 만들지 않고도 다시 열 때 출력이 유지됩니다. 워크플로는 Markdown/HTML 출력을 문자열 변수(기본값 `result`)에 저장해야 합니다 — 카드/테이블 출력은 지원되지 않습니다. 무인으로 실행되므로 워크플로는 대화형 노드(`prompt-*`, `dialog`)를 사용할 수 없습니다.

### Kanban — 카드를 드래그하여 상태 변경

**태그** 및/또는 **폴더** 필터에 일치하는 노트를 frontmatter의 **상태 속성**에 따라 열로 그룹화한 카드로 렌더링합니다. 카드를 다른 열로 드래그하면 해당 노트의 상태가 업데이트됩니다(`processFrontMatter`로 기록). 카드를 클릭하면 대화 상자에서 노트를 미리 볼 수 있으며, 대화 상자의 열기 아이콘으로 새 탭에서 노트를 엽니다. 보드는 **보기 모드**에서 상호작용할 수 있으며, 카드를 옮기기 위해 편집 모드로 들어갈 필요가 없습니다.

![Kanban 보드](images/dashboard_kanban.png)

보드 헤더에는 선택적 **제목**(하나의 대시보드에 여러 보드를 둘 때 유용)과 **새로 만들기** 버튼이 표시됩니다. 새로 만들기는 카드 제목 입력과 열 선택을 위한 작은 대화 상자를 열고, 이 보드의 필터에 이미 일치하는 노트를 만듭니다 — 구성된 폴더에 배치하고, 구성된 태그를 달고, 선택한 열의 상태로 설정합니다. 새 카드는 보드에 표시되며(대시보드에 머무름), 노트를 열고 싶을 때 클릭합니다.

편집 모드의 위젯 설정에서 보드를 구성합니다:

![Kanban 설정](images/dashboard_kanban_edit.png)

| 설정 | 설명 |
|---------|-------------|
| **보드 제목** | 보드 헤더에 표시됩니다. 여러 보드가 대시보드를 공유할 때 유용합니다. |
| **태그 필터** | 이 태그가 있는 노트만 표시(`#` 제외). 비어 있으면 모든 태그. |
| **폴더 필터** | 경로가 이 접두사로 시작하는 노트만 표시. 비어 있으면 전체 Vault. |
| **상태 속성** | 카드의 상태를 담는 frontmatter 속성(기본값 `status`). |
| **제목 속성** | 카드 제목으로 표시할 frontmatter 속성. 비어 있으면 파일 이름. |
| **열** | 상태 값의 순서가 있는 목록. 각 열에는 **값**(속성과 비교)과 **라벨**(헤더에 표시)이 있습니다. |
| **표시 필드** | 각 카드의 제목 아래에 표시할 frontmatter 속성 이름의 순서 있는 목록(예: `priority`, `due`). 각 항목은 `name: value`로 표시되며, 빈 값은 건너뛰고 목록 값은 쉼표로 결합됩니다. |
| **일치하지 않는 카드 열 표시** | 켜면 상태가 어떤 열과도 일치하지 않는 카드가 추가 "미지정" 열에 표시됩니다(기본값 켜짐). |

알 수 없는 위젯 유형(예: 더 새로운 플러그인 버전에서 온 것)은 **저장 시 보존**되고 자리 표시자로 렌더링되므로, 익숙하지 않은 대시보드를 편집해도 데이터가 손실되지 않습니다.

---

## 반응형 레이아웃

그리드에는 컨테이너 너비에 따라 전환되는 두 개의 브레이크포인트가 있습니다:

| 브레이크포인트 | 조건 | 레이아웃 |
|------------|------|--------|
| **`lg`**(넓음) | ≥ 768px | 편집 모드에서 배치한 레이아웃(기본 12열) |
| **`sm`**(좁음) | < 768px | 위젯이 **전체 너비 단일 열**로 재배치되어 위에서 아래로 쌓임 |

기본적으로 `sm` 레이아웃은 넓은 레이아웃에서 **자동으로 도출**됩니다(수직 위치 순). 좁은 화면에서 위젯을 이동하면 그 명시적 `sm` 위치는 유지되고 나머지 위젯이 그 주변의 빈 공간을 채웁니다.

---

## AI로 위젯 만들기

**Base** 위젯과 **Workflow** 위젯 모두 설정 패널에 **AI로 만들기** 버튼이 있습니다:

- **Base** 위젯의 경우 `.base` 파일에 대한 AI 작성 대화 상자를 엽니다. AI는 읽기 전용 도구(읽기, 검색, 목록)로 노트를 검사해 작성 전에 올바른 frontmatter 속성을 찾을 수 있습니다. 예를 들어 커버 이미지가 있는 카드 뷰를 요청할 때 속성 이름을 지정하지 않아도 됩니다. 이미 base가 선택되어 있으면 버튼은 **AI로 편집**으로 바뀝니다. 현재 `.base`와 제안된 내용의 **diff** 및 **추가 지시** 입력란을 보여주어 **적용** 전에 다듬을 수 있습니다.
- **Workflow** 위젯의 경우 위젯에 맞춘 워크플로를 생성(또는 편집)합니다 — AI는 출력 변수에 단일 Markdown/HTML 문자열을 생성하고 대화형 노드를 피하도록 지시받으므로 결과가 헤드리스로 렌더링됩니다. 생성 후 위젯은 **자동으로 실행되고 새로 고쳐집니다**.

채팅에서 내장 **`dashboard`** 에이전트 스킬을 사용하여 전체 대시보드를 작성할 수도 있습니다. 이 스킬은 `.dashboard` 스키마와 Bases 작성 참조를 알고 있습니다.

---

## `.dashboard` 파일 형식

`.dashboard` 파일은 YAML입니다. 일반적으로 직접 편집하지 않지만(비주얼 에디터와 AI가 관리), 참조와 라운드트립 안전성을 위해 스키마를 여기에 문서화합니다.

```yaml
version: 1
grid:
  cols: 12        # column count (default 12)
  rowHeight: 80   # pixels per grid row
  gap: 8          # pixels between cells
widgets:
  - id: <uuid>                            # unique id (UUID-like string)
    type: base | markdown | web | workflow | kanban
    layout:
      lg: { x: 0, y: 0, w: 6, h: 4 }      # required: position on the wide grid
      sm: { x: 0, y: 0, w: 12, h: 4 }     # optional: auto-derived (stacked) if omitted
    config: { ... }                       # per-widget-type config (see below)
```

- **`layout.lg`** 는 넓은(≥768px) 그리드에서의 위치입니다. `x`/`y` 는 0부터 시작하는 왼쪽 상단 셀, `w`/`h` 는 그리드 셀 단위의 너비/높이입니다.
- **`layout.sm`** 은 좁은 화면에서의 위치입니다. 생략하면 그리드 전체 너비로 자동으로 쌓입니다.
- 위젯이 겹치지 않도록 배치하세요; `y` 를 늘려 세로로 쌓습니다.

### 위젯별 `config`

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
  columns:                             # ordered list of status values
    - value: todo
      label: To Do
    - value: in-progress
      label: In Progress
    - value: done
      label: Done
  showUnspecified: true                # show cards with no/unknown status
```

### 전체 예시

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
```

---

## 팁과 참고

- **데이터를 먼저 만드세요.** Base 위젯의 경우 위젯을 향하게 하기 전에 `.base` 파일(과 그 뷰)을 만듭니다. AI 대시보드 스킬은 이를 한 번에 처리합니다.
- **뷰로 그룹화하세요.** 데이터를 복제하지 말고 하나의 `.base`를 여러 Base 위젯(Active / Done / Backlog)에서 재사용하세요.
- **워크플로 위젯을 가볍게 유지하세요.** 결과를 캐시합니다; 열 때마다 실행하는 대신 적절한 **자동 새로 고침 간격**을 설정하고 출력을 `result`에 저장하세요.
- **데스크톱 전용.** 대시보드는(플러그인의 나머지와 마찬가지로) Obsidian 데스크톱에서 작동합니다.
- **파일은 볼트 내에 있습니다.** 대시보드는 `Dashboards/` 아래에 `.dashboard` 파일로 저장되어 노트와 동기화·버전 관리됩니다; 대시보드별 워크플로 캐시는 각 파일 옆의 숨겨진 사이드카 파일에 있습니다.

> 참고: [워크플로 노드](WORKFLOW_NODES_ko.md) · [에이전트 스킬](SKILLS_ko.md)

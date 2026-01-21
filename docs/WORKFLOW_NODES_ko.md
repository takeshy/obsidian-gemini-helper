# 워크플로우 노드 레퍼런스

이 문서는 모든 워크플로우 노드 타입에 대한 상세 사양을 제공합니다. 대부분의 사용자는 **이 세부 사항을 배울 필요가 없습니다** - 원하는 것을 자연어로 설명하면 AI가 워크플로우를 생성하거나 수정해 줍니다.

## 노드 타입 개요

| 카테고리 | 노드 | 설명 |
|----------|-------|-------------|
| 변수 | `variable`, `set` | 변수 선언 및 업데이트 |
| 제어 | `if`, `while` | 조건 분기 및 루프 |
| LLM | `command` | 모델/검색 옵션으로 프롬프트 실행 |
| 데이터 | `http`, `json` | HTTP 요청 및 JSON 파싱 |
| 노트 | `note`, `note-read`, `note-search`, `note-list`, `folder-list`, `open` | 볼트 작업 |
| 파일 | `file-explorer`, `file-save` | 파일 선택 및 저장 (이미지, PDF 등) |
| 프롬프트 | `prompt-file`, `prompt-selection`, `dialog` | 사용자 입력 다이얼로그 |
| 구성 | `workflow` | 다른 워크플로우를 서브 워크플로우로 실행 |
| RAG | `rag-sync` | 노트를 RAG 저장소에 동기화 |
| 외부 | `mcp`, `obsidian-command` | 외부 MCP 서버 또는 Obsidian 명령 호출 |

---

## 워크플로우 옵션

`options` 섹션을 추가하여 워크플로우 동작을 제어할 수 있습니다:

```yaml
name: My Workflow
options:
  showProgress: false  # 실행 진행 모달 숨기기 (기본값: true)
nodes:
  - id: step1
    type: command
    ...
```

| 옵션 | 타입 | 기본값 | 설명 |
|--------|------|---------|-------------|
| `showProgress` | boolean | `true` | 단축키 또는 워크플로우 목록에서 실행 시 진행 모달 표시 |

**참고:** `showProgress` 옵션은 단축키 또는 워크플로우 목록을 통한 실행에만 영향을 줍니다. 비주얼 워크플로우 패널에서는 항상 진행 상황이 표시됩니다.

---

## 노드 레퍼런스

### command

선택적 모델, 검색, Vault 도구 및 MCP 설정으로 LLM 프롬프트를 실행합니다.

```yaml
- id: search
  type: command
  model: gemini-3-flash-preview  # 선택 사항: 특정 모델
  ragSetting: __websearch__      # 선택 사항: __websearch__, __none__, 또는 설정 이름
  vaultTools: all                # 선택 사항: all, noSearch, none
  mcpServers: "server1,server2"  # 선택 사항: 쉼표로 구분된 MCP 서버 이름
  prompt: "Search for {{topic}}"
  saveTo: result
```

| 속성 | 설명 |
|----------|-------------|
| `prompt` | LLM에 보낼 프롬프트 (필수) |
| `model` | 현재 모델 재정의 (사용 가능한 모델은 API 플랜 설정에 따라 다름) |
| `ragSetting` | `__websearch__` (웹 검색), `__none__` (검색 없음), RAG 설정 이름, 또는 현재 설정 사용시 생략 |
| `vaultTools` | Vault 도구 모드: `all` (검색 + 읽기/쓰기), `noSearch` (읽기/쓰기만), `none` (비활성화). 기본값: `all` |
| `mcpServers` | 활성화할 MCP 서버 이름 (쉼표로 구분, 플러그인 설정에서 구성되어 있어야 함) |
| `attachments` | FileExplorerData를 포함하는 변수 이름들 (쉼표로 구분, `file-explorer` 노드에서 가져옴) |
| `saveTo` | 텍스트 응답을 저장할 변수 이름 |
| `saveImageTo` | 생성된 이미지를 저장할 변수 이름 (FileExplorerData 형식, 이미지 모델용) |

**이미지 생성 예시**:
```yaml
- id: generate
  type: command
  prompt: "Generate a cute cat illustration"
  model: gemini-3-pro-image-preview
  saveImageTo: generatedImage
- id: save-image
  type: note
  path: "images/cat"
  content: "![cat](data:{{generatedImage.mimeType}};base64,{{generatedImage.data}})"
```

**CLI 모델:**

플러그인 설정에서 CLI가 구성된 경우 워크플로우에서 CLI 모델(`gemini-cli`, `claude-cli`, `codex-cli`)을 사용할 수 있습니다. CLI 모델은 API 비용 없이 플래그십 모델에 액세스하는 데 유용합니다.

```yaml
- id: analyze
  type: command
  model: claude-cli
  prompt: "이 코드를 분석해주세요:\n\n{{code}}"
  saveTo: analysis
```

> **참고:** CLI 모델은 RAG, 웹 검색, 이미지 생성을 지원하지 않습니다. CLI 모델에서는 `ragSetting`과 `saveImageTo` 속성이 무시됩니다.

### note

노트 파일에 콘텐츠를 작성합니다.

```yaml
- id: save
  type: note
  path: "output/{{filename}}.md"
  content: "{{result}}"
  mode: overwrite
  confirm: true
```

| 속성 | 설명 |
|----------|-------------|
| `path` | 파일 경로 (필수) |
| `content` | 작성할 콘텐츠 |
| `mode` | `overwrite` (기본값), `append`, 또는 `create` (이미 존재하면 건너뛰기) |
| `confirm` | `true` (기본값)는 확인 다이얼로그 표시, `false`는 즉시 작성 |
| `history` | `true` (기본값, 전역 설정 따름) 편집 기록에 저장, `false`는 이 쓰기에 대한 기록 비활성화 |

### note-read

노트 파일에서 콘텐츠를 읽습니다.

```yaml
- id: read
  type: note-read
  path: "notes/config.md"
  saveTo: content
```

| 속성 | 설명 |
|----------|-------------|
| `path` | 읽을 파일 경로 (필수) |
| `saveTo` | 파일 콘텐츠를 저장할 변수 이름 (필수) |

**암호화된 파일 지원:**

대상 파일이 암호화되어 있으면 (플러그인의 암호화 기능을 통해), 워크플로우가 자동으로:
1. 현재 세션에서 비밀번호가 캐시되어 있는지 확인
2. 캐시되어 있지 않으면 사용자에게 비밀번호 입력 요청
3. 파일 콘텐츠를 복호화하고 변수에 저장
4. 이후 읽기를 위해 비밀번호 캐시 (동일 Obsidian 세션 내)

비밀번호를 한 번 입력하면 Obsidian을 재시작할 때까지 다른 암호화된 파일 읽기 시 다시 입력할 필요가 없습니다.

**예시: 암호화된 파일에서 API 키를 읽고 외부 API 호출**

이 워크플로우는 암호화된 파일에 저장된 API 키를 읽고, 외부 API를 호출하고, 결과를 표시합니다:

```yaml
name: 암호화된 키로 API 호출
nodes:
  - id: read-key
    type: note-read
    path: "secrets/api-key.md"
    saveTo: apiKey
    next: call-api

  - id: call-api
    type: http
    url: "https://api.example.com/data"
    method: GET
    headers: '{"Authorization": "Bearer {{apiKey}}"}'
    saveTo: response
    next: show-result

  - id: show-result
    type: dialog
    title: API 응답
    message: "{{response}}"
    markdown: true
    button1: OK
```

> **팁:** API 키와 같은 민감한 데이터는 암호화된 파일에 저장하세요. 명령 팔레트에서 "파일 암호화" 명령을 사용하여 비밀을 포함하는 파일을 암호화할 수 있습니다.

### note-list

필터링 및 정렬로 노트를 나열합니다.

```yaml
- id: list
  type: note-list
  folder: "Projects"
  recursive: true
  tags: "todo, project"
  tagMatch: all
  createdWithin: "7d"
  modifiedWithin: "24h"
  sortBy: modified
  sortOrder: desc
  limit: 20
  saveTo: noteList
```

| 속성 | 설명 |
|----------|-------------|
| `folder` | 폴더 경로 (전체 볼트는 비워둠) |
| `recursive` | `true`는 하위 폴더 포함, `false` (기본값)는 직접 하위 항목만 |
| `tags` | 필터링할 태그 (쉼표로 구분, `#` 포함 또는 제외) |
| `tagMatch` | `any` (기본값) 또는 `all` 태그 일치 필요 |
| `createdWithin` | 생성 시간으로 필터링: `30m`, `24h`, `7d` |
| `modifiedWithin` | 수정 시간으로 필터링 |
| `sortBy` | `created`, `modified`, 또는 `name` |
| `sortOrder` | `asc` 또는 `desc` (기본값) |
| `limit` | 최대 결과 수 (기본값: 50) |
| `saveTo` | 결과를 저장할 변수 |

**출력 형식:**
```json
{
  "count": 5,
  "totalCount": 12,
  "hasMore": true,
  "notes": [
    {"name": "Note1", "path": "folder/Note1.md", "created": 1234567890, "modified": 1234567900, "tags": ["#todo"]}
  ]
}
```

### note-search

이름 또는 내용으로 노트를 검색합니다.

```yaml
- id: search
  type: note-search
  query: "{{searchTerm}}"
  searchContent: "true"
  limit: "20"
  saveTo: searchResults
```

| 속성 | 설명 |
|------|------|
| `query` | 검색 쿼리 문자열 (필수, `{{variables}}` 지원) |
| `searchContent` | `true`는 파일 내용 검색, `false` (기본값)는 파일 이름만 검색 |
| `limit` | 최대 결과 수 (기본값: 10) |
| `saveTo` | 결과를 저장할 변수 (필수) |

**출력 형식:**
```json
{
  "count": 3,
  "results": [
    {"name": "Note1", "path": "folder/Note1.md", "matchedContent": "...일치 항목 주변 컨텍스트..."}
  ]
}
```

`searchContent`가 `true`일 때, `matchedContent`는 컨텍스트를 위해 일치 항목 전후 약 50자를 포함합니다.

### folder-list

Vault의 폴더를 나열합니다.

```yaml
- id: listFolders
  type: folder-list
  folder: "Projects"
  saveTo: folderList
```

| 속성 | 설명 |
|------|------|
| `folder` | 상위 폴더 경로 (전체 Vault의 경우 비워둠) |
| `saveTo` | 결과를 저장할 변수 (필수) |

**출력 형식:**
```json
{
  "folders": ["Projects/Active", "Projects/Archive", "Projects/Ideas"],
  "count": 3
}
```

폴더는 알파벳순으로 정렬됩니다.

### open

Obsidian에서 파일을 엽니다.

```yaml
- id: openNote
  type: open
  path: "{{outputPath}}"
```

| 속성 | 설명 |
|------|------|
| `path` | 열 파일 경로 (필수, `{{variables}}` 지원) |

경로에 `.md` 확장자가 없으면 자동으로 추가됩니다.

### http

HTTP 요청을 수행합니다.

```yaml
- id: fetch
  type: http
  url: "https://api.example.com/data"
  method: POST
  contentType: json
  headers: '{"Authorization": "Bearer {{token}}"}'
  body: '{"query": "{{searchTerm}}"}'
  saveTo: response
  saveStatus: statusCode
  throwOnError: "true"
```

| 속성 | 설명 |
|----------|-------------|
| `url` | 요청 URL (필수) |
| `method` | `GET` (기본값), `POST`, `PUT`, `PATCH`, `DELETE` |
| `contentType` | `json` (기본값), `form-data`, `text` |
| `headers` | JSON 객체 또는 `Key: Value` 형식 (한 줄에 하나씩) |
| `body` | 요청 본문 (POST/PUT/PATCH용) |
| `saveTo` | 응답 본문을 저장할 변수 |
| `saveStatus` | HTTP 상태 코드를 저장할 변수 |
| `throwOnError` | `true`면 4xx/5xx 응답에서 오류 발생 |

**form-data 예시** (file-explorer를 사용한 바이너리 파일 업로드):

```yaml
- id: select-pdf
  type: file-explorer
  path: "{{__eventFilePath__}}"
  extensions: "pdf,png,jpg"
  saveTo: fileData
- id: upload
  type: http
  url: "https://example.com/upload"
  method: POST
  contentType: form-data
  body: '{"file": "{{fileData}}"}'
  saveTo: response
```

`form-data`의 경우:
- FileExplorerData (`file-explorer` 노드에서 가져옴)는 자동으로 감지되어 바이너리로 전송됩니다
- 텍스트 파일 필드에는 `fieldName:filename` 구문을 사용합니다 (예: `"file:report.html": "{{htmlContent}}"`)

### json

JSON 문자열을 객체로 파싱하여 속성에 접근합니다.

```yaml
- id: parseResponse
  type: json
  source: response
  saveTo: data
```

| 속성 | 설명 |
|------|------|
| `source` | JSON 문자열을 포함하는 변수 이름 (필수) |
| `saveTo` | 파싱된 결과를 저장할 변수 이름 (필수) |

파싱 후 점 표기법을 사용하여 속성에 접근합니다: `{{data.items[0].name}}`

**마크다운 코드 블록의 JSON:**

`json` 노드는 마크다운 코드 블록에서 JSON을 자동으로 추출합니다:

```yaml
# 응답에 다음이 포함된 경우:
# ```json
# {"status": "ok"}
# ```
# json 노드는 JSON 콘텐츠만 추출하고 파싱합니다
- id: parse
  type: json
  source: llmResponse
  saveTo: parsed
```

LLM 응답이 코드 펜스로 JSON을 감싸는 경우에 유용합니다.

### dialog

옵션, 버튼 및/또는 텍스트 입력이 있는 다이얼로그를 표시합니다.

```yaml
- id: ask
  type: dialog
  title: Select Options
  message: Choose items to process
  markdown: true
  options: "Option A, Option B, Option C"
  multiSelect: true
  inputTitle: "Additional notes"
  multiline: true
  defaults: '{"input": "default text", "selected": ["Option A"]}'
  button1: Confirm
  button2: Cancel
  saveTo: dialogResult
```

| 속성 | 설명 |
|----------|-------------|
| `title` | 다이얼로그 제목 |
| `message` | 메시지 내용 (`{{variables}}` 지원) |
| `markdown` | `true`면 메시지를 Markdown으로 렌더링 |
| `options` | 선택 항목 목록 (쉼표로 구분, 선택 사항) |
| `multiSelect` | `true`면 체크박스, `false`면 라디오 버튼 |
| `inputTitle` | 텍스트 입력 필드의 레이블 (설정 시 입력 표시) |
| `multiline` | `true`면 여러 줄 텍스트 영역 |
| `defaults` | `input` 및 `selected` 초기값이 있는 JSON |
| `button1` | 기본 버튼 레이블 (기본값: "OK") |
| `button2` | 보조 버튼 레이블 (선택 사항) |
| `saveTo` | 결과를 저장할 변수 (아래 참조) |

**결과 형식** (`saveTo` 변수):
- `button`: string - 클릭된 버튼 텍스트 (예: "확인", "취소")
- `selected`: string[] - **항상 배열**, 단일 선택이어도 (예: `["옵션 A"]`)
- `input`: string - 텍스트 입력 값 (`inputTitle`이 설정된 경우)

> **중요:** `if` 조건에서 선택된 값을 확인할 때:
> - 단일 옵션의 경우: `{{dialogResult.selected[0]}} == 옵션 A`
> - 배열에 값이 포함되어 있는지 확인 (multiSelect): `{{dialogResult.selected}} contains 옵션 A`
> - 잘못된 방법: `{{dialogResult.selected}} == 옵션 A` (배열과 문자열 비교, 항상 false)

**간단한 텍스트 입력:**
```yaml
- id: input
  type: dialog
  title: Enter value
  inputTitle: Your input
  multiline: true
  saveTo: userInput
```

### workflow

다른 워크플로우를 서브 워크플로우로 실행합니다.

```yaml
- id: runSub
  type: workflow
  path: "workflows/summarize.md"
  name: "Summarizer"
  input: '{"text": "{{content}}"}'
  output: '{"result": "summary"}'
  prefix: "sub_"
```

| 속성 | 설명 |
|----------|-------------|
| `path` | 워크플로우 파일 경로 (필수) |
| `name` | 워크플로우 이름 (여러 워크플로우가 있는 파일용) |
| `input` | 서브 워크플로우 변수를 값에 매핑하는 JSON |
| `output` | 부모 변수를 서브 워크플로우 결과에 매핑하는 JSON |
| `prefix` | 모든 출력 변수의 접두사 (`output`이 지정되지 않은 경우) |

### rag-sync

노트를 RAG 저장소에 동기화합니다.

```yaml
- id: sync
  type: rag-sync
  path: "{{fileInfo.path}}"
  ragSetting: "My RAG Store"
  saveTo: syncResult
```

| 속성 | 설명 |
|----------|-------------|
| `path` | 동기화할 노트 경로 (필수, `{{variables}}` 지원) |
| `ragSetting` | RAG 설정 이름 (필수) |
| `saveTo` | 결과를 저장할 변수 (선택 사항) |

**출력 형식:**
```json
{
  "path": "folder/note.md",
  "fileId": "abc123...",
  "ragSetting": "My RAG Store",
  "syncedAt": "2025-01-01T12:00:00.000Z"
}
```

### file-explorer

볼트에서 파일을 선택하거나 새 파일 경로를 입력합니다. 이미지와 PDF를 포함한 모든 파일 유형을 지원합니다.

```yaml
- id: selectImage
  type: file-explorer
  mode: select
  title: "Select an image"
  extensions: "png,jpg,jpeg,gif,webp"
  default: "images/"
  saveTo: imageData
  savePathTo: imagePath
```

| 속성 | 설명 |
|----------|-------------|
| `path` | 직접 파일 경로 - 설정 시 다이얼로그 건너뜀 (`{{variables}}` 지원) |
| `mode` | `select` (기존 파일 선택, 기본값) 또는 `create` (새 경로 입력) |
| `title` | 다이얼로그 제목 |
| `extensions` | 허용되는 확장자 (쉼표로 구분, 예: `pdf,png,jpg`) |
| `default` | 기본 경로 (`{{variables}}` 지원) |
| `saveTo` | FileExplorerData JSON을 저장할 변수 |
| `savePathTo` | 파일 경로만 저장할 변수 |

**FileExplorerData 형식:**
```json
{
  "path": "folder/image.png",
  "basename": "image.png",
  "name": "image",
  "extension": "png",
  "mimeType": "image/png",
  "contentType": "binary",
  "data": "base64-encoded-content"
}
```

**예시: 이미지 분석 (다이얼로그 사용)**
```yaml
- id: selectImage
  type: file-explorer
  title: "Select an image to analyze"
  extensions: "png,jpg,jpeg,gif,webp"
  saveTo: imageData
- id: analyze
  type: command
  prompt: "Describe this image in detail"
  attachments: imageData
  saveTo: analysis
- id: save
  type: note
  path: "analysis/{{imageData.name}}.md"
  content: "# Image Analysis\n\n{{analysis}}"
```

**예시: 이벤트 트리거 (다이얼로그 없음)**
```yaml
- id: loadImage
  type: file-explorer
  path: "{{__eventFilePath__}}"
  saveTo: imageData
- id: analyze
  type: command
  prompt: "Describe this image"
  attachments: imageData
  saveTo: result
```

### file-save

FileExplorerData를 볼트에 파일로 저장합니다. 생성된 이미지나 복사된 파일을 저장하는 데 유용합니다.

```yaml
- id: saveImage
  type: file-save
  source: generatedImage
  path: "images/output"
  savePathTo: savedPath
```

| 속성 | 설명 |
|----------|-------------|
| `source` | FileExplorerData를 포함하는 변수 이름 (필수) |
| `path` | 파일을 저장할 경로 (확장자 누락 시 자동 추가) |
| `savePathTo` | 최종 파일 경로를 저장할 변수 (선택 사항) |

**예시: 이미지 생성 및 저장**
```yaml
- id: generate
  type: command
  prompt: "Generate a landscape image"
  model: gemini-3-pro-image-preview
  saveImageTo: generatedImage
- id: save
  type: file-save
  source: generatedImage
  path: "images/landscape"
  savePathTo: savedPath
- id: showResult
  type: dialog
  title: "Image Saved"
  message: "Image saved to {{savedPath}}"
```

### prompt-file

파일 선택기를 표시하거나 단축키/이벤트 모드에서 활성 파일을 사용합니다.

```yaml
- id: selectFile
  type: prompt-file
  title: Select a note
  default: "notes/"
  forcePrompt: "true"
  saveTo: content
  saveFileTo: fileInfo
```

| 속성 | 설명 |
|----------|-------------|
| `title` | 다이얼로그 제목 |
| `default` | 기본 경로 |
| `forcePrompt` | `true`면 단축키/이벤트 모드에서도 항상 다이얼로그 표시 |
| `saveTo` | 파일 내용을 저장할 변수 |
| `saveFileTo` | 파일 정보 JSON을 저장할 변수 |

**파일 정보 형식:** `{"path": "folder/note.md", "basename": "note.md", "name": "note", "extension": "md"}`

**트리거 모드별 동작:**
| 모드 | 동작 |
|------|----------|
| 패널 | 파일 선택기 다이얼로그 표시 |
| 단축키 | 활성 파일 자동 사용 |
| 이벤트 | 이벤트 파일 자동 사용 |

### prompt-selection

선택된 텍스트를 가져오거나 선택 다이얼로그를 표시합니다.

```yaml
- id: getSelection
  type: prompt-selection
  saveTo: text
  saveSelectionTo: selectionInfo
```

| 속성 | 설명 |
|----------|-------------|
| `saveTo` | 선택된 텍스트를 저장할 변수 |
| `saveSelectionTo` | 선택 메타데이터 JSON을 저장할 변수 |

**선택 정보 형식:** `{"filePath": "...", "startLine": 1, "endLine": 1, "start": 0, "end": 10}`

**트리거 모드별 동작:**
| 모드 | 동작 |
|------|----------|
| 패널 | 선택 다이얼로그 표시 |
| 단축키 (선택 있음) | 현재 선택 사용 |
| 단축키 (선택 없음) | 전체 파일 내용 사용 |
| 이벤트 | 전체 파일 내용 사용 |

### if / while

조건 분기 및 루프.

```yaml
- id: branch
  type: if
  condition: "{{count}} > 10"
  trueNext: handleMany
  falseNext: handleFew

- id: loop
  type: while
  condition: "{{counter}} < {{total}}"
  trueNext: processItem
  falseNext: done
```

| 속성 | 설명 |
|----------|-------------|
| `condition` | 연산자가 있는 표현식: `==`, `!=`, `<`, `>`, `<=`, `>=`, `contains` |
| `trueNext` | 조건이 참일 때의 노드 ID |
| `falseNext` | 조건이 거짓일 때의 노드 ID |

**`contains` 연산자**는 문자열과 배열 모두에서 작동합니다:
- 문자열: `{{text}} contains error` - "error"가 문자열에 있는지 확인
- 배열: `{{dialogResult.selected}} contains 옵션 A` - "옵션 A"가 배열에 있는지 확인

> **역참조 규칙**: `next` 속성은 대상이 `while` 노드인 경우에만 이전 노드를 참조할 수 있습니다. 이는 스파게티 코드를 방지하고 적절한 루프 구조를 보장합니다.

### variable / set

변수를 선언하고 업데이트합니다.

```yaml
- id: init
  type: variable
  name: counter
  value: 0

- id: increment
  type: set
  name: counter
  value: "{{counter}} + 1"
```

**특수 변수 `_clipboard`:**

`_clipboard`라는 이름의 변수를 설정하면 해당 값이 시스템 클립보드에 복사됩니다:

```yaml
- id: copyToClipboard
  type: set
  name: _clipboard
  value: "{{result}}"
```

### mcp

HTTP를 통해 원격 MCP (Model Context Protocol) 서버 도구를 호출합니다.

```yaml
- id: search
  type: mcp
  url: "https://mcp.example.com/v1"
  tool: "web_search"
  args: '{"query": "{{searchTerm}}"}'
  headers: '{"Authorization": "Bearer {{apiKey}}"}'
  saveTo: searchResults
```

| 속성 | 설명 |
|----------|-------------|
| `url` | MCP 서버 엔드포인트 URL (필수, `{{variables}}` 지원) |
| `tool` | MCP 서버에서 호출할 도구 이름 (필수) |
| `args` | 도구 인자가 있는 JSON 객체 (`{{variables}}` 지원) |
| `headers` | HTTP 헤더가 있는 JSON 객체 (예: 인증용) |
| `saveTo` | 결과를 저장할 변수 이름 |

**사용 사례:** RAG 쿼리, 웹 검색, API 통합 등을 위한 원격 MCP 서버 호출.

### obsidian-command

ID로 Obsidian 명령을 실행합니다. 이를 통해 워크플로우가 다른 플러그인의 명령을 포함한 모든 Obsidian 명령을 트리거할 수 있습니다.

```yaml
- id: toggle-fold
  type: obsidian-command
  command: "editor:toggle-fold"
  saveTo: result
```

| 속성 | 설명 |
|----------|-------------|
| `command` | 실행할 명령 ID (필수, `{{variables}}` 지원) |
| `path` | 명령 실행 전에 열 파일 (선택사항, 실행 후 탭 자동 닫힘) |
| `saveTo` | 실행 결과를 저장할 변수 (선택 사항) |

**출력 형식** (`saveTo` 설정 시):
```json
{
  "commandId": "editor:toggle-fold",
  "path": "notes/example.md",
  "executed": true,
  "timestamp": 1704067200000
}
```

**명령 ID 찾기:**
1. Obsidian 설정 → 단축키 열기
2. 원하는 명령 검색
3. 명령 ID가 표시됨 (예: `editor:toggle-fold`, `app:reload`)

**일반적인 명령 ID:**
| 명령 ID | 설명 |
|------------|-------------|
| `editor:toggle-fold` | 커서 위치에서 접기 토글 |
| `editor:fold-all` | 모든 제목 접기 |
| `editor:unfold-all` | 모든 제목 펼치기 |
| `app:reload` | Obsidian 다시 로드 |
| `workspace:close` | 현재 패널 닫기 |
| `file-explorer:reveal-active-file` | 탐색기에서 파일 표시 |

**예시: 플러그인 명령을 사용한 워크플로우**
```yaml
name: 작업 로그 작성
nodes:
  - id: get-content
    type: dialog
    inputTitle: "로그 내용 입력"
    multiline: true
    saveTo: logContent
  - id: copy-to-clipboard
    type: set
    name: "_clipboard"
    value: "{{logContent.input}}"
  - id: write-to-log
    type: obsidian-command
    command: "work-log:write-from-clipboard"
```

**사용 사례:** 워크플로우의 일부로 Obsidian 코어 명령 또는 다른 플러그인의 명령을 트리거.

**예제: 디렉토리의 모든 파일 암호화**

이 워크플로우는 Gemini Helper의 암호화 명령을 사용하여 지정된 폴더의 모든 Markdown 파일을 암호화합니다:

```yaml
name: 폴더-암호화
nodes:
  - id: init-index
    type: variable
    name: index
    value: "0"
  - id: list-files
    type: note-list
    folder: "private"
    recursive: "true"
    saveTo: fileList
  - id: loop
    type: while
    condition: "{{index}} < {{fileList.count}}"
    trueNext: encrypt
    falseNext: done
  - id: encrypt
    type: obsidian-command
    command: "gemini-helper:encrypt-file"
    path: "{{fileList.notes[index].path}}"
  - id: increment
    type: set
    name: index
    value: "{{index}} + 1"
    next: loop
  - id: done
    type: dialog
    title: "완료"
    message: "{{index}}개 파일 암호화됨"
```

> **참고:** `path` 속성은 파일을 열고, 명령을 실행한 후 탭을 자동으로 닫습니다. 이미 열려 있는 파일은 열린 상태로 유지됩니다.

---

**예시: ragujuary를 사용한 RAG 쿼리**

[ragujuary](https://github.com/takeshy/ragujuary)는 MCP 서버 지원이 포함된 Gemini File Search Stores 관리용 CLI 도구입니다.

1. 설치 및 설정:
```bash
go install github.com/takeshy/ragujuary@latest
export GEMINI_API_KEY=your-api-key

# 저장소 생성 및 파일 업로드
ragujuary upload --create -s mystore ./docs

# MCP 서버 시작 (sse가 아닌 --transport http 사용)
ragujuary serve --transport http --port 8080 --serve-api-key mysecretkey
```

2. 워크플로우 예시:
```yaml
name: RAG Search
nodes:
  - id: query
    type: mcp
    url: "http://localhost:8080"
    tool: "query"
    args: '{"store_name": "mystore", "question": "How does authentication work?", "show_citations": true}'
    headers: '{"X-API-Key": "mysecretkey"}'
    saveTo: result
  - id: show
    type: dialog
    title: "Search Result"
    message: "{{result}}"
    markdown: true
    button1: "OK"
```

## 워크플로우 종료

워크플로우를 명시적으로 종료하려면 `next: end`를 사용합니다:

```yaml
- id: save
  type: note
  path: "output.md"
  content: "{{result}}"
  next: end    # 워크플로우가 여기서 종료됩니다

- id: branch
  type: if
  condition: "{{cancel}}"
  trueNext: end      # 참 분기에서 워크플로우 종료
  falseNext: continue
```

## 변수 확장

변수를 참조하려면 `{{variable}}` 구문을 사용합니다:

```yaml
# 기본
path: "{{folder}}/{{filename}}.md"

# 객체/배열 접근
url: "https://api.example.com?lat={{geo.latitude}}"
content: "{{items[0].name}}"

# 중첩 변수 (루프용)
path: "{{parsed.notes[{{counter}}].path}}"
```

### JSON 이스케이프 수정자

`{{variable:json}}`을 사용하여 JSON 문자열에 삽입하기 위해 값을 이스케이프합니다. 이것은 줄바꿈, 따옴표 및 기타 특수 문자를 올바르게 이스케이프합니다.

```yaml
# :json 없이 - 내용에 줄바꿈/따옴표가 있으면 실패
args: '{"text": "{{content}}"}'  # 특수 문자가 있으면 오류

# :json 사용 - 모든 내용에 안전
args: '{"text": "{{content:json}}"}'  # OK - 올바르게 이스케이프됨
```

이것은 파일 내용이나 사용자 입력을 JSON 본문이 있는 `mcp` 또는 `http` 노드에 전달할 때 필수적입니다.

## 스마트 입력 노드

`prompt-selection` 및 `prompt-file` 노드는 실행 컨텍스트를 자동으로 감지합니다:

| 노드 | 패널 모드 | 단축키 모드 | 이벤트 모드 |
|------|------------|-------------|------------|
| `prompt-file` | 파일 선택기 표시 | 활성 파일 사용 | 이벤트 파일 사용 |
| `prompt-selection` | 선택 다이얼로그 표시 | 선택 또는 전체 파일 사용 | 전체 파일 내용 사용 |

---

## 이벤트 트리거

워크플로우는 Obsidian 이벤트에 의해 자동으로 트리거될 수 있습니다.

![이벤트 트리거 설정](event_setting.png)

### 사용 가능한 이벤트

| 이벤트 | 설명 |
|-------|-------------|
| `create` | 파일 생성됨 |
| `modify` | 파일 수정됨/저장됨 (5초 디바운스) |
| `delete` | 파일 삭제됨 |
| `rename` | 파일 이름 변경됨 |
| `file-open` | 파일 열림 |

### 이벤트 변수

이벤트에 의해 트리거되면 다음 변수가 자동으로 설정됩니다:

| 변수 | 설명 |
|----------|-------------|
| `__eventType__` | 이벤트 유형: `create`, `modify`, `delete`, `rename`, `file-open` |
| `__eventFilePath__` | 영향받는 파일의 경로 |
| `__eventFile__` | JSON: `{"path": "...", "basename": "...", "name": "...", "extension": "..."}` |
| `__eventFileContent__` | 파일 내용 (create/modify/file-open 이벤트용) |
| `__eventOldPath__` | 이전 경로 (rename 이벤트 전용) |

### 파일 패턴 구문

글로브 패턴을 사용하여 파일 경로로 이벤트를 필터링합니다:

| 패턴 | 일치 항목 |
|---------|---------|
| `**/*.md` | 모든 폴더의 모든 .md 파일 |
| `journal/*.md` | journal 폴더에 직접 있는 .md 파일 |
| `*.md` | 루트 폴더에만 있는 .md 파일 |
| `**/{daily,weekly}/*.md` | daily 또는 weekly 폴더에 있는 파일 |
| `projects/[a-z]*.md` | 소문자로 시작하는 파일 |
| `docs/**` | docs 폴더 아래의 모든 파일 |

### 이벤트 트리거 워크플로우 예시

````markdown
```workflow
name: Auto-Tag New Notes
nodes:
  - id: getContent
    type: prompt-selection
    saveTo: content
  - id: analyze
    type: command
    prompt: "Suggest 3 tags for this note:\n\n{{content}}"
    saveTo: tags
  - id: prepend
    type: note
    path: "{{__eventFilePath__}}"
    content: "---\ntags: {{tags}}\n---\n\n{{content}}"
    mode: overwrite
    confirm: false
```
````

**설정:** 워크플로우 패널에서 ⚡ 클릭 → "File Created" 활성화 → 패턴 `**/*.md` 설정

---

## 실용적인 예시

### 1. 노트 요약

````markdown
```workflow
name: Note Summary
nodes:
  - id: select
    type: prompt-file
    title: Select note
    saveTo: content
    saveFileTo: fileInfo
  - id: parseFile
    type: json
    source: fileInfo
    saveTo: file
  - id: summarize
    type: command
    prompt: "Summarize this note:\n\n{{content}}"
    saveTo: summary
  - id: save
    type: note
    path: "summaries/{{file.name}}"
    content: "# Summary\n\n{{summary}}\n\n---\n*Source: {{file.path}}*"
    mode: create
```
````

### 2. 웹 리서치

````markdown
```workflow
name: Web Research
nodes:
  - id: topic
    type: dialog
    title: Research topic
    inputTitle: Topic
    saveTo: input
  - id: search
    type: command
    model: gemini-3-flash-preview
    ragSetting: __websearch__
    prompt: |
      Search the web for: {{input.input}}

      Include key facts, recent developments, and sources.
    saveTo: research
  - id: save
    type: note
    path: "research/{{input.input}}.md"
    content: "# {{input.input}}\n\n{{research}}"
    mode: overwrite
```
````

### 3. 조건부 처리

````markdown
```workflow
name: Smart Summarizer
nodes:
  - id: input
    type: dialog
    title: Enter text to process
    inputTitle: Text
    multiline: true
    saveTo: userInput
  - id: branch
    type: if
    condition: "{{userInput.input.length}} > 500"
    trueNext: summarize
    falseNext: enhance
  - id: summarize
    type: command
    prompt: "Summarize this long text:\n\n{{userInput.input}}"
    saveTo: result
    next: save
  - id: enhance
    type: command
    prompt: "Expand and enhance this short text:\n\n{{userInput.input}}"
    saveTo: result
    next: save
  - id: save
    type: note
    path: "processed/output.md"
    content: "{{result}}"
    mode: overwrite
```
````

### 4. 노트 일괄 처리

````markdown
```workflow
name: Tag Analyzer
nodes:
  - id: init
    type: variable
    name: counter
    value: 0
  - id: initReport
    type: variable
    name: report
    value: "# Tag Suggestions\n\n"
  - id: list
    type: note-list
    folder: Clippings
    limit: 5
    saveTo: notes
  - id: json
    type: json
    source: notes
    saveTo: parsed
  - id: loop
    type: while
    condition: "{{counter}} < {{parsed.count}}"
    trueNext: read
    falseNext: finish
  - id: read
    type: note-read
    path: "{{parsed.notes[{{counter}}].path}}"
    saveTo: content
  - id: analyze
    type: command
    prompt: "Suggest 3 tags for:\n\n{{content}}"
    saveTo: tags
  - id: append
    type: set
    name: report
    value: "{{report}}## {{parsed.notes[{{counter}}].name}}\n{{tags}}\n\n"
  - id: increment
    type: set
    name: counter
    value: "{{counter}} + 1"
    next: loop
  - id: finish
    type: note
    path: "reports/tag-suggestions.md"
    content: "{{report}}"
    mode: overwrite
```
````

### 5. API 통합

````markdown
```workflow
name: Weather Report
nodes:
  - id: city
    type: dialog
    title: City name
    inputTitle: City
    saveTo: cityInput
  - id: geocode
    type: http
    url: "https://geocoding-api.open-meteo.com/v1/search?name={{cityInput.input}}&count=1"
    method: GET
    saveTo: geoResponse
  - id: parseGeo
    type: json
    source: geoResponse
    saveTo: geo
  - id: weather
    type: http
    url: "https://api.open-meteo.com/v1/forecast?latitude={{geo.results[0].latitude}}&longitude={{geo.results[0].longitude}}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto"
    method: GET
    saveTo: weatherData
  - id: parse
    type: json
    source: weatherData
    saveTo: data
  - id: report
    type: command
    prompt: "Create a weather report:\n{{data}}"
    saveTo: summary
  - id: save
    type: note
    path: "weather/{{cityInput.input}}.md"
    content: "# Weather: {{cityInput.input}}\n\n{{summary}}"
    mode: overwrite
```
````

### 6. 선택 번역 (단축키 사용)

````markdown
```workflow
name: Translate Selection
nodes:
  - id: getSelection
    type: prompt-selection
    saveTo: text
  - id: translate
    type: command
    prompt: "Translate the following text to English:\n\n{{text}}"
    saveTo: translated
  - id: output
    type: note
    path: "translations/translated.md"
    content: "## Original\n{{text}}\n\n## Translation\n{{translated}}\n\n---\n"
    mode: append
  - id: show
    type: open
    path: "translations/translated.md"
```
````

**단축키 설정:**
1. 워크플로우에 `name:` 필드 추가
2. 워크플로우 파일을 열고 드롭다운에서 워크플로우 선택
3. 워크플로우 패널 하단의 키보드 아이콘 클릭
4. 설정 → 단축키로 이동 → "Workflow: Translate Selection" 검색
5. 단축키 할당 (예: `Ctrl+Shift+T`)

### 7. 서브 워크플로우 구성

**파일: `workflows/translate.md`**
````markdown
```workflow
name: Translator
nodes:
  - id: translate
    type: command
    prompt: "Translate to {{targetLang}}:\n\n{{text}}"
    saveTo: translated
```
````

**파일: `workflows/main.md`**
````markdown
```workflow
name: Multi-Language Export
nodes:
  - id: input
    type: dialog
    title: Enter text to translate
    inputTitle: Text
    multiline: true
    saveTo: userInput
  - id: toJapanese
    type: workflow
    path: "workflows/translate.md"
    name: "Translator"
    input: '{"text": "{{userInput.input}}", "targetLang": "Japanese"}'
    output: '{"japaneseText": "translated"}'
  - id: toSpanish
    type: workflow
    path: "workflows/translate.md"
    name: "Translator"
    input: '{"text": "{{userInput.input}}", "targetLang": "Spanish"}'
    output: '{"spanishText": "translated"}'
  - id: save
    type: note
    path: "translations/output.md"
    content: |
      # Original
      {{userInput.input}}

      ## Japanese
      {{japaneseText}}

      ## Spanish
      {{spanishText}}
    mode: overwrite
```
````

### 8. 대화형 작업 선택

````markdown
```workflow
name: Task Processor
nodes:
  - id: selectTasks
    type: dialog
    title: Select Tasks
    message: Choose which tasks to perform on the current note
    options: "Summarize, Extract key points, Translate to English, Fix grammar"
    multiSelect: true
    button1: Process
    button2: Cancel
    saveTo: selection
  - id: checkCancel
    type: if
    condition: "{{selection.button}} == 'Cancel'"
    trueNext: cancelled
    falseNext: getFile
  - id: getFile
    type: prompt-file
    saveTo: content
  - id: process
    type: command
    prompt: |
      Perform the following tasks on this text:
      Tasks: {{selection.selected}}

      Text:
      {{content}}
    saveTo: result
  - id: save
    type: note
    path: "processed/result.md"
    content: "{{result}}"
    mode: create
    next: end
  - id: cancelled
    type: dialog
    title: Cancelled
    message: Operation was cancelled by user.
    button1: OK
    next: end
```
````

# GemiHub Connection (Google Drive Sync)

Obsidian vault를 Google Drive와 동기화하며, [GemiHub](https://gemihub.online)와 완벽하게 호환됩니다. Obsidian에서 노트를 편집하고 GemiHub의 웹 인터페이스에서 접근하거나, 그 반대로도 가능합니다.

## GemiHub란?

[GemiHub](https://gemihub.online)는 Google Gemini를 Google Drive와 통합된 개인 AI 어시스턴트로 전환하는 웹 애플리케이션입니다.

![GemiHub Interface](images/gemihub_connection/push_pull.png)

### GemiHub 전용 기능

이 기능들은 GemiHub의 웹 인터페이스를 통해서만 사용할 수 있으며, Obsidian 플러그인만으로는 구현할 수 없습니다:

- **Automatic RAG** - GemiHub에 동기화된 파일은 자동으로 시맨틱 검색을 위해 인덱싱됩니다. Obsidian 플러그인의 수동 RAG 동기화와 달리, GemiHub는 매 동기화 시 별도의 설정 없이 파일을 인덱싱합니다.
- **OAuth2 지원 MCP** - OAuth2 인증이 필요한 MCP 서버를 사용할 수 있습니다 (예: Google Calendar, Gmail, Google Docs). Obsidian 플러그인은 헤더 기반 MCP 인증만 지원합니다.
- **Markdown을 PDF/HTML로 변환** - GemiHub에서 직접 Markdown 노트를 포맷된 PDF 또는 HTML 문서로 변환합니다.
- **공개 퍼블리싱** - 변환된 HTML/PDF 문서를 공유 가능한 공개 URL로 게시하여 외부에 노트를 쉽게 공유할 수 있습니다.

### 연결을 통해 Obsidian에 추가되는 기능

Google Drive 동기화를 활성화하면 Obsidian 측에서 다음 기능을 사용할 수 있습니다:

- **Diff 미리보기가 포함된 양방향 동기화** - 변경 사항을 커밋하기 전에 상세한 파일 목록과 Unified Diff 뷰로 파일을 push 및 pull
- **Diff를 통한 충돌 해결** - 양쪽에서 동일한 파일을 편집한 경우, 색상 코드가 적용된 Unified Diff를 보여주는 충돌 모달로 어떤 버전을 유지할지 결정할 수 있습니다
- **Drive 편집 기록** - Obsidian과 GemiHub 양쪽에서의 변경 사항을 추적하며, 파일별 기록 항목에 출처(local/remote)를 표시
- **충돌 백업 관리** - Drive에 저장된 충돌 백업을 탐색, 미리보기, 복원

## 동기화 개요

- **양방향 동기화** - 로컬 변경 사항을 Drive로 push하고, 원격 변경 사항을 Obsidian으로 pull
- **GemiHub 호환** - GemiHub의 동일한 `_sync-meta.json` 형식 및 암호화된 인증 사용
- **충돌 해결** - 양쪽에서 동일한 파일을 편집할 때 충돌을 감지하고 해결
- **선택적 동기화** - 패턴 매칭으로 파일/폴더 제외
- **바이너리 지원** - 이미지, PDF 및 기타 바이너리 파일 동기화

## 사전 요구 사항

Google Drive 동기화가 설정된 [GemiHub](https://gemihub.online) 계정이 필요합니다. 플러그인은 GemiHub의 암호화된 인증 토큰을 사용하여 Google Drive에 연결합니다.

1. GemiHub에 로그인
2. **Settings** → **Obsidian Sync** 섹션으로 이동
3. **Migration Tool token** 복사

![Migration Tool Token](images/gemihub_connection/migration_tool.png)

## 설정

1. Obsidian **Settings** → **Gemini Helper** → **Google Drive sync**로 스크롤
2. **Enable drive sync** 활성화

![Drive 동기화 활성화](images/gemihub_connection/setting_drive_sync.png)

3. GemiHub에서 복사한 **Migration Tool token** 붙여넣기
4. **Setup**을 클릭하여 Google Drive에서 암호화된 인증 정보 가져오기

![Migration Tool Token 설정](images/gemihub_connection/setting_migration_tool_token.png)

5. **비밀번호**를 입력하여 현재 세션의 동기화 잠금 해제

![Drive Sync 잠금 해제](images/gemihub_connection/start_with_sync.png)

> Obsidian을 재시작할 때마다 동기화 세션 잠금을 해제하기 위해 비밀번호를 입력해야 합니다.

## 동기화 작동 방식

### Drive에서의 파일 저장

모든 vault 파일은 Drive의 루트 폴더에 **플랫** 구조로 저장됩니다. Drive에서의 파일 이름은 vault의 전체 경로를 포함합니다:

| Vault 경로 | Drive 파일 이름 |
|---|---|
| `notes.md` | `notes.md` |
| `daily/2024-01-15.md` | `daily/2024-01-15.md` |
| `attachments/image.png` | `attachments/image.png` |

이는 Drive에 하위 폴더가 없음을 의미합니다(`trash/`, `sync_conflicts/`, `__TEMP__/` 등의 시스템 폴더 제외). GemiHub도 동일한 플랫 구조를 사용합니다.

### 동기화 메타데이터

두 개의 메타데이터 파일이 동기화 상태를 추적합니다:

- **`_sync-meta.json`** (Drive에 저장) - GemiHub과 공유됩니다. 모든 동기화된 파일의 파일 ID, 체크섬, 타임스탬프를 포함합니다.
- **`{workspaceFolder}/drive-sync-meta.json`** (로컬) - vault 경로를 Drive 파일 ID에 매핑하고 마지막 동기화된 체크섬을 저장합니다.

### Push

로컬 변경 사항을 Google Drive에 업로드합니다.

1. 모든 vault 파일의 MD5 체크섬 계산
2. 로컬 동기화 메타데이터와 비교하여 변경된 파일 찾기
3. 원격에 보류 중인 변경 사항이 있으면 push 거부 (먼저 pull 필요)
4. 새 파일/수정된 파일을 Drive에 업로드
5. 로컬에서 삭제된 파일을 Drive의 `trash/`로 이동 (소프트 삭제)
6. Drive의 `_sync-meta.json` 업데이트

![Drive로 Push](images/gemihub_connection/push.png)

### Pull

원격 변경 사항을 vault로 다운로드합니다.

1. 원격 `_sync-meta.json` 가져오기
2. 로컬 체크섬을 계산하여 로컬 변경 사항 감지
3. 충돌이 있으면 충돌 해결 모달 표시
4. 로컬에만 있는 파일 삭제 (Obsidian 휴지통으로 이동)
5. 새 파일/수정된 원격 파일을 vault로 다운로드
6. 로컬 동기화 메타데이터 업데이트

![로컬로 Pull](images/gemihub_connection/pull_to_local.png)

### Full Pull

모든 로컬 파일을 원격 버전으로 교체합니다. vault를 Drive와 일치시키려면 이 기능을 사용하세요.

> **경고:** Drive에 없는 로컬 파일은 삭제됩니다 (Obsidian 휴지통으로 이동).

### 충돌 해결

동일한 파일이 로컬과 원격 모두에서 수정된 경우:

- 모든 충돌 파일을 보여주는 모달 표시
- 각 파일에 대해 **Keep local** 또는 **Keep remote** 선택
- 선택되지 않은 버전은 Drive의 `sync_conflicts/`에 백업
- **편집-삭제 충돌** (로컬에서 편집, 원격에서 삭제)은 **Restore (push to drive)** 또는 **Accept delete** 옵션 제공
- 일괄 작업: **Keep all local** / **Keep all remote**

![충돌 해결](images/gemihub_connection/conflict.png)

**Diff**를 클릭하면 로컬과 원격 버전 간의 색상 코드가 적용된 Unified Diff를 볼 수 있습니다:

![충돌 Diff 보기](images/gemihub_connection/conflict_diff.png)

## 데이터 관리

### 휴지통

동기화 중 삭제된 파일은 영구 삭제 대신 Drive의 `trash/` 폴더로 이동됩니다. 설정에서 다음을 수행할 수 있습니다:

- **Restore** - 휴지통에서 루트 폴더로 파일 복원
- **Delete permanently** - Drive에서 파일을 영구적으로 삭제

### 충돌 백업

충돌이 해결되면 선택되지 않은 버전이 Drive의 `sync_conflicts/`에 저장됩니다. 다음을 수행할 수 있습니다:

- **Restore** - 백업을 루트 폴더로 복원 (현재 버전 덮어쓰기)
- **Delete** - 백업을 영구적으로 삭제

![충돌 백업](images/gemihub_connection/conflict_backup.png)

### 임시 파일

GemiHub에서 임시로 저장한 파일은 Drive의 `__TEMP__/`에 저장됩니다. 다음을 수행할 수 있습니다:

- **Apply** - 임시 파일 내용을 해당 Drive 파일에 적용
- **Delete** - 임시 파일 삭제

세 가지 관리 모달 모두 파일 미리보기와 일괄 작업을 지원합니다.

## 설정

| 설정 | 설명 | 기본값 |
|---|---|---|
| **Enable drive sync** | 동기화 기능 토글 | Off |
| **Migration Tool token** | GemiHub 설정(Obsidian Sync 섹션)에서 붙여넣기 | - |
| **Auto sync check** | 주기적으로 원격 변경 사항 확인 및 개수 업데이트 | Off |
| **Sync check interval** | 확인 주기(분) | 5 |
| **Exclude patterns** | 제외할 경로 (줄당 하나, `*` 와일드카드 지원) | `node_modules/` |

## 명령어

명령 팔레트에서 네 가지 명령어를 사용할 수 있습니다:

| 명령어 | 설명 |
|---|---|
| **Drive sync: push to drive** | 로컬 변경 사항을 Drive로 push |
| **Drive sync: pull to local** | 원격 변경 사항을 vault로 pull |
| **Drive sync: full push to drive** | 모든 로컬 파일을 Drive로 push |
| **Drive sync: full pull to local** | 모든 로컬 파일을 원격 버전으로 교체 |

## 제외 파일

다음은 항상 동기화에서 제외됩니다:

- `_sync-meta.json`, `settings.json`
- `history/`, `trash/`, `sync_conflicts/`, `__TEMP__/`, `plugins/`, `.trash/`, `node_modules/`
- Obsidian 설정 디렉토리 (`.obsidian/` 또는 사용자 지정)
- 설정에서 사용자 정의한 제외 패턴

### 제외 패턴 구문

- `folder/` - 폴더와 그 내용 제외
- `*.tmp` - 글로브 패턴 (모든 `.tmp` 파일 매칭)
- `*.log` - 글로브 패턴 (모든 `.log` 파일 매칭)
- `drafts/` - `drafts` 폴더 제외

## 문제 해결

### "Remote has pending changes. Please pull first."

원격 Drive에 아직 pull하지 않은 변경 사항이 있습니다. push하기 전에 **Pull to local**을 실행하세요.

### "Drive sync: no remote data found. Push first."

Drive에 `_sync-meta.json`이 존재하지 않습니다. 동기화를 초기화하려면 **Push to drive**를 실행하세요.

### 비밀번호 잠금 해제 실패

- GemiHub에서 사용하는 것과 동일한 비밀번호를 사용하고 있는지 확인하세요
- GemiHub에서 비밀번호를 변경한 경우, 설정에서 **Reset auth**를 사용하고 새 Migration Tool token으로 다시 설정하세요

### 충돌 모달이 계속 나타남

양쪽 모두에 변경 사항이 있습니다. 각 파일에 대해 로컬 또는 원격을 선택하여 모든 충돌을 해결하세요. 모든 충돌이 해결되면 pull이 자동으로 계속됩니다.

# rawq 통합 구현 가이드

> 버전: v1
> 작성일: 2026-03-21
> 기반 분석: rawq 소스 코드 전체 + tunaDish Sprint 0~6 구현체
> 목적: AI 에이전트가 이 문서만으로 구현을 진행할 수 있도록 구체적 절차 기술

---

## 1. 개요

### 1.1 rawq란

rawq는 Rust로 작성된 코드베이스 컨텍스트 검색 엔진이다.
semantic(임베딩) + lexical(BM25) 하이브리드 검색을 수행하며,
tree-sitter AST 기반 코드 청킹, GPU 가속 ONNX 임베딩, 증분 인덱싱을 지원한다.
단일 바이너리(`rawq`)로 CLI 또는 데몬 모드로 동작한다.

### 1.2 통합 목표

tunaDish에서 AI 에이전트와 대화할 때, 현재 프로젝트 코드베이스에서
관련 코드를 자동으로 검색하여 에이전트에 컨텍스트로 주입한다.
사용자가 직접 ContextPanel에서 코드를 검색할 수도 있다.

### 1.3 통합 원칙

- **opt-in**: rawq 미설치 시 기존 동작을 그대로 유지한다.
- **tunapi 수정 금지**: 모든 변경은 tunadish transport 내부에서만 한다.
- **subprocess 호출**: rawq를 라이브러리가 아닌 CLI 바이너리로 호출한다 (Rust ↔ Python FFI 없음).
- **실패 허용**: rawq 호출 실패 시 원본 메시지만 전달하고 에러를 로그에만 남긴다.

---

## 2. 구현 단계 요약

| 단계 | 내용 | 변경 범위 | 선행 조건 |
|------|------|----------|----------|
| **Step 0** | rawq 가용성 탐지 모듈 | transport 신규 파일 | 없음 |
| **Step 1** | 프로젝트 선택 시 자동 인덱싱 | backend.py | Step 0 |
| **Step 2** | chat.send 컨텍스트 주입 | backend.py | Step 1 |
| **Step 3** | code.search JSON-RPC 메서드 | backend.py + wsClient.ts + contextStore.ts | Step 1 |
| **Step 4** | ContextPanel 코드 검색 탭 UI | 프론트엔드 컴포넌트 | Step 3 |
| **Step 5** | rawq map 기반 구조 뷰 | 프론트엔드 컴포넌트 | Step 0 |

---

## 3. Step 0 — rawq 가용성 탐지 모듈

### 3.1 신규 파일 생성

**파일**: `transport/src/tunadish_transport/rawq_bridge.py`

이 모듈은 rawq CLI와의 모든 상호작용을 캡슐화한다.
다른 모듈에서는 rawq 바이너리를 직접 호출하지 않는다.

### 3.2 구현 명세

```python
"""rawq CLI 브릿지 — rawq 바이너리 호출을 캡슐화."""

import json
import logging
import shutil
from pathlib import Path
from typing import Any

import anyio

logger = logging.getLogger(__name__)

# rawq search 기본 옵션
_DEFAULT_TOP = 5
_DEFAULT_TOKEN_BUDGET = 2000
_DEFAULT_THRESHOLD = 0.5
_DEFAULT_CONTEXT_LINES = 3
_TIMEOUT_SECONDS = 10  # rawq 호출 타임아웃


def is_available() -> bool:
    """rawq 바이너리가 PATH에 존재하는지 확인."""
    return shutil.which("rawq") is not None


async def check_index(project_path: str | Path) -> dict[str, Any] | None:
    """프로젝트의 rawq 인덱스 상태를 확인.

    Returns:
        인덱스 정보 dict 또는 None(rawq 미설치/인덱스 없음)
    """
    if not is_available():
        return None
    try:
        result = await anyio.run_process(
            ["rawq", "index", "status", str(project_path), "--json"],
            check=False,
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
    except Exception as e:
        logger.debug("rawq index status failed: %s", e)
    return None


async def build_index(project_path: str | Path) -> bool:
    """프로젝트 인덱스를 생성/갱신한다.

    증분 인덱싱이므로 변경된 파일만 재처리된다.

    Returns:
        성공 여부
    """
    if not is_available():
        return False
    try:
        result = await anyio.run_process(
            ["rawq", "index", "build", str(project_path)],
            check=False,
        )
        return result.returncode == 0
    except Exception as e:
        logger.warning("rawq index build failed: %s", e)
        return False


async def search(
    query: str,
    project_path: str | Path,
    *,
    top: int = _DEFAULT_TOP,
    token_budget: int = _DEFAULT_TOKEN_BUDGET,
    threshold: float = _DEFAULT_THRESHOLD,
    context_lines: int = _DEFAULT_CONTEXT_LINES,
    lang_filter: str | None = None,
    exclude: list[str] | None = None,
) -> dict[str, Any] | None:
    """하이브리드 검색을 실행하고 JSON 결과를 반환.

    Returns:
        rawq JSON 출력 dict 또는 None(실패 시)
    """
    if not is_available():
        return None

    cmd = [
        "rawq", "search", query, str(project_path),
        "--top", str(top),
        "--token-budget", str(token_budget),
        "--threshold", str(threshold),
        "--context", str(context_lines),
        "--json",
    ]
    if lang_filter:
        cmd.extend(["--lang", lang_filter])
    for pattern in (exclude or []):
        cmd.extend(["--exclude", pattern])

    try:
        with anyio.fail_after(_TIMEOUT_SECONDS):
            result = await anyio.run_process(cmd, check=False)
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout)
    except TimeoutError:
        logger.warning("rawq search timed out after %ds", _TIMEOUT_SECONDS)
    except Exception as e:
        logger.debug("rawq search failed: %s", e)
    return None


async def get_map(
    project_path: str | Path,
    *,
    depth: int = 2,
    lang_filter: str | None = None,
) -> dict[str, Any] | None:
    """AST 심볼 맵을 반환.

    Returns:
        rawq map JSON 출력 dict 또는 None
    """
    if not is_available():
        return None

    cmd = ["rawq", "map", str(project_path), "--depth", str(depth), "--json"]
    if lang_filter:
        cmd.extend(["--lang", lang_filter])

    try:
        with anyio.fail_after(_TIMEOUT_SECONDS):
            result = await anyio.run_process(cmd, check=False)
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout)
    except TimeoutError:
        logger.warning("rawq map timed out after %ds", _TIMEOUT_SECONDS)
    except Exception as e:
        logger.debug("rawq map failed: %s", e)
    return None


def format_context_block(search_result: dict[str, Any]) -> str:
    """rawq 검색 결과를 에이전트 주입용 마크다운 블록으로 변환.

    Args:
        search_result: rawq search --json 의 출력

    Returns:
        마크다운 문자열. 결과가 없으면 빈 문자열.
    """
    results = search_result.get("results", [])
    if not results:
        return ""

    lines = ["<relevant_code>"]
    for r in results:
        file_path = r.get("file", "unknown")
        line_range = r.get("lines", [])
        lang = r.get("language", "")
        scope = r.get("scope", "")
        confidence = r.get("confidence", 0)
        content = r.get("content", "")

        header = f"## {file_path}"
        if line_range:
            header += f":{line_range[0]}-{line_range[1]}"
        if scope:
            header += f"  ({scope})"
        header += f"  [confidence: {confidence:.2f}]"

        lines.append(header)
        lines.append(f"```{lang}")
        lines.append(content.rstrip())
        lines.append("```")
        lines.append("")

    lines.append("</relevant_code>")
    return "\n".join(lines)
```

### 3.3 주의사항

- `anyio.run_process()`는 tunaDish가 이미 사용 중인 anyio 런타임 위에서 동작한다. 새로운 이벤트 루프를 만들지 않는다.
- `anyio.fail_after()`로 타임아웃을 건다. rawq 데몬 연결 대기(최대 30초)가 발생할 수 있으므로 10초 제한이 필수.
- `check=False`로 호출한다. rawq가 비정상 종료해도 예외를 발생시키지 않는다.
- PATH에서 rawq를 찾으므로 별도 경로 설정이 불필요하다.

---

## 4. Step 1 — 프로젝트 선택 시 자동 인덱싱

### 4.1 변경 파일

**파일**: `transport/src/tunadish_transport/backend.py`

### 4.2 변경 위치

`_ws_handler()` 메서드 내 `method == "project.set"` 분기 (현재 319행 부근):

```python
elif method == "project.set":
    name = params.get("name", "")
    await self._dispatch_rpc_command("project", f"set {name}", params, runtime, transport)
```

### 4.3 변경 내용

`project.set` 처리 직후, 백그라운드로 rawq 인덱싱을 시작한다.

```python
elif method == "project.set":
    name = params.get("name", "")
    await self._dispatch_rpc_command("project", f"set {name}", params, runtime, transport)
    # rawq 인덱싱 트리거 (백그라운드, 실패 무시)
    if self._task_group is not None:
        self._task_group.start_soon(self._rawq_ensure_index, name, runtime, transport)
```

### 4.4 신규 메서드 추가

`TunadishBackend` 클래스에 아래 메서드를 추가한다.

```python
async def _rawq_ensure_index(self, project_name: str, runtime: TransportRuntime, transport: TunadishTransport):
    """프로젝트의 rawq 인덱스를 확보한다 (백그라운드)."""
    from . import rawq_bridge

    if not rawq_bridge.is_available():
        return

    project_path = self._resolve_project_path(project_name, runtime)
    if not project_path:
        return

    # 인덱스 상태 확인
    status = await rawq_bridge.check_index(project_path)
    if status is not None:
        logger.debug("rawq index exists for %s", project_name)
        return  # 증분 갱신은 search 시 자동 처리

    # 인덱스 생성
    logger.info("Building rawq index for %s at %s", project_name, project_path)
    await transport._send_notification("command.result", {
        "command": "rawq",
        "conversation_id": "__system__",
        "text": f"🔍 프로젝트 `{project_name}` 코드 인덱스를 생성합니다...",
    })

    ok = await rawq_bridge.build_index(project_path)

    msg = (
        f"✅ `{project_name}` 인덱스 생성 완료."
        if ok
        else f"⚠️ `{project_name}` 인덱스 생성 실패. rawq 없이 계속합니다."
    )
    await transport._send_notification("command.result", {
        "command": "rawq",
        "conversation_id": "__system__",
        "text": msg,
    })
```

### 4.5 프로젝트 경로 해석 헬퍼

`TunadishBackend` 클래스에 추가:

```python
def _resolve_project_path(self, project_name: str, runtime: TransportRuntime) -> Path | None:
    """프로젝트 이름으로 실제 파일시스템 경로를 해석한다."""
    # 1. tunapi 설정에서 프로젝트 경로 조회
    projects_map = getattr(getattr(runtime, "_projects", None), "projects", {})
    pc = projects_map.get(project_name.lower())
    if pc and pc.path and pc.path.exists():
        return pc.path

    # 2. projects_root 하위에서 탐색
    projects_root = self._get_projects_root()
    if projects_root:
        candidate = Path(projects_root).expanduser() / project_name
        if candidate.exists():
            return candidate

    return None
```

### 4.6 주의사항

- `_rawq_ensure_index`는 `self._task_group.start_soon()`으로 호출한다. WebSocket 핸들러를 블로킹하지 않는다.
- 대형 프로젝트(10만+ 파일)에서 최초 인덱싱에 수분이 걸릴 수 있다. 진행 알림을 `command.result`로 보내 사용자에게 피드백을 준다.
- `__system__` conversation_id는 시스템 알림용 특수값이다. 프론트엔드에서 별도 처리하거나 무시할 수 있다.
- 인덱스가 이미 존재하면 rawq가 증분 갱신을 자동 처리하므로 `build_index`를 매번 호출해도 안전하다.

---

## 5. Step 2 — chat.send 컨텍스트 주입

### 5.1 핵심 원리

사용자 메시지를 AI 에이전트에 보내기 전에, rawq로 프로젝트 코드베이스를 검색하고
관련 코드 스니펫을 메시지에 첨부한다.

### 5.2 변경 파일 및 위치

**파일**: `transport/src/tunadish_transport/backend.py`
**위치**: `_execute_run()` 메서드 (현재 945행), `handle_message()` 호출 직전

### 5.3 변경 내용

`_execute_run()` 내부에서, `IncomingMessage` 생성 전에 rawq 검색을 수행한다:

```python
async def _execute_run(self, conv_id: str, text: str, runtime: TransportRuntime, transport: TunadishTransport):
    # ... (기존 코드: run.status 알림, progress_ref 생성)

    run_base_token = None
    try:
        ambient_ctx = await self.context_store.get_context(conv_id)

        # ── rawq 컨텍스트 주입 (시작) ──
        enriched_text = text
        if ambient_ctx:
            project_name = getattr(ambient_ctx, "project", None)
            if project_name:
                enriched_text = await self._rawq_enrich_message(
                    text, project_name, runtime
                )
        # ── rawq 컨텍스트 주입 (끝) ──

        # ChatPrefs에서 엔진/모델 override 조회
        # ... (기존 코드 그대로)

        incoming = IncomingMessage(
            channel_id=conv_id,
            message_id=progress_ref.message_id if progress_ref else "tmp_id",
            text=enriched_text,  # ← text 대신 enriched_text 사용
        )

        await handle_message(
            # ... (기존 인자 그대로)
        )
    # ... (기존 except/finally 그대로)
```

### 5.4 컨텍스트 주입 메서드

`TunadishBackend` 클래스에 추가:

```python
async def _rawq_enrich_message(
    self,
    text: str,
    project_name: str,
    runtime: TransportRuntime,
) -> str:
    """메시지에 rawq 검색 결과를 컨텍스트로 첨부한다.

    실패 시 원본 텍스트를 그대로 반환한다.
    """
    from . import rawq_bridge

    if not rawq_bridge.is_available():
        return text

    project_path = self._resolve_project_path(project_name, runtime)
    if not project_path:
        return text

    result = await rawq_bridge.search(
        query=text,
        project_path=project_path,
        top=5,
        token_budget=2000,
        threshold=0.5,
    )

    if not result:
        return text

    context_block = rawq_bridge.format_context_block(result)
    if not context_block:
        return text

    # 컨텍스트를 메시지 앞에 첨부
    return f"{context_block}\n\n---\n\n{text}"
```

### 5.5 주의사항

- **메시지 구조 보존**: `enriched_text`는 `IncomingMessage.text`에만 적용한다. 저널(`journal`)에 기록되는 원본 메시지와 WebSocket으로 사용자에게 돌아가는 메시지에는 영향을 주지 않는다. `handle_message()` 내부에서 `incoming.text`를 에이전트에 전달하므로, 이 지점에서 주입하면 에이전트만 컨텍스트를 본다.
- **저널 기록 확인 필요**: tunapi의 `handle_message()`가 `incoming.text`를 저널에 그대로 기록하는지 확인한다. 만약 그렇다면, 저널에 rawq 컨텍스트가 함께 저장되어 히스토리가 비대해질 수 있다. 이 경우 `journal` 기록은 원본 `text`를 사용하도록 분리해야 한다.
- **토큰 예산**: `token_budget=2000`은 Claude 기준 전체 컨텍스트의 약 3%이다. 필요시 `!rawq budget <N>` 커맨드로 사용자가 조절할 수 있도록 한다 (Step 6에서 구현).
- **검색 지연**: rawq search는 인덱스가 있을 때 대부분 8~50ms이나, 데몬 미가동 시 첫 호출에서 최대 30초가 걸릴 수 있다. `_TIMEOUT_SECONDS = 10`으로 제한했으므로 최악의 경우 10초 지연 후 컨텍스트 없이 진행한다.
- **컨텍스트 노이즈**: threshold 0.5 미만 결과는 제외한다. 그래도 관련 없는 코드가 주입될 수 있다. 사용자가 `!rawq off`로 기능을 끌 수 있어야 한다 (Step 6).

---

## 6. Step 3 — code.search JSON-RPC 메서드

### 6.1 백엔드

**파일**: `transport/src/tunadish_transport/backend.py`
**위치**: `_ws_handler()` 메서드, 기존 메서드 라우팅 분기 아래에 추가

```python
elif method == "code.search":
    ws_tg.start_soon(self._handle_code_search, params, runtime, transport)
elif method == "code.map":
    ws_tg.start_soon(self._handle_code_map, params, runtime, transport)
```

신규 핸들러 메서드들:

```python
async def _handle_code_search(self, params: dict[str, Any], runtime: TransportRuntime, transport: TunadishTransport):
    """code.search RPC 처리 — ContextPanel 코드 검색용."""
    from . import rawq_bridge

    query = params.get("query", "")
    project = params.get("project", "")
    lang = params.get("lang")
    top = params.get("top", 10)

    if not query or not project:
        await transport._send_notification("code.search.result", {
            "error": "query and project are required",
        })
        return

    project_path = self._resolve_project_path(project, runtime)
    if not project_path:
        await transport._send_notification("code.search.result", {
            "error": f"Project path not found: {project}",
        })
        return

    result = await rawq_bridge.search(
        query=query,
        project_path=project_path,
        top=top,
        token_budget=8000,  # UI 검색은 더 많은 결과 허용
        threshold=0.3,      # UI에서는 낮은 threshold 허용
        lang_filter=lang,
    )

    await transport._send_notification("code.search.result", {
        "query": query,
        "project": project,
        "available": rawq_bridge.is_available(),
        "results": result.get("results", []) if result else [],
        "query_ms": result.get("query_ms", 0) if result else 0,
        "total_tokens": result.get("total_tokens", 0) if result else 0,
    })


async def _handle_code_map(self, params: dict[str, Any], runtime: TransportRuntime, transport: TunadishTransport):
    """code.map RPC 처리 — 프로젝트 구조 뷰용."""
    from . import rawq_bridge

    project = params.get("project", "")
    depth = params.get("depth", 2)
    lang = params.get("lang")

    project_path = self._resolve_project_path(project, runtime)
    if not project_path:
        await transport._send_notification("code.map.result", {
            "error": f"Project path not found: {project}",
        })
        return

    result = await rawq_bridge.get_map(
        project_path=project_path,
        depth=depth,
        lang_filter=lang,
    )

    await transport._send_notification("code.map.result", {
        "project": project,
        "available": rawq_bridge.is_available(),
        "map": result if result else {},
    })
```

### 6.2 프론트엔드 — WebSocket 알림 핸들러

**파일**: `client/src/lib/wsClient.ts`
**위치**: `handleNotification()` 메서드 내 switch 분기에 추가

```typescript
case 'code.search.result':
  useContextStore.getState().setCodeSearchResults(data.params);
  break;
case 'code.map.result':
  useContextStore.getState().setCodeMap(data.params);
  break;
```

### 6.3 프론트엔드 — contextStore 확장

**파일**: `client/src/store/contextStore.ts`

기존 타입에 추가:

```typescript
export interface CodeSearchResult {
  file: string;
  lines: [number, number];
  language: string;
  scope: string;
  confidence: number;
  content: string;
  context_before?: string;
  context_after?: string;
  token_count: number;
}

export interface CodeSearchResponse {
  query: string;
  project: string;
  available: boolean;
  results: CodeSearchResult[];
  query_ms: number;
  total_tokens: number;
  error?: string;
}

export interface CodeMapResponse {
  project: string;
  available: boolean;
  map: Record<string, unknown>;
  error?: string;
}
```

스토어 state에 추가:

```typescript
// state
codeSearchResults: CodeSearchResponse | null;
codeMap: CodeMapResponse | null;
codeSearchLoading: boolean;

// actions
setCodeSearchResults: (results: CodeSearchResponse) => void;
setCodeMap: (map: CodeMapResponse) => void;
setCodeSearchLoading: (loading: boolean) => void;
```

### 6.4 RPC 호출 함수

**파일**: `client/src/lib/wsClient.ts`

`WebSocketClient` 클래스에 편의 메서드 추가:

```typescript
searchCode(query: string, project: string, lang?: string) {
  useContextStore.getState().setCodeSearchLoading(true);
  this.sendRpc('code.search', { query, project, lang });
}

getCodeMap(project: string, depth?: number, lang?: string) {
  this.sendRpc('code.map', { project, depth: depth ?? 2, lang });
}
```

---

## 7. Step 4 — ContextPanel 코드 검색 탭 UI

### 7.1 탭 추가

**파일**: `client/src/store/contextStore.ts`

`ContextTab` 타입 변경:

```typescript
// 변경 전
export type ContextTab = 'overview' | 'memory' | 'branches';

// 변경 후
export type ContextTab = 'overview' | 'memory' | 'branches' | 'code';
```

### 7.2 신규 컴포넌트

**파일**: `client/src/components/layout/CodeSearchPanel.tsx`

구현 요구사항:

- 검색 입력 필드 (debounce 300ms)
- 언어 필터 드롭다운 (선택사항)
- 결과 목록: 파일명, 라인 범위, scope, confidence 배지
- 각 결과 클릭 시 코드 블록 펼치기/접기
- `rawq_bridge.is_available() === false`이면 "rawq 미설치" 안내 표시
- 로딩 스피너 (검색 중)
- 빈 결과 시 "결과 없음" 메시지

### 7.3 ContextPanel에 탭 등록

**파일**: `client/src/components/layout/ContextPanel.tsx`

기존 탭 목록에 `{ key: 'code', label: 'Code' }` 추가.
`activeTab === 'code'`일 때 `<CodeSearchPanel />` 렌더링.

---

## 8. Step 5 — rawq map 기반 구조 뷰

### 8.1 ContextPanel overview 탭 확장

**파일**: `client/src/components/layout/ContextPanel.tsx`

overview 탭의 기존 프로젝트 컨텍스트 아래에 "Code Structure" 섹션 추가.
`code.map` RPC를 프로젝트 선택 시 자동 호출하고, 트리 형태로 렌더링.

### 8.2 트리 렌더링

rawq map 출력은 중첩된 심볼 구조이다:

```json
{
  "files": [
    {
      "path": "src/main.rs",
      "symbols": [
        { "name": "main", "kind": "function", "line": 1, "children": [] },
        { "name": "Config", "kind": "struct", "line": 10, "children": [
          { "name": "new", "kind": "function", "line": 15, "children": [] }
        ]}
      ]
    }
  ]
}
```

재귀 컴포넌트로 들여쓰기 트리를 렌더링한다.
아이콘은 kind(function/struct/class/module)별로 구분한다.

---

## 9. Step 6 — 사용자 설정 커맨드 (선택)

### 9.1 ! 커맨드 추가

**파일**: `transport/src/tunadish_transport/commands.py`

```
!rawq status     — rawq 설치 여부, 인덱스 상태, 데몬 상태 표시
!rawq on/off     — 자동 컨텍스트 주입 활성화/비활성화
!rawq budget <N> — 컨텍스트 주입 토큰 예산 변경 (기본 2000)
!rawq index      — 수동 인덱스 빌드 트리거
!rawq search <Q> — 수동 코드 검색 (chat 내 인라인 결과)
```

### 9.2 설정 저장

rawq 관련 사용자 설정은 기존 `ChatPrefsStore`에 저장한다:

```python
# key: "rawq_enabled" → bool (기본 True)
# key: "rawq_token_budget" → int (기본 2000)
```

---

## 10. 사이드 이펙트 상세 검토

### 10.1 성능 영향

| 시나리오 | 추가 지연 | 조건 | 완화 |
|---------|----------|------|------|
| rawq 데몬 미가동 + 첫 검색 | 최대 10초 (타임아웃) | 데몬 cold start | 타임아웃 후 컨텍스트 없이 진행. `_rawq_ensure_index`에서 데몬도 미리 시작하면 해소 |
| rawq 데몬 가동 중 검색 | 8~50ms | 일반적 | 무시할 수준 |
| 대형 프로젝트 최초 인덱싱 | 수분 | 10만+ 파일 | 백그라운드 실행, 진행 알림 |
| rawq 미설치 | 0ms | `is_available()` = false | 즉시 반환, 영향 없음 |

### 10.2 저널(히스토리) 오염

**문제**: `enriched_text`가 `handle_message()` → `journal.record_prompt()`를 통해 저널에 기록되면, 히스토리에 rawq 컨텍스트 블록이 포함된다. 이후 `conversation.history` 로드 시 사용자에게 컨텍스트 블록이 노출된다.

**확인 방법**: `tunapi/runner_bridge.py`의 `handle_message()` 내부에서 `journal.record_prompt(incoming.text)`를 호출하는지 확인.

**대응 방안**:
- 방법 A: `IncomingMessage`에 `display_text` 필드를 추가하여 저널용/에이전트용 텍스트를 분리 → **tunapi 수정 필요, 원칙 위반**
- 방법 B (**권장**): `_execute_run()`에서 `incoming.text`에는 `enriched_text`를, 저널 기록은 별도로 원본 `text`로 수행. 즉, `handle_message()` 호출 전에 `self._journal.record_prompt(conv_id, text)` 수동 호출 후, `handle_message()`의 저널 기록을 스킵하는 옵션이 있는지 확인.
- 방법 C: rawq 컨텍스트 블록을 `<relevant_code>...</relevant_code>` 태그로 감싸고, `conversation.history` 응답 시 해당 태그를 strip한다.

**방법 C가 가장 안전하다** — tunapi 수정 없이 tunadish transport 내부에서만 처리 가능:

```python
# backend.py의 conversation.history 처리 부분에서:
import re
_RAWQ_CONTEXT_RE = re.compile(r"<relevant_code>.*?</relevant_code>\s*---\s*", re.DOTALL)

# 히스토리 메시지 반환 시:
for e in entries:
    if e.event == "prompt":
        clean_text = _RAWQ_CONTEXT_RE.sub("", e.data.get("text", ""))
        messages.append({
            "role": "user",
            "content": clean_text,
            "timestamp": e.timestamp,
        })
```

### 10.3 WebSocket 메시지 크기

**문제**: `code.search.result`에 코드 스니펫 10개 × 평균 50줄 = 500줄의 코드가 포함될 수 있다.

**대응**: 프론트엔드에서 결과를 lazy-render하고, 백엔드에서 `token_budget`으로 총량 제한.

### 10.4 멀티 클라이언트 동시 접속

**문제**: 여러 tunaDish 클라이언트가 같은 백엔드에 접속할 때, rawq 인덱싱이 중복 실행될 수 있다.

**대응**: rawq는 내부적으로 파일 기반 reader/writer 락(`index/lock.rs`)을 사용한다. 동시 `build_index` 호출은 락 대기 후 순차 실행된다. 성능 낭비가 있지만 데이터 손상은 없다.

### 10.5 디스크 사용량

**문제**: rawq 인덱스는 `~/.cache/rawq/<hash>/`에 저장된다. 대형 프로젝트에서 수백 MB.

**대응**: `!rawq status`에서 인덱스 크기를 표시. 삭제는 `rawq index remove <path>`.

### 10.6 rawq 바이너리 업데이트

**문제**: rawq 버전 업그레이드 시 인덱스 포맷이 변경될 수 있다.

**대응**: rawq는 `manifest.json`에 `schema_version`을 기록한다. 호환되지 않으면 자동으로 인덱스를 재생성한다. tunadish에서 별도 처리할 것이 없다.

### 10.7 tunapi 메시지 길이 제한

**문제**: 일부 AI 에이전트 CLI(특히 Gemini)가 매우 긴 입력을 잘라낼 수 있다.

**대응**: `token_budget=2000`이 기본값이므로 약 1.5KB 수준이다. 에이전트별 입력 제한은 tunapi의 `JsonlSubprocessRunner`가 처리하므로 tunadish에서 추가 대응 불필요.

---

## 11. 테스트 계획

### 11.1 단위 테스트

| 테스트 | 파일 | 내용 |
|--------|------|------|
| rawq_bridge.is_available() | test_rawq_bridge.py | PATH에 rawq 없을 때 False 반환 |
| rawq_bridge.search() 타임아웃 | test_rawq_bridge.py | 10초 초과 시 None 반환 |
| rawq_bridge.format_context_block() | test_rawq_bridge.py | 빈 결과 → 빈 문자열, 정상 결과 → 마크다운 블록 |
| _rawq_enrich_message() rawq 미설치 | test_backend.py | 원본 텍스트 그대로 반환 |
| _rawq_enrich_message() 검색 실패 | test_backend.py | 원본 텍스트 그대로 반환 |
| 히스토리 컨텍스트 strip | test_backend.py | `<relevant_code>` 태그 제거 확인 |

### 11.2 통합 테스트

| 테스트 | 내용 |
|--------|------|
| rawq 설치 + 프로젝트 설정 → 인덱스 생성 | project.set → rawq index build 호출 확인 |
| chat.send → 컨텍스트 주입 | enriched_text에 `<relevant_code>` 포함 확인 |
| code.search RPC → 결과 반환 | WebSocket 알림에 results 배열 포함 확인 |
| rawq 미설치 → graceful fallback | 모든 기능이 에러 없이 통과 |

---

## 12. 파일 변경 요약

### 신규 파일

| 파일 | 목적 |
|------|------|
| `transport/src/tunadish_transport/rawq_bridge.py` | rawq CLI 브릿지 모듈 |
| `client/src/components/layout/CodeSearchPanel.tsx` | 코드 검색 탭 UI |
| `transport/tests/test_rawq_bridge.py` | rawq_bridge 단위 테스트 |

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `transport/src/tunadish_transport/backend.py` | (1) `project.set` 후 인덱싱 트리거 (2) `_execute_run`에 컨텍스트 주입 (3) `code.search`/`code.map` RPC 핸들러 (4) `conversation.history`에서 rawq 컨텍스트 strip (5) `_resolve_project_path`, `_rawq_ensure_index`, `_rawq_enrich_message` 메서드 추가 |
| `client/src/lib/wsClient.ts` | `code.search.result`, `code.map.result` 알림 핸들러 + `searchCode()`, `getCodeMap()` 메서드 |
| `client/src/store/contextStore.ts` | `CodeSearchResult`, `CodeSearchResponse`, `CodeMapResponse` 타입 + 관련 state/action |
| `client/src/components/layout/ContextPanel.tsx` | 'code' 탭 추가 + CodeSearchPanel 렌더링 |
| `transport/src/tunadish_transport/commands.py` | `!rawq` 커맨드 계열 추가 (선택) |

---

## 13. 체크리스트

구현 시작 전 확인:

- [ ] `rawq` 바이너리가 개발 환경에 설치되어 있는가
- [ ] `rawq --version` 출력 확인 (최소 0.1.0)
- [ ] tunapi의 `handle_message()`가 `incoming.text`를 저널에 기록하는 방식 확인 (10.2절 참조)
- [ ] tunapi의 `IncomingMessage` 스키마에 추가 필드를 넣을 수 있는지 확인 (필수는 아님)

구현 완료 후 확인:

- [ ] rawq 미설치 환경에서 모든 기존 기능이 정상 동작하는가
- [ ] rawq 설치 환경에서 chat.send 시 컨텍스트가 주입되는가
- [ ] 검색 실패(타임아웃 등) 시 원본 메시지만 전달되는가
- [ ] 히스토리 로드 시 rawq 컨텍스트 블록이 보이지 않는가
- [ ] ContextPanel Code 탭에서 검색 결과가 표시되는가
- [ ] 대형 프로젝트에서 인덱싱 진행 알림이 표시되는가

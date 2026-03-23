# rawq 에이전트 활용 강화 요청

## 배경

rawq 코드 인덱싱/검색 인프라가 tunapi에 이미 구현되어 있다:

- `rawq_bridge.py` — rawq CLI 래퍼 (search, map, index)
- `backend.py._rawq_enrich_message()` — 사용자 메시지에 `<relevant_code>` 블록 자동 첨부
- `backend.py._rawq_ensure_index()` — `project.set` 시 인덱스 자동 빌드
- `rawq_bridge.format_context_block()` — 검색 결과를 마크다운으로 포맷

**문제**: 이 인프라가 실제로 에이전트에게 충분히 활용되고 있는지 불확실하고, 개선이 필요한 영역이 있다.

## 요청 사항

### 1. `_rawq_enrich_message()` 동작 확인 및 개선

**현재**: 사용자 메시지를 rawq로 검색 → 결과를 `<relevant_code>` 블록으로 메시지 앞에 첨부.

**확인 필요**:
- 실제로 활성화되어 동작하는지 (rawq 바이너리 감지, 인덱스 존재 여부)
- `threshold=0.5`, `top=5`, `token_budget=2000` 설정이 적절한지
- 검색 결과가 실제로 에이전트 subprocess에 전달되는지 로그 확인

**개선 제안**:
- 검색 결과가 0건일 때도 code map 요약을 대신 첨부 (프로젝트 구조 컨텍스트)
- `token_budget`을 메시지 길이에 따라 동적 조절 (짧은 질문 → 더 많은 코드 컨텍스트)
- enrichment 로그를 `[info]` 레벨로 출력하여 디버깅 가능하게

### 2. 세션 시작 시 code map 자동 주입

**현재**: 에이전트가 프로젝트 구조를 모른 채 작업 시작.

**제안**: `_execute_run()` 또는 resume 시 첫 메시지에 code map을 system context로 주입:

```python
# 에이전트 subprocess 시작 시
if rawq_bridge.is_available() and project_path:
    code_map = await rawq_bridge.get_map(project_path, depth=2)
    if code_map:
        # CLAUDE.md나 system prompt에 병합, 또는 첫 메시지 컨텍스트로 첨부
        map_block = rawq_bridge.format_map_block(code_map)
        # → "<project_structure>...\n  src/\n    auth.py (AuthService, verify_token, ...)\n  ...</project_structure>"
```

이렇게 하면 에이전트가 프로젝트 전체 구조를 파악한 상태에서 작업 시작.

### 3. 에이전트 도구로 rawq 노출 (중기)

**현재**: 에이전트는 `Bash`, `Read`, `Edit`, `Write` 도구만 사용 가능. 코드 검색은 `grep`/`rg`에 의존.

**제안**: rawq를 에이전트가 직접 호출할 수 있는 도구로 노출:

```
Tool: CodeSearch
Description: 프로젝트 코드베이스에서 시맨틱 검색. 함수명, 개념, 패턴으로 관련 코드를 찾는다.
Parameters:
  - query (string): 검색 쿼리 (자연어 또는 코드 패턴)
  - lang (string, optional): 언어 필터
  - top (int, optional): 결과 수 (기본 5)

Tool: CodeMap
Description: 프로젝트의 AST 기반 코드 구조 맵. 파일별 클래스/함수/타입 목록.
Parameters:
  - depth (int, optional): 트리 깊이 (기본 2)
  - lang (string, optional): 언어 필터
```

구현 방식:
- Claude CLI: `--allowedTools` 에 추가하는 것은 불가하지만, MCP server나 커스텀 tool provider로 노출 가능
- 또는 `Bash` 도구를 통해 `rawq search "query" /path --json`을 직접 호출하도록 CLAUDE.md에 안내
  - 이 경우 rawq 바이너리 경로를 환경변수로 제공 필요

### 4. rawq 상태 모니터링

**제안**: `project.context.result`에 rawq 상태 포함:

```python
# project.context 응답에 추가
"rawq": {
    "available": True,
    "indexed": True,
    "index_age_hours": 2.3,
    "file_count": 142,
    "daemon_running": True,
}
```

클라이언트 ContextPanel에서 rawq 상태를 표시하여 인덱스가 오래되었으면 재빌드 트리거 가능.

## 우선순위

1. **즉시**: `_rawq_enrich_message()` 동작 확인 + 로그 추가
2. **단기**: 세션 시작 시 code map 자동 주입
3. **중기**: 에이전트 도구 노출 (MCP 또는 CLAUDE.md 안내)
4. **장기**: 인덱스 자동 갱신 + 상태 모니터링

## 참고 파일

- `src/tunapi/tunadish/rawq_bridge.py` — rawq CLI 래퍼
- `src/tunapi/tunadish/backend.py` — RPC 핸들러, enrichment, index 관리
  - `_rawq_enrich_message()` (lines ~1555-1590)
  - `_rawq_ensure_index()` (lines ~1517-1554)
  - `_handle_code_search()` (lines ~1592-1630)
  - `_handle_code_map()` (lines ~1632-1657)
- `src/tunapi/runner_bridge.py` — 에이전트 subprocess 연동

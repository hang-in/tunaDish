# rawq 인덱싱 범위 제한 — project.set 경로만 인덱싱

> 대상: tunapi (tunadish transport)
> 선행 문서: `docs/prompts/integration/rawq_integration.md`
> 작성일: 2026-03-22

---

## 1. 문제

현재 rawq 인덱싱이 `D:\privateProject` 전체를 대상으로 실행되고 있어
debug 빌드 산출물(`target/`, `node_modules/`, `.venv/`, `dist/`, `__pycache__/`)을
포함한 수십만 파일을 스캔하면서 1시간 이상 소요된다.

인덱싱 범위를 **`!project set`으로 등록된 프로젝트 경로만**으로 제한해야 한다.

---

## 2. 요구사항

1. rawq 인덱싱은 `project.set` RPC로 활성화된 프로젝트의 **실제 경로**에만 실행한다.
2. 부모 디렉토리(예: `D:\privateProject`)를 루트로 인덱싱하지 않는다.
3. 여러 프로젝트가 set된 경우 각 프로젝트 경로를 **개별적으로** 인덱싱한다.
4. `build_index()` 호출 시 기본 제외 패턴을 적용한다.
5. 인덱싱 시작/완료를 클라이언트에 알린다.

---

## 3. 구현 변경사항

### 3.1 rawq_bridge.py — build_index에 exclude 패턴 추가

```python
# 기본 제외 패턴 — 빌드 산출물, 의존성 디렉토리
_DEFAULT_EXCLUDE = [
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    "target/debug",
    "target/release",
    "dist",
    ".git",
    "*.egg-info",
    ".mypy_cache",
    ".pytest_cache",
    ".next",
]

async def build_index(
    project_path: str | Path,
    exclude: list[str] | None = None,
) -> bool:
    """프로젝트 인덱스를 생성/갱신한다."""
    if not is_available():
        return False

    cmd = ["rawq", "index", "build", str(project_path)]

    for pattern in (exclude or _DEFAULT_EXCLUDE):
        cmd.extend(["--exclude", pattern])

    try:
        result = await anyio.run_process(cmd, check=False)
        return result.returncode == 0
    except Exception as e:
        logger.warning("rawq index build failed: %s", e)
        return False
```

> **참고**: rawq의 `--exclude` 플래그가 glob 패턴인지 디렉토리 이름인지 확인 필요.
> rawq가 `.gitignore`를 자동 적용하므로 `.gitignore`에 이미 포함된 패턴은 중복이지만,
> `.gitignore`가 없는 프로젝트를 위한 안전장치로 유지한다.

### 3.2 backend.py — project.set 시 해당 프로젝트만 인덱싱

현재 `_rawq_ensure_index`의 호출 위치는 `rawq_integration.md` Step 1 (4.3절)에 정의되어 있다.
핵심은 **`_resolve_project_path()`가 반환하는 경로가 개별 프로젝트 루트**여야 한다는 것이다.

```python
def _resolve_project_path(self, project_name: str, runtime: TransportRuntime) -> Path | None:
    """프로젝트 이름 → 실제 파일시스템 경로.

    반드시 개별 프로젝트 루트를 반환해야 한다.
    부모 디렉토리(projects_root 자체)를 반환하면 안 된다.
    """
    # 1. tunapi config의 projects 맵에서 조회
    projects_map = getattr(getattr(runtime, "_projects", None), "projects", {})
    pc = projects_map.get(project_name.lower())
    if pc and pc.path and pc.path.exists():
        return pc.path

    # 2. projects_root / project_name 으로 폴백
    projects_root = self._get_projects_root()
    if projects_root:
        candidate = Path(projects_root).expanduser() / project_name
        if candidate.exists():
            return candidate

    # 3. 절대 부모 디렉토리를 반환하지 않는다
    return None
```

### 3.3 다중 프로젝트 지원

`!project set`으로 여러 프로젝트를 활성화할 수 있다면,
각 프로젝트에 대해 개별적으로 `_rawq_ensure_index`를 호출한다.

```python
elif method == "project.set":
    name = params.get("name", "")
    await self._dispatch_rpc_command("project", f"set {name}", params, runtime, transport)

    # 활성 프로젝트 각각에 대해 개별 인덱싱
    if self._task_group is not None:
        active_projects = self._get_active_project_names(runtime)  # 현재 set된 프로젝트 목록
        for proj_name in active_projects:
            self._task_group.start_soon(
                self._rawq_ensure_index, proj_name, runtime, transport
            )
```

### 3.4 _get_active_project_names 헬퍼

```python
def _get_active_project_names(self, runtime: TransportRuntime) -> list[str]:
    """현재 활성화된 프로젝트 이름 목록을 반환한다."""
    # context_store에서 현재 세션의 활성 프로젝트 조회
    # 구현은 tunapi의 프로젝트 관리 방식에 따라 달라짐
    # 예시:
    ctx = self.context_store
    if hasattr(ctx, "active_projects"):
        return list(ctx.active_projects)
    # 또는 runtime에서 조회
    projects_map = getattr(getattr(runtime, "_projects", None), "projects", {})
    return [name for name, pc in projects_map.items() if getattr(pc, "active", False)]
```

---

## 4. 검증 체크리스트

- [ ] `rawq index build D:\privateProject\tunaDish` — tunaDish만 인덱싱 (수초~수분)
- [ ] `rawq index build D:\privateProject\tunapi` — tunapi만 인덱싱
- [ ] `D:\privateProject` 전체를 루트로 인덱싱하는 경로가 없는지 확인
- [ ] `rawq index status <path>` 로 인덱스 존재 확인
- [ ] `rawq search "검색어" <path>` 로 검색 동작 확인
- [ ] `_DEFAULT_EXCLUDE` 패턴이 rawq `--exclude` 플래그와 호환되는지 확인
- [ ] 인덱싱 시작/완료 알림이 클라이언트에 도착하는지 확인

---

## 5. 수동 테스트 (긴급 — 인덱싱 프로세스 재시작 전)

현재 rawq 프로세스가 종료된 상태이므로, 재시작 시 아래 명령으로 개별 프로젝트만 인덱싱:

```bash
# 개별 프로젝트 단위로만 실행
rawq index build "D:\privateProject\tunaDish"
rawq index build "D:\privateProject\tunapi"

# 절대 이렇게 하지 않는다:
# rawq index build "D:\privateProject"   ← 전체 디렉토리 인덱싱 금지
```

---

## 6. 향후 고려사항

- `!rawq reindex` 커맨드: 수동 재인덱싱 트리거 (특정 프로젝트 또는 전체)
- 인덱싱 진행률 알림: `rawq index build --progress` 플래그가 있다면 활용
- 인덱스 캐시 정리: 더 이상 사용하지 않는 프로젝트의 인덱스 자동 삭제

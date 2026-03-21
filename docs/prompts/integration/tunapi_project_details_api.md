# tunapi 요청: TransportRuntime에 프로젝트 상세 정보 public API 추가

## 배경

tunadish의 `project.list` RPC에서 프로젝트별 상세 정보(path, default_engine 등)를 클라이언트에 전달해야 합니다.
현재는 `runtime._projects.projects` (internal dict)에 직접 접근하여 `ProjectConfig`를 읽고 있습니다.

## 현재 workaround (tunadish backend.py)

```python
projects_map = getattr(getattr(runtime, "_projects", None), "projects", {})
for key, pc in projects_map.items():
    configured.append({
        "key": key,
        "alias": pc.alias,
        "path": str(pc.path) if pc.path else None,
        "default_engine": pc.default_engine,
    })
```

이 방식은 internal attribute 접근이므로 tunapi 내부 구조 변경 시 깨질 수 있습니다.

## 요청 사항

`TransportRuntime`에 아래 public 메서드 중 하나를 추가해주세요:

### Option A: 개별 조회

```python
def project_config(self, project_key: str) -> ProjectConfig | None:
    """Return ProjectConfig for the given key, or None."""
    return self._projects.projects.get(project_key)
```

### Option B: 전체 조회 (선호)

```python
def all_project_configs(self) -> dict[str, ProjectConfig]:
    """Return all configured projects as {key: ProjectConfig}."""
    return dict(self._projects.projects)
```

### 필요한 필드

Transport 측에서 필요한 `ProjectConfig` 필드:
- `alias` (display name)
- `path` (프로젝트 디렉토리 경로)
- `default_engine` (per-project 기본 엔진)

## 용도

tunadish 사이드바에서 프로젝트를 3가지로 분류:
1. **Projects**: configured + path 존재 → 완전 설정된 프로젝트
2. **DISC**: discovered (.git만 발견) → 아직 toml에 미등록
3. **Channels**: configured + path 없음 → 디렉토리 없는 일반 채팅 채널

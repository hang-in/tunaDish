# tunapi — Conversation-level Settings 지원

> tunadish 클라이언트에서 conversation별 model/persona/trigger 분리를 구현함.
> tunapi 서버 측에서 이를 올바르게 지원하기 위한 작업 명세.

## 배경

현재 `model.set`, `persona.set`, `trigger.set` 커맨드는 **project 레벨**에서 설정을 변경한다.
이 때문에 main 대화에서 모델을 변경하면 branch 대화도 동시에 영향을 받는다.

RT(Roundtable) 고도화를 위해 각 conversation(branch 포함)이 독립적인 설정을 가져야 한다.

## 클라이언트 측 완료 사항

1. `Conversation` 타입에 `engine`, `model`, `persona`, `triggerMode` 필드 추가
2. `useConvSettings` 훅: conversation override → projectContext fallback
3. QuickChips가 `useConvSettings`에서 읽고, 선택 시 optimistic update
4. Branch 생성 시 부모의 현재 settings를 스냅샷 복사

## tunapi 측 필요 작업

### 1. conversation별 설정 저장 (우선순위: 최상)

**파일**: `src/tunapi/tunadish/context_store.py` 또는 새 파일

현재 프로젝트 레벨에 저장되는 `engine`, `model`, `persona`, `trigger_mode`를
conversation 레벨로 분리 저장.

```python
# 제안 구조
class ConversationSettings:
    engine: str | None = None
    model: str | None = None
    persona: str | None = None
    trigger_mode: str | None = None

# conversation_id → ConversationSettings
_conv_settings: dict[str, ConversationSettings] = {}
```

resolution 순서: `conv_settings[conv_id] → project_defaults`

### 2. model.set / persona.set / trigger.set 커맨드 수정 (우선순위: 최상)

**파일**: `src/tunapi/tunadish/commands.py`

- `conversation_id`가 있으면 conversation 레벨에 설정 저장
- `conversation_id`가 없으면 기존대로 project 레벨에 설정

```python
# model.set 예시
async def handle_model_set(params):
    conv_id = params.get("conversation_id")
    engine = params.get("engine")
    model = params.get("model")

    if conv_id:
        # conversation-level setting
        settings = get_conv_settings(conv_id)
        settings.engine = engine
        if model:
            settings.model = model
    else:
        # project-level default (기존 동작)
        ...
```

### 3. command.result 응답에 설정 정보 포함 (우선순위: 높음)

현재 `command.result`는 `{conversation_id, text}` 형태만 반환.
설정 변경 커맨드의 경우 변경된 설정값을 구조화하여 포함해야 한다.

```json
{
  "method": "command.result",
  "params": {
    "conversation_id": "abc-123",
    "text": "Model set to claude/sonnet-4",
    "settings": {
      "engine": "claude",
      "model": "sonnet-4"
    }
  }
}
```

클라이언트는 `settings` 필드가 있으면 `updateConvSettings`를 호출하여
optimistic update를 서버 응답으로 확정/보정한다.

### 4. runner_bridge에서 conversation settings 참조 (우선순위: 높음)

**파일**: `src/tunapi/runner_bridge.py`

`_execute_run` 시 conversation별 설정을 우선 적용:

```python
async def _execute_run(conv_id, project, text):
    settings = get_conv_settings(conv_id)
    engine = settings.engine or project.default_engine
    model = settings.model or project.default_model
    persona = settings.persona or project.default_persona
    # ... run with resolved settings
```

### 5. project.context 응답에 conversation settings 포함 (우선순위: 중간)

현재 `project.context`는 프로젝트 레벨 설정만 반환.
conversation별 설정이 있으면 `conv_settings` 필드로 포함:

```json
{
  "result": {
    "engine": "claude",
    "model": "sonnet-4",
    "persona": "default",
    "trigger_mode": "always",
    "conv_settings": {
      "engine": "gemini",
      "model": "flash-2"
    }
  }
}
```

클라이언트는 `conv_settings`가 있으면 해당 conversation의 override로 적용.

### 6. branch.create 시 부모 settings 상속 (우선순위: 중간)

branch 생성 시 부모 conversation의 현재 settings를 복사하여
새 branch conversation의 초기 settings로 저장:

```python
async def handle_branch_create(params):
    parent_id = params["conversation_id"]
    parent_settings = get_conv_settings(parent_id)

    branch_id = create_branch(...)
    branch_conv_id = f"branch:{branch_id}"

    # 부모 설정 스냅샷 복사
    set_conv_settings(branch_conv_id, parent_settings.copy())
```

## 검증 시나리오

1. main에서 model → gemini 변경 → branch의 model은 변경되지 않아야 함
2. branch에서 persona → creative 변경 → main의 persona는 변경되지 않아야 함
3. 새 branch 생성 → 부모의 현재 settings가 복사되어야 함
4. conversation settings가 없으면 project defaults로 fallback

## 비고

- 클라이언트는 이미 optimistic update를 적용하므로 서버 응답이 느려도 UX에 영향 없음
- 서버에서 `command.result.settings` 필드를 추가하면 optimistic update 보정 가능
- RT 고도화 시 각 참여자(에이전트)별 독립 설정으로 자연스럽게 확장 가능

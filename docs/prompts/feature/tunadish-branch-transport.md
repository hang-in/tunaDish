# tunaDish 브랜치 transport/client 구현 프롬프트

> 대상 레포: `~/privateProject/tunaDish/`
> 설계 문서: `~/privateProject/tunaDish/docs/prompts/branch-and-rt-implementation.md`
> 동시 작업: tunapi 스키마 변경 (별도 레포, 충돌 없음)
> 참고: tunapi 스키마 변경 전에도 기존 API로 구현 가능

---

## 목표

tunaDish에서 대화 브랜치(분기)를 생성/전환/채택할 수 있도록
transport 백엔드와 클라이언트를 확장한다.

---

## Phase 1: Transport 백엔드 (Python)

### 대상 파일: `transport/src/tunadish_transport/backend.py`

#### 1.1 새 RPC 핸들러 등록

`_ws_handler`의 method 라우팅에 추가:

```python
elif method == "branch.create":
    await self._handle_branch_create(params, runtime, transport)
elif method == "branch.switch":
    await self._handle_branch_switch(params, transport)
elif method == "branch.adopt":
    await self._handle_branch_adopt(params, transport)
elif method == "branch.archive":
    await self._handle_branch_archive(params, transport)
```

#### 1.2 핸들러 구현

**`_handle_branch_create`**:
- params: `conversation_id`, `checkpoint_id?` (분기 시점 메시지 ID), `label?`
- `self._facade.conv_branches.create(project, label, parent_branch_id=current_branch)`
- 알림: `branch.created` → `{ conversation_id, branch_id, label }`

**`_handle_branch_switch`**:
- params: `conversation_id`, `branch_id`
- `context_store`의 `active_branch_id` 갱신
- 해당 브랜치의 메시지 히스토리 전송: `conversation.history.result`
- 알림: `branch.switched` → `{ conversation_id, branch_id }`

**`_handle_branch_adopt`**:
- params: `conversation_id`, `branch_id`
- 해당 브랜치 상태 → `adopted` (또는 기존 `merged`)
- 같은 부모의 다른 브랜치 → `archived` (또는 `discarded`)
- 알림: `branch.adopted` → `{ conversation_id, branch_id }`

**`_handle_branch_archive`**:
- params: `conversation_id`, `branch_id`
- 해당 브랜치 상태 → `archived` (또는 `discarded`)
- 알림: `branch.archived` → `{ conversation_id, branch_id }`

#### 1.3 `message.retry` 개선

현재: 마지막 prompt를 동일 대화에서 재실행
목표:
1. 새 브랜치 생성 (`branch.create` 내부 호출)
2. 해당 브랜치 컨텍스트에서 `handle_chat_send` 실행
3. 기존 응답은 원래 브랜치에 보존

```python
async def _handle_message_retry(self, params, runtime, transport, ws_tg):
    conv_id = params.get("conversation_id")
    message_id = params.get("message_id")
    # 1. 마지막 prompt 찾기
    entries = await self._journal.recent_entries(conv_id, limit=200)
    last_prompt = None
    for e in reversed(entries):
        if e.event == "prompt":
            last_prompt = e.data.get("text", "")
            break
    if not last_prompt:
        return
    # 2. 새 브랜치 생성
    # (facade.conv_branches.create 사용)
    # 3. 브랜치 컨텍스트에서 재실행
    ws_tg.start_soon(self.handle_chat_send,
        {"conversation_id": conv_id, "text": last_prompt},
        runtime, transport)
```

#### 1.4 `message.adopt` 개선

현재: 확인 알림만
목표:
1. 현재 브랜치가 있으면 해당 브랜치를 `adopted`로 변경
2. 같은 부모의 다른 브랜치를 `archived`로 변경
3. 알림: `branch.adopted`

### 대상 파일: `transport/src/tunadish_transport/context_store.py`

`ConversationMeta`에 필드 추가:
```python
@dataclass
class ConversationMeta:
    project: str
    branch: str | None          # git branch
    label: str
    created_at: float
    active_branch_id: str | None = None  # NEW: 현재 활성 대화 브랜치
```

---

## Phase 2: 클라이언트 (TypeScript/React)

### 2.1 `client/src/store/contextStore.ts`

`ConversationBranch` 타입 업데이트:
```typescript
export interface ConversationBranch {
  id: string;
  label: string;
  status: 'active' | 'adopted' | 'archived' | 'discarded';
  gitBranch?: string;
  parentBranchId?: string;
  checkpointId?: string;
  rtSessionId?: string;
}
```

### 2.2 `client/src/store/chatStore.ts`

상태 추가:
```typescript
activeBranchId: string | null;  // 현재 보고 있는 브랜치
```

액션 추가:
```typescript
setActiveBranch: (branchId: string | null) => void;
```

### 2.3 `client/src/lib/wsClient.ts`

새 알림 핸들러:
```typescript
case 'branch.created':
  // chatStore에 브랜치 정보 추가 + 자동 전환
  break;
case 'branch.switched':
  // activeBranchId 갱신
  break;
case 'branch.adopted':
  // 브랜치 상태 업데이트 + 메인으로 복귀
  break;
case 'branch.archived':
  // 브랜치 상태 업데이트
  break;
```

### 2.4 `client/src/components/layout/ChatArea.tsx`

**브랜치 인디케이터 (메시지 영역 상단)**:
- 활성 브랜치가 있으면 표시: `🔀 branch-label [Back to main]`
- 없으면 표시 안 함

**retry 버튼 동작 변경**:
- 현재: 같은 대화에서 재생성
- 변경: 새 브랜치 생성 → 자동 전환 → 해당 브랜치에서 재생성

**adopt 버튼 동작 변경**:
- 현재: toast만
- 변경: 브랜치 채택 → 메인 복귀 → toast "Adopted & merged to main"

---

## 하지 않는 것

- tunapi 코어 스키마 수정 (별도 레포에서 병렬 진행)
- RT 비교 뷰 (Phase 3에서 진행)
- RT 자동 브랜치 생성 (Phase 3에서 진행)
- 문단 단위 인라인 코멘트

---

## 의존성

- tunapi의 `ProjectMemoryFacade.conv_branches` API (이미 존재):
  - `create(project, label, ...)` → `ConversationBranch`
  - `list(project)` → `list[ConversationBranch]`
  - `update_status(project, branch_id, status)` → tunapi에 있는지 확인 필요
- tunapi 스키마 변경(adopted/archived 상태)이 완료되기 전에는 기존 `merged`/`discarded`로 대체 가능

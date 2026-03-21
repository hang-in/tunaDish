# 브랜치 & 라운드테이블 구현 설계서

> 작성일: 2026-03-21
> 기반: RT 토론 합의 (claude/opus4 + gemini + codex)
> 대상: tunapi 코어 스키마 변경 + tunaDish transport/client 연동

---

## 1. 핵심 개념 정의

### 브랜치 = 대화 분기

- Slack식 "답글 묶음"이 아니라 **특정 시점에서 대화를 갈라치기**
- `thread_id` 프로토콜은 유지하되, tunadish UI에서는 브랜치로 해석
- 기존 `conversation_branch.py`의 `checkpoint_id` 모델과 1:1 매핑

### RT = 자동 멀티브랜치

- RT는 별도 기능이 아니라 **브랜치 모델의 특수 케이스**
- 같은 출발점에서 엔진별 자동 브랜치를 병렬 생성하여 비교
- 데이터 모델은 동일, 렌더링만 분기 (일반 대화: 타임라인, RT: 컬럼/탭 비교 뷰)

---

## 2. tunapi 스키마 변경

### 2.1 ConversationBranch (conversation_branch.py)

**현재:**
```python
ConvBranchStatus = Literal["active", "merged", "discarded"]

class ConversationBranch(msgspec.Struct):
    branch_id: str
    label: str
    status: ConvBranchStatus = "active"
    parent_branch_id: str | None = None
    session_id: str | None = None
    git_branch: str | None = None
    created_at: str = ""
    updated_at: str = ""
```

**변경:**
```python
ConvBranchStatus = Literal["active", "adopted", "archived", "discarded"]

class ConversationBranch(msgspec.Struct, forbid_unknown_fields=False):
    branch_id: str
    label: str
    status: ConvBranchStatus = "active"
    parent_branch_id: str | None = None
    session_id: str | None = None
    git_branch: str | None = None
    checkpoint_id: str | None = None    # NEW: 분기 시점의 메시지/utterance ID
    rt_session_id: str | None = None    # NEW: RT 세션 연결 (None이면 일반 브랜치)
    created_at: str = ""
    updated_at: str = ""
```

**상태 전이:**
```
active ──adopt──→ adopted     (채택, 메인 대화로 복귀)
active ──archive─→ archived   (보관, 비교 참조용)
active ──discard─→ discarded  (폐기)
```

- `merged` → `adopted` 리네이밍 (병합이 아닌 채택)
- `archived` 추가 (비채택 브랜치 보관)

### 2.2 RoundtableParticipant (rt_participant.py)

**현재:**
```python
class RoundtableParticipant(msgspec.Struct):
    participant_id: str
    engine: str
    role: str
    instruction: str = ""
    order: int = 0
    enabled: bool = True
```

**변경:**
```python
class RoundtableParticipant(msgspec.Struct, forbid_unknown_fields=False):
    participant_id: str
    engine: str
    role: str
    instruction: str = ""
    order: int = 0
    enabled: bool = True
    model_override: str | None = None   # NEW: 엔진 내 특정 모델 지정
```

**모델 결정 우선순위:** CLI override > preset > 채널 기본 override > 엔진 기본 모델

**역할 세트:**
- 기본 3개: `architect`, `critic`, `implementer`
- 선택적: `operator`, `security`, `ux`, `domain-expert`
- `conductor`도 `role="conductor"`인 participant로 통합 (별도 엔티티 불필요)

**제약:** RT 시작 후 participant 변경 금지 (변수 통제). `!model` 명령 차단 필요.

### 2.3 Utterance (rt_utterance.py)

**현재:**
```python
class Utterance(msgspec.Struct):
    utterance_id: str
    stage: str              # "round_1", "framing", "critique" 등
    participant_id: str
    engine: str
    role: str
    output_text: str
    input_summary: str = ""
    reply_to: str | None = None
    created_at: str = ""
```

**변경:**
```python
Phase = Literal["opinion", "comment", "synthesis", "refinement"]

class Utterance(msgspec.Struct, forbid_unknown_fields=False):
    utterance_id: str
    stage: str              # 하위호환 유지 (display용)
    participant_id: str
    engine: str
    role: str
    output_text: str
    input_summary: str = ""
    reply_to: str | None = None
    created_at: str = ""
    round_idx: int = 0      # NEW: 라운드 번호
    phase: Phase = "opinion" # NEW: 구조화된 phase
    branch_id: str | None = None  # NEW: 브랜치 연결
```

**`stage` 분리 이유:** `"round_2:synthesis"` 같은 문자열 파싱 규약이 여러 곳에 퍼져 취약.
분리하면 조회·정렬·UI 필터링이 단순해짐:
```python
# before: 문자열 파싱
parts = u.stage.split(":")
round_num = int(parts[0][-1])

# after: 바로 필터
[u for u in utterances if u.round_idx == 2 and u.phase == "synthesis"]
```

### 2.4 SynthesisArtifact (synthesis.py)

**현재 필드 유지 + 추가:**
```python
class SynthesisArtifact(msgspec.Struct, forbid_unknown_fields=False):
    # ... 기존 필드 유지 ...
    round_idx: int = 0           # NEW: 어느 라운드의 종합인지
    status: Literal["draft", "finalized", "adopted"] = "draft"  # NEW
```

### 2.5 라운드 운영 (Phase)

| Phase | 설명 | 필수 여부 |
|-------|------|-----------|
| `opinion` | 각 participant 독립 발언 | 필수 |
| `comment` | 사용자/다른 participant 피드백 | opt-in |
| `synthesis` | conductor 취합 | opt-in |
| `refinement` | 통합안 정제 | opt-in |

간단한 토픽은 `opinion` → 바로 종료. 깊은 토론은 사용자가 명시적으로 다음 phase 요청.

---

## 3. tunaDish transport 변경

### 3.1 WebSocket RPC 추가 메서드

| 메서드 | params | 설명 |
|--------|--------|------|
| `branch.create` | `conversation_id`, `checkpoint_id?`, `label?` | 현재 시점에서 브랜치 분기 |
| `branch.switch` | `conversation_id`, `branch_id` | 브랜치 전환 (대화 컨텍스트 변경) |
| `branch.adopt` | `conversation_id`, `branch_id` | 브랜치 채택 → 메인 복귀 |
| `branch.archive` | `conversation_id`, `branch_id` | 브랜치 보관 |
| `branch.list` | `conversation_id` | 해당 대화의 브랜치 목록 |
| `roundtable.next_phase` | `session_id`, `phase?` | 다음 phase로 전환 (opt-in) |

### 3.2 backend.py 변경

**`handle_chat_send` 확장:**
- `params`에 `thread_id` (= `branch_id`) 전달 시 해당 브랜치 컨텍스트로 실행
- `IncomingMessage`의 `thread_id` 필드 활용

**`message.retry` 개선:**
- 현재: 마지막 prompt를 단순 재실행
- 목표: 새 브랜치를 생성하고 그 브랜치에서 재실행, 기존 응답 보존

**`message.adopt` 개선:**
- 현재: 확인 알림만
- 목표: 해당 브랜치를 `adopted` 상태로 변경, 나머지를 `archived` 처리, 채택된 응답 요약을 메인 대화에 삽입

### 3.3 context_store.py 변경

**`ConversationMeta` 확장:**
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

## 4. tunaDish 클라이언트 변경

### 4.1 contextStore.ts 타입 동기화

**현재:**
```typescript
export interface ConversationBranch {
  id: string;
  label: string;
  status: 'active' | 'closed';
  gitBranch?: string;
  parentSessionId?: string;
}
```

**변경:**
```typescript
export interface ConversationBranch {
  id: string;
  label: string;
  status: 'active' | 'adopted' | 'archived' | 'discarded';
  gitBranch?: string;
  parentBranchId?: string;
  checkpointId?: string;    // 분기 시점
  rtSessionId?: string;     // RT 세션 연결
}
```

### 4.2 chatStore.ts 확장

```typescript
interface ChatState {
  // ... 기존 필드 ...
  activeBranchId: string | null;  // NEW: 현재 보고 있는 브랜치

  // NEW actions
  setActiveBranch: (branchId: string | null) => void;
  createBranch: (convId: string, checkpointId?: string) => void;
  adoptBranch: (convId: string, branchId: string) => void;
}
```

### 4.3 UI 렌더링 분기

| 컨텍스트 | 렌더링 |
|----------|--------|
| 일반 대화 | 메인 타임라인 + 브랜치 진입/복귀 내비게이션 |
| RT 세션 | 엔진별 컬럼/탭 비교 뷰 (Topic Canvas) |

**일반 브랜치 UI:**
- 메시지 hover → retry → 새 브랜치 생성
- 브랜치 간 전환: 탭 또는 브레드크럼
- adopt 시 메인 타임라인에 요약 삽입

**RT 비교 뷰:**
- 가로 컬럼: 참여자별 응답 병렬 표시
- 카드 단위 피드백 (문단 단위 인라인 코멘트는 후순위)
- phase 전환 버튼 (opt-in)

---

## 5. 마이그레이션 고려사항

### 5.1 기존 데이터 호환

- `ConvBranchStatus`에 `"merged"` → `"adopted"` 매핑 필요
- `Utterance.stage` 기존 문자열은 유지, `round_idx`/`phase` 파싱해서 채우는 마이그레이션
- `forbid_unknown_fields=False`이므로 필드 추가는 안전

### 5.2 RT 시작 시 모델 변경 차단

```python
# handle_chat_send에서 커맨드 파싱 시
if cmd == "model" and active_rt_session:
    await send(RenderedMessage(text="⚠️ RT 진행 중에는 모델 변경이 불가합니다."))
    return True
```

---

## 6. 구현 순서

| 순서 | 대상 | 내용 | 복잡도 |
|------|------|------|--------|
| **1** | tunapi | `ConversationBranch` 스키마 변경 (`adopted`, `archived`, `checkpoint_id`, `rt_session_id`) | 낮음 |
| **2** | tunapi | `RoundtableParticipant`에 `model_override` 추가 | 낮음 |
| **3** | tunapi | `Utterance`에 `round_idx` + `phase` + `branch_id` 추가 | 낮음 |
| **4** | tunaDish transport | `branch.create/switch/adopt/archive/list` RPC 핸들러 | 중간 |
| **5** | tunaDish transport | `message.retry` → 새 브랜치에서 재생성 | 중간 |
| **6** | tunaDish transport | `message.adopt` → 브랜치 채택 + 메인 복귀 | 중간 |
| **7** | tunaDish client | `ConversationBranch` 타입 동기화 + `activeBranchId` 상태 | 낮음 |
| **8** | tunaDish client | 브랜치 전환 UI (탭/브레드크럼) | 중간 |
| **9** | tunaDish transport | RT 세션 감지 시 엔진별 자동 브랜치 생성 | 중간 |
| **10** | tunaDish client | RT 비교 뷰 (컬럼/탭) | 높음 |
| **11** | tunaDish transport | `roundtable.next_phase` opt-in phase 전환 | 중간 |
| **12** | tunaDish client | 카드 단위 피드백 UI | 중간 |

### tunapi 전용 프롬프트 (순서 1~3)

순서 1~3은 tunapi 레포에서 독립 실행 가능. 아래 파일만 수정:
- `src/tunapi/core/conversation_branch.py`
- `src/tunapi/core/rt_participant.py`
- `src/tunapi/core/rt_utterance.py`
- `src/tunapi/core/synthesis.py`

### tunaDish 전용 (순서 4~12)

tunapi 스키마 변경 후 진행. transport → client 순서.

---

## 7. RT 프리셋 구조 (tunapi.toml)

```toml
[roundtable.presets.security-review]
roles = [
    { engine = "claude", role = "architect", model = "opus" },
    { engine = "gemini", role = "attacker" },
    { engine = "claude", role = "defender", model = "sonnet" },
]

[roundtable.presets.code-review]
roles = [
    { engine = "claude", role = "implementer", model = "opus" },
    { engine = "gemini", role = "critic" },
    { engine = "codex", role = "architect" },
]
```

---

## 8. 5개 엔티티 상태 모델 (최종 확정)

| 엔티티 | 핵심 변경 | 상태 전이 |
|--------|-----------|-----------|
| **Participant** | `model_override` 추가, conductor도 participant | 없음 (immutable) |
| **Branch** | `checkpoint_id`, `rt_session_id` 추가, `merged`→`adopted` | active→adopted/archived/discarded |
| **Round** | phase 강제 없음 (opinion만 필수) | in_progress→completed/cancelled |
| **Utterance** | `stage`→`round_idx`+`phase` 분리, `branch_id` 추가 | 없음 (append-only) |
| **Synthesis** | `round_idx`, `status` 추가 | draft→finalized→adopted |

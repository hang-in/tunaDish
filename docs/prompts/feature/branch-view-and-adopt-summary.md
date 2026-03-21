# 브랜치 뷰 모드 & Adopt 요약 카드 구현

> 대상 레포: `~/privateProject/tunaDish/`
> 관련 문서: `docs/prompts/branch-and-rt-implementation.md`

---

## 목적

### 1. 브랜치 뷰 모드

현재 브랜치 UI는 `BranchIndicator` (라벨 + Adopt/Back 버튼)뿐이다.
브랜치는 `parent_branch_id` 체이닝으로 **무제한 깊이 트리**를 형성하므로,
탭 바로는 부족하고 **트리 그래프 기반 전용 뷰**가 필요하다.

**해결**: 브랜치 진입 시 사이드바를 숨기고, 좌측에 폴딩 가능한 브랜치 그래프 패널을 표시한다.

```
일반 모드:  [사이드바]           [채팅 메인]        [컨텍스트]
브랜치 모드: [브랜치 그래프 ◂]    [브랜치 채팅]      [컨텍스트]
             (폴딩 가능)          사이드바 숨김
```

### 2. Adopt 시 요약 카드

브랜치를 채택(adopt)하면 메인 타임라인으로 복귀하지만,
현재는 상태 변경만 하고 **브랜치에서 무슨 일이 있었는지** 메인에 남지 않는다.

**해결**: adopt 시 브랜치 대화를 요약하여 메인 타임라인에 특수 카드로 삽입한다.

---

## 구현

### Phase A: 브랜치 뷰 모드

#### A-1. systemStore 확장 (`client/src/store/systemStore.ts`)

```typescript
// 추가 상태
branchViewMode: boolean;         // 브랜치 뷰 활성 여부
branchGraphOpen: boolean;        // 좌측 그래프 패널 폴딩 상태
branchGraphWidth: number;        // 그래프 패널 너비

// 추가 액션
setBranchViewMode: (on: boolean) => void;
toggleBranchGraph: () => void;
setBranchGraphWidth: (w: number) => void;
```

- `branchViewMode: true`이면 사이드바 숨김 + 그래프 패널 표시
- `branchViewMode: false`로 전환하면 사이드바 복원

#### A-2. 레이아웃 전환 (`client/src/App.tsx`)

`branchViewMode`에 따라 좌측 패널을 분기:
- `false`: 기존 Sidebar
- `true`: BranchGraphPanel (사이드바 자리에 렌더링)

사이드바와 그래프 패널은 동시에 표시되지 않는다.
전환 시 사이드바와 동일한 슬라이딩 애니메이션 적용.

#### A-3. BranchGraphPanel 컴포넌트 (`client/src/components/layout/BranchGraphPanel.tsx`)

**구조:**
```
┌─────────────────────────┐
│ ◂ Branches         [×]  │  ← 헤더 (폴드/닫기)
├─────────────────────────┤
│                          │
│ ● main                   │  ← 트리 그래프
│ ├─● retry-1  [active]    │    클릭 시 branch.switch RPC
│ │  └─● retry-1a          │
│ ├─● retry-2  [adopted] ✓ │
│ └─● retry-3  [archived]  │
│                          │
├─────────────────────────┤
│ 선택: retry-1            │  ← 브랜치 정보 패널
│ 상태: active             │
│ 생성: 2026-03-21         │
│ 부모: main               │
│                          │
│ [Adopt] [Archive]        │  ← 액션 버튼
├─────────────────────────┤
│ [← Back to main]        │  ← 메인 복귀 (브랜치 뷰 종료)
└─────────────────────────┘
```

**데이터 소스**: `contextStore.convBranches` (이미 `project.context.result`와 `branch.list.json.result`로 동기화됨)

**트리 렌더링 로직**:
1. `convBranches`를 `parentBranchId` 기준으로 트리 구조로 변환
2. root 노드 = `parentBranchId`가 없는 브랜치들 + "main" 가상 노드
3. 각 노드: 들여쓰기 + 연결선(├─/└─) + 라벨 + 상태 뱃지
4. 선택된 노드 하이라이트 (`activeBranchId`와 매칭)

**브랜치 전환 시 흐름**:
1. 노드 클릭 → `wsClient.sendRpc('branch.switch', { conversation_id, branch_id })`
2. 서버: 히스토리 전송 → `conversation.history.result` 알림
3. 서버: `branch.switched` 알림 → `chatStore.setActiveBranch()`
4. "main" 노드 클릭 → `branch_id: null` 전송 → 메인 복귀

**Back to main 버튼 동작**:
1. `branch.switch`에 `branch_id: null` 전송
2. `systemStore.setBranchViewMode(false)` → 사이드바 복원

#### A-4. 진입 트리거

- **자동**: `branch.created` 알림 수신 시 → `setBranchViewMode(true)`
  - `wsClient.ts`의 `branch.created` 핸들러에서 호출
- **수동**: 기존 `BranchIndicator` 클릭 → 브랜치 뷰 진입
  - `BranchIndicator` 리팩토링: 그래프 패널 열기 역할로 전환

#### A-5. 기존 BranchIndicator 변경

브랜치 뷰 모드에서는 `BranchIndicator` 숨김 (그래프 패널이 대체).
브랜치 뷰 모드가 아닌데 `activeBranchId`가 있는 경우에만 표시
(예: 브랜치 그래프를 접은 상태에서 간이 표시용).

---

### Phase B: Adopt 시 요약 카드

#### B-1. 백엔드 요약 생성 (`transport/src/tunadish_transport/backend.py`)

`_handle_branch_adopt` 또는 `_handle_message_adopt` 수정:

1. adopt 대상 브랜치의 대화 히스토리 조회
2. 히스토리를 간략 요약 텍스트로 생성:
   - LLM 요약은 Phase 3로 미룸
   - 현재: 마지막 assistant 응답의 첫 200자 발췌 + 턴 수 표시
3. 요약 카드를 메인 타임라인에 삽입:
   - `message.new` 알림으로 전송
   - 특수 마커로 구분: content에 `<!-- branch-adopt-summary -->` 프리픽스

```python
summary_text = f"<!-- branch-adopt-summary -->\n🔀 **브랜치 '{label}' 채택됨**\n\n"
summary_text += f"> {last_response[:200]}{'...' if len(last_response) > 200 else ''}\n\n"
summary_text += f"*{turn_count}턴 대화 · {branch_id[:8]}*"
```

#### B-2. 클라이언트 요약 카드 렌더링 (`client/src/components/layout/ChatArea.tsx`)

`MessageView`에서 content가 `<!-- branch-adopt-summary -->`로 시작하면
일반 메시지 대신 **요약 카드 스타일**로 렌더링:

```
┌──────────────────────────────────┐
│ 🔀 브랜치 'retry-1' 채택됨       │
│                                  │
│ > 패턴 매칭 방식으로 리팩토링     │
│ > 했습니다. parseConfig를...     │
│                                  │
│ 3턴 대화 · abc12345              │
└──────────────────────────────────┘
```

- 배경: `bg-violet-500/5`, 좌측 보더: `border-l-2 border-violet-400`
- 호버 액션 없음 (일반 메시지와 구분)

---

## 하지 않는 것

- RT 비교 뷰 (Phase 3)
- RT 자동 브랜치 생성 (Phase 3)
- LLM 기반 브랜치 요약 (Phase 3 — 현재는 발췌)
- 브랜치 그래프에서 드래그앤드롭 리오더
- 브랜치 이름 인라인 편집

---

## 의존성

- `contextStore.convBranches`: 이미 서버에서 동기화됨 (project.context.result, branch.list.json.result)
- `chatStore.activeBranchId`: 이미 구현됨
- `wsClient` 브랜치 알림 핸들러 4개: 이미 구현됨
- `backend.py` 브랜치 RPC 핸들러 4개: 이미 구현됨

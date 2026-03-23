# 리팩토링 계획 — 2026-03-23

## 원칙

- 기능 변경 없이 구조만 개선
- 단계별 진행, 각 단계에서 테스트 통과 확인
- 기존 126개 유닛 테스트 유지

---

## Phase 1: wsClient handleNotification 분리 [높음]

**현황**: `wsClient.ts` 658줄, `handleNotification` 약 400줄 단일 switch문, 타입 단언 40+회

**작업**:
1. `lib/wsHandlers/` 디렉토리 생성
2. handler를 도메인별 파일로 분리:
   - `messageHandlers.ts` — message.new, message.update, message.delete
   - `runHandlers.ts` — run.status
   - `conversationHandlers.ts` — conversation.created, conversation.list.result, conversation.history.result, conversation.deleted
   - `branchHandlers.ts` — branch.created, branch.switched, branch.adopted, branch.archived, branch.deleted
   - `contextHandlers.ts` — project.context.result, branch.list.json.result, memory.list.json.result, engine.list.result
   - `commandHandlers.ts` — command.result
   - `codeHandlers.ts` — code.search.result, code.map.result
   - `phaseHandlers.ts` — discussion/synthesis/review/handoff results
3. 각 handler에 params 타입 인터페이스 정의 (as 제거)
4. `handleNotification`은 `handlers[method]?.(params, deps)` dispatch만 수행
5. deps: `{ chat, run, ctxStore, sysStore, wsClient, dbSync }`

**예상 효과**: wsClient.ts 200줄 이하로 축소, notification 타입 추가 시 해당 handler 파일만 수정

---

## Phase 2: MessageActions 중복 제거 [높음]

**현황**: `MessageActions.tsx` 431줄, Desktop hover bar와 Mobile context menu가 동일 로직 100% 중복

**작업**:
1. `hooks/useMessageActions.ts` 생성
   - 입력: `{ role, messageId, content, conversationId }`
   - 반환: handler 함수들 (copy, reply, edit, delete, branch, adopt, retry, save) + 브랜치 다이얼로그 상태
   - `resolvedConvId` 계산, `computeBranchLabel` 호출 등 공통 로직 포함
2. `MessageActions` (Desktop) — hook 사용 + hover bar UI만 렌더링
3. `MobileContextMenu` — hook 사용 + bottom sheet UI만 렌더링

**예상 효과**: 코드량 ~40% 감소, 버그 수정이 1곳으로 통합

---

## Phase 3: InputArea 컴포넌트 분리 [높음]

**현황**: `InputArea.tsx` 497줄, 5개 컴포넌트(CommandPalette, QuickChipEngine, QuickChipPersona, QuickChipTrigger, InputArea) 혼재

**작업**:
1. `components/chat/CommandPalette.tsx` — COMMANDS 정의 + CommandPalette 컴포넌트
2. `components/chat/QuickChips.tsx` — Engine/Persona/Trigger 3개 chip 컴포넌트
3. `InputArea.tsx` — 텍스트 입력 + 전송 로직만 유지

**예상 효과**: 각 파일 150줄 이하, 관심사 분리

---

## Phase 4: Sidebar 탭 분리 [중간]

**현황**: `Sidebar.tsx` 431줄, 7개 컴포넌트(BranchTab, MemoTab, ArchiveTab, SessionBranchGroup, MemoRow, EmptyTab, Sidebar)

**작업**:
1. `components/layout/sidebar/BranchTab.tsx`
2. `components/layout/sidebar/MemoTab.tsx`
3. `components/layout/sidebar/ArchiveTab.tsx`
4. `Sidebar.tsx` — 레이아웃 + Tabs 셸만 유지

---

## Phase 5: 공유 유틸 추출 [중간]

**작업**:
1. `lib/messageGrouping.ts` — `computeMsgMeta` 유틸 (ChatArea + BranchPanel 공유)
2. contextStore `convBranches` 이중 저장 → `convBranchesByProject`에서 파생하는 selector로 변경
3. wsClient `_pendingBranchCheckpoint` 제거 → pending map의 `req.params`에서 직접 참조

---

## Phase 6: 미사용 코드 정리 [낮음]

- `DiscussionState` 인터페이스 (chatStore) — RT 미구현, 미사용
- `Paperclip` 아이콘 + Attach 버튼 (InputArea) — 기능 미구현
- `SidebarTree`의 `ScrollArea` import — 상위에서 이미 감싸고 있음

---

## 실행 순서

```
Phase 1 (wsClient) → Phase 2 (MessageActions) → Phase 3 (InputArea)
  → Phase 4 (Sidebar) → Phase 5 (유틸) → Phase 6 (정리)
```

Phase 1~3은 서로 독립적이므로 병렬 가능하나, 충돌 방지를 위해 순차 진행 권장.
각 Phase 완료 후 `npx vitest run` + `npx tsc --noEmit` 통과 확인.

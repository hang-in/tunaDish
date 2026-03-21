# Handoff — 2026-03-22

## 이번 세션에서 변경한 코드

### 1. `__rpc__` 세션 사이드바 필터링
- **파일**: `client/src/lib/sidebarTreeData.ts:54`
- `!c.id.startsWith('__')` 조건 추가 → `__rpc__` 등 내부 세션이 사이드바에서 제외

### 2. BranchPanel — checkpoint 기반 부모 컨텍스트
- **파일**: `client/src/components/layout/BranchPanel.tsx`
- 기존: 부모 세션의 **마지막** user+assistant 쌍을 가져옴 (잘못된 로직)
- 수정: `contextStore.convBranchesByProject`에서 `checkpointId`를 조회, 해당 메시지와 그 대화 쌍을 정확히 가져옴
- `getParentContext()` → `getCheckpointContext(convId, checkpointId)`로 교체
- 부모 컨텍스트는 `opacity-50` + `── branch start ──` 구분선으로 시각 구분

### 3. 문서 구조 정리
```
docs/
  ├─ prd.md                    # 제품 요구사항
  ├─ briefing.md               # 기술 브리핑 + JSON-RPC 스펙
  ├─ development_plan.md       # Sprint 7 계획 (활성)
  ├─ test-plan.md              # 테스트 전략 (e2e 미착수)
  ├─ handoff.md                # 이 문서
  ├─ archive/                  # 완료된 문서
  │   ├─ sprint0~6_completion.md
  │   └─ google_stitch_prompt.md
  └─ prompts/
      ├─ feature/              # 기능 구현 프롬프트
      │   ├─ main-screen-redesign.md
      │   ├─ tunapi-branch-rt-schema.md
      │   ├─ tunadish-branch-transport.md
      │   └─ branch-view-and-adopt-summary.md
      ├─ architecture/         # 아키텍처/리팩토링 프롬프트
      │   ├─ unified-session-store.md
      │   ├─ branch-and-rt-implementation.md
      │   └─ branch-multiwindow.md
      └─ integration/          # 외부 시스템 통합 프롬프트
          ├─ rawq_integration.md
          └─ tunapi_project_details_api.md
```

## 미커밋 상태

루트 레포(`tunaDish/`)에 위 변경 사항들이 unstaged 상태로 남아 있음.
`client/` 하위에도 코드 변경(BranchPanel, sidebarTreeData 등)이 unstaged.
**다음 세션에서 루트에서 `git add` → `git commit` → `git push` 필요.**

## 검증 필요 사항

1. **BranchPanel checkpoint 컨텍스트**: 브랜치를 열었을 때 해당 메시지 쌍이 정확히 표시되는지 실제 확인 필요
2. **`__rpc__` 필터링**: 사이드바에서 `__rpc__` 세션이 사라졌는지 확인
3. **문서 이동**: git에서 rename으로 인식되는지 확인 (내용 동일하므로 `git add -A` 시 자동 인식)

## 이전 세션에서 구현 완료 (이번 세션 이전)

- 트리 라인 x좌표 off-by-one 수정 (SidebarTree.tsx)
- 메모리 삭제 파라미터 수정 (`memory_id` → `id`) + 옵티미스틱 UI 제거
- ReactMarkdown 커스텀 컴포넌트 (CodeBlock, ScrollTable, SafeLink)
- `@tailwindcss/typography` 설치 + prose 테이블 스타일링
- Slack 스타일 메시지 레이아웃 (버블 제거, 호버 배경)
- 테이블 폰트 통일 (14px, th:600/td:400)
- InputArea runStatus 브랜치 컨텍스트 수정

## 다음 우선순위

1. 커밋 & 푸시 (루트 레포에서)
2. BranchPanel 실제 동작 검증
3. Sprint 7 진입 — `development_plan.md` 6절 참고
   - 최우선: e2e 검증 파이프라인 (tunapi CLI 로딩 이슈 블로커)
   - JSON-RPC 정합성 테스트
   - 타임아웃/재연결 안정화

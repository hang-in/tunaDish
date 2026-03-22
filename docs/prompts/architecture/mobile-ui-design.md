# tunaDish 모바일 UI 설계 — 라운드테이블 토론 프롬프트

> 생성일: 2026-03-22
> 목적: Android 모바일 UI 설계 방향 합의 (RT 토론용)
> 대상: tunaDish 클라이언트 (`/client/src/`)
> 플랫폼: Android only (iOS 제외, CLAUDE.md 명시)

---

## 1. 배경

tunaDish는 AI CLI 에이전트(claude, gemini, codex) 전용 경량 채팅 클라이언트.
현재 데스크톱(Tauri v2) 전용으로 구현되어 있으며, Android 모바일 대응이 필요하다.

### 현재 데스크톱 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│  TopNav (40px, 커스텀 타이틀바 + 검색 + 창 컨트롤)              │
├──────────────┬──────────────────────────────────────┬───────────┤
│  Sidebar     │  ChatArea                           │ Branch    │
│  (180-256px) │  (flex-grow)                        │ Panel     │
│  프로젝트    │  메시지 스크롤                       │ (320-480) │
│  세션 트리   │                                      │ 슬라이드  │
│              ├──────────────────────────────────────┤           │
│              │  InputArea (bottom 고정)             │           │
│              │  QuickChips + textarea               │           │
└──────────────┴──────────────────────────────────────┴───────────┘
```

### 데스크톱에서 이미 있는 반응형 요소

- `lg` breakpoint(1024px) 기준 사이드바 자동 숨김/복원
- `lg:hidden` 모바일 오버레이 backdrop
- InputArea QuickChips에 `hidden sm:inline` 텍스트 숨김

### 모바일에서 완전히 없는 것

- 터치 인터페이스 (hover만 있음, 제스처/롱프레스 없음)
- 모바일 크기 레이아웃 (padding/font/avatar 전부 고정)
- safe area insets (notch, 홈 인디케이터)
- 모바일 키보드 대응 (가상 키보드 겹침)
- 모바일 네비게이션 패턴 (back button, bottom sheet)
- Tauri Android 타겟 설정

---

## 2. 토론 주제

### 주제 1: 모바일 레이아웃 전략

**선택지:**

A) **반응형 단일 코드베이스** — Tailwind breakpoint로 데스크톱/모바일 공존
   - 장점: 코드 하나, 유지보수 단순
   - 단점: 모바일 UX 타협, 복잡한 breakpoint 관리

B) **조건부 렌더링** — `useIsMobile()` 훅으로 데스크톱/모바일 컴포넌트 분기
   - 장점: 각 플랫폼에 최적화된 UX
   - 단점: 컴포넌트 중복, 유지보수 부담

C) **하이브리드** — 공통 로직(store, wsClient)은 공유, 레이아웃만 분기
   - 장점: 핵심 로직 중복 없이 UI만 분리
   - 단점: 어디까지 분기할지 경계 설정 필요

### 주제 2: 모바일 네비게이션 패턴

현재 데스크톱: 사이드바(좌) + 채팅(중) + 브랜치패널(우) 3-pane

모바일에서는 동시에 보여줄 수 없음. 선택지:

A) **탭 네비게이션 (Bottom Tab)**
```
┌──────────────────────┐
│  헤더 (프로젝트명)    │
├──────────────────────┤
│                      │
│  현재 탭 콘텐츠      │
│                      │
├──────────────────────┤
│  💬 채팅 │ 📁 세션 │ ⚙ 설정 │
└──────────────────────┘
```

B) **Drawer + Full-screen 전환**
```
┌──────────────────────┐
│ ☰ 프로젝트명  🔍     │  ← 햄버거 = drawer
├──────────────────────┤
│                      │
│  ChatArea (전체화면) │
│                      │
├──────────────────────┤
│  InputArea           │
└──────────────────────┘
```
- 사이드바 = left drawer (스와이프 또는 ☰)
- 브랜치패널 = bottom sheet 또는 전체화면 모달

C) **스택 네비게이션 (카카오톡/텔레그램 스타일)**
```
세션 목록 화면 → 채팅 화면 → 브랜치 화면
      ←  back      ← back
```

### 주제 3: 사이드바 → 모바일 변환

데스크톱 사이드바 요소:
- 프로젝트 목록 (트리 구조)
- 세션 목록
- 브랜치 목록
- Context & Memory 섹션
- API/DB 인디케이터

모바일에서 이것들을 어떻게 배치할지:
- drawer? bottom sheet? 별도 화면?
- 트리 구조를 모바일에서 유지할지, flat list로 변환할지

### 주제 4: 입력 영역 모바일 최적화

데스크톱 InputArea 구성:
- QuickChips (Engine, Model, Persona, Trigger 설정)
- textarea (자동 확장)
- 액션 버튼 (Send, Stop, Attach, Branch, Merge)
- Reply-to 인용 카드
- "다른 채널 처리 중" amber 배너

모바일에서:
- QuickChips를 어디에? (접을지, 별도 패널로 뺄지)
- 키보드 위에 InputArea 고정 처리
- 액션 버튼 축소/재배치

### 주제 5: 메시지 표시 모바일 조정

현재 데스크톱 메시지:
- padding: 20px 양쪽
- avatar: 32px 고정
- font: 13-14px 본문, 10-11px 메타
- 코드블록: shiki 구문 강조, 가로 스크롤
- hover action bar (복사, 답장, 브랜치, 삭제 등)

모바일에서 필요한 변경:
- padding 축소 (12px?)
- hover → 롱프레스 context menu
- 코드블록 가로 스크롤 터치 대응
- 터치 타겟 44x44px 최소 보장

### 주제 6: 검색 UI 모바일 대응

현재: TopNav 센터에 검색 인풋 + 드롭다운 오버레이
모바일에서: 검색 아이콘 → 탭하면 전체화면 검색 모드?

### 주제 7: 브랜치 패널 모바일 대응

현재: 우측 슬라이드 패널 (33vw, 320-480px)
모바일에서: 전체화면 모달? bottom sheet?

### 주제 8: Tauri Android 빌드 설정

- `tauri android init` 필요
- `minWidth`/`minHeight` 제거 또는 조건부
- 창 컨트롤(minimize/maximize/close) 숨김
- safe area insets 처리 방법
- WebView 차이 (WKWebView vs Android WebView)

---

## 3. 제약 조건

- **기존 데스크톱 UX를 깨뜨리지 않는다** — 모바일 대응은 추가, 데스크톱 회귀 금지
- **iOS 제외** — Android만 (CLAUDE.md 명시)
- **Tauri v2** — React Native/Flutter 아님, 웹뷰 기반
- **tunapi 서버 연결 전제** — WS URL은 모바일에서도 설정 가능해야 함
- **오프라인 미지원** — 항상 tunapi 서버 연결 필요
- **단계적 접근** — 한 번에 전부 하지 않음

---

## 4. 참고 레퍼런스

모바일 채팅 앱 UI 패턴:
- **Slack 모바일**: drawer + 스택 네비게이션, bottom sheet for threads
- **Discord 모바일**: 좌 스와이프=채널 목록, 우 스와이프=멤버 목록
- **Telegram**: 스택 네비게이션 (채팅 목록 → 채팅 → 검색)
- **ChatGPT 모바일**: 좌 drawer=대화 목록, 전체화면 채팅

---

## 5. 토론 진행 요청

이 문서를 기반으로 라운드테이블을 진행해주세요.

**참가 에이전트 역할:**
- **architect**: 전체 레이아웃 구조, 컴포넌트 분리 전략
- **ux-critic**: 모바일 UX 관점에서 사용성 검증, 터치 인터랙션 패턴
- **implementer**: 구현 난이도, Tauri/React 제약사항, 단계별 실행 계획

**기대 결과물:**
1. 각 토론 주제에 대한 합의안
2. 모바일 레이아웃 와이어프레임 (ASCII 또는 설명)
3. 구현 우선순위 + 단계별 계획
4. 데스크톱과 모바일의 공유/분기 경계 정의

---

## 6. 현재 코드 구조 (참고)

```
client/src/
├── components/
│   ├── chat/
│   │   ├── InputArea.tsx       # 입력 영역 (QuickChips, textarea, actions)
│   │   ├── MessageView.tsx     # 메시지 렌더링 (avatar, markdown, actions)
│   │   ├── MessageActions.tsx  # hover action bar
│   │   ├── MarkdownComponents.tsx  # 마크다운 + shiki 코드블록
│   │   ├── ActionToast.tsx     # 토스트 알림
│   │   └── BusyIndicator.tsx   # 실행 중 표시
│   ├── layout/
│   │   ├── TopNav.tsx          # 헤더 (로고, 검색, 창 컨트롤)
│   │   ├── Sidebar.tsx         # 사이드바 (트리, context, 인디케이터)
│   │   ├── SidebarTree.tsx     # 프로젝트/세션/브랜치 트리
│   │   ├── ChatArea.tsx        # 메인 채팅 영역
│   │   ├── BranchPanel.tsx     # 브랜치 슬라이드 패널
│   │   ├── ContextPanel.tsx    # 컨텍스트 패널 (우측)
│   │   └── MessageSearchResults.tsx  # 검색 드롭다운
│   └── ui/                    # shadcn/ui 공용 컴포넌트
├── store/                     # Zustand stores
├── lib/                       # wsClient, db, dbSync, shiki
└── App.tsx                    # 루트 레이아웃 (3-pane)
```

### 핵심 파일별 모바일 영향도

| 파일 | 영향도 | 설명 |
|------|--------|------|
| `App.tsx` | **높음** | 전체 레이아웃 구조 변경 필요 |
| `TopNav.tsx` | **높음** | 창 컨트롤 숨김, 검색 축소, 모바일 헤더 |
| `Sidebar.tsx` | **높음** | drawer/bottom sheet 변환 |
| `InputArea.tsx` | **높음** | 키보드 대응, QuickChips 축소 |
| `ChatArea.tsx` | 중간 | padding/scroll 조정 |
| `MessageView.tsx` | 중간 | 터치 타겟, 롱프레스 메뉴 |
| `BranchPanel.tsx` | 중간 | 전체화면 모달 변환 |
| `SidebarTree.tsx` | 중간 | 터치 타겟 확대, 트리 구조 조정 |
| `MessageActions.tsx` | 중간 | hover → 롱프레스 변환 |
| store/, lib/ | **낮음** | 변경 불필요 (공유) |

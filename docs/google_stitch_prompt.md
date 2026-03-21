# Google Stitch 용 UI 리팩토링 프롬프트

> **사용자님 가이드**: 아래 내용을 복사하여 Google Stitch (혹은 UI 생성 AI)에게 전달하시면 됩니다. tunaDish 프로젝트의 프론트엔드 폴더(`tunaDish/client`) 권한 혹은 기반 파일(`Sidebar.tsx`, `ChatArea.tsx`, `index.css`, `tailwind.config.js`) 컨텍스트를 함께 제공하면 더욱 완벽하게 동작합니다.

---

## 🎯 **Objective**
첨부해 드린 레퍼런스 이미지(현재 `tunaDish` 앱의 화면)를 참고하여, 데스크탑 AI 에이전트 클라이언트의 전체 UI 뼈대와 컴포넌트를 **완전히 처음부터 새롭게 만들어(Create)** 주세요. 
가장 중요한 점은, 레이아웃의 형태는 유지하되 전체적인 테마와 디자인 규격을 **Linear.app**의 실제 워크스페이스(Application) UI와 완벽하게 유사하도록 조밀하고 세련되게 디자인하는 것입니다. (단, 랜딩 페이지 기반이 아닌 실제 앱 UI 기준입니다.)

## 🗂️ **Tech Stack**
- React 18 + TypeScript + Vite
- Tailwind CSS v3
- `@phosphor-icons/react` (모든 아이콘은 Phosphor Icons 사용)
- 폰트: `@fontsource-variable/geist` (본문용), `@fontsource-variable/jetbrains-mono` (코드블록용)
- 상태 관리: Zustand (`useChatStore`, `useRunStore`)
- 컨테이너: Tauri (데스크탑 윈도우)

## 🎨 **Design System (Linear App Aesthetic)**

Linear 앱 특유의 밀도 높고 깔끔하며 "전문적인 개발자 도구" 같은 느낌을 내야 합니다.
아래의 디자인 토큰과 규칙을 `tailwind.config.js` 또는 `index.css`의 CSS 변수로 세팅하고, 컴포넌트에 엄격하게 적용해 주세요.

### 1. Typography & Text Sizing
- **기본 텍스트 크기**: `13px` (단일 base 크기로 아주 작고 촘촘하게)
- **메타 데이터 및 라벨**: `12px` 또는 `11px` (키보드 단축키, 상태 표시 등)
- **Title (헤더, 사이드바 상단 등)**: `14px` (Weight: 500, 600)
- **Font Family**: `font-sans`는 `Geist Variable`, `font-mono`는 `JetBrains Mono`로 강제.
- **가독성 옵션**: `-webkit-font-smoothing: antialiased;` 강제.
- **색상 원칙**:
  - `text-foreground`: 순백색(`white` 또는 `#ededed`)으로 완전히 활성화된 값.
  - `text-muted-foreground`: `#888888` 수준의 어두운 회색으로 비활성 탭, 부가 설명에 사용.

### 2. Colors & Dark Mode (다크모드 전용으로 최적화)
- **Background (`--background`)**: 완전한 검은색이 아닌 어두운 회색 `#0e0e0e` 또는 `#141414`.
- **Sidebar (`--sidebar`)**: 배경보다 아주 살짝만 더 어두운 `#111111` 또는 배경과 동일한 색상.
- **Card / Dropdown (`--card`)**: 요소를 띄울 때 사용하는 판은 `#1e1e1e` + 희미한 border `#2a2a2a`.
- **Primary / Accent (`--primary`)**: 채도가 살짝 빠진 세련된 인디고/블루 `#5E6AD2`.
- **Hover States**: 어두운 패널 위에서 버튼에 마우스를 올렸을 때 `bg-white/5` 혹은 `bg-white/10`을 사용하여 매우 연하고 은은하게 표현.

### 3. Spacing & Borders
- **밀도**: 패딩과 마진을 최소화하여 한 화면에 많은 정보가 보이도록 밀도 있게(`Dense`) 구성. (주로 `p-1`, `p-1.5`, `py-[3px]` 등의 세밀한 수치 사용).
- **아웃라인 & 포커스**: Focus 상태일 때 두꺼운 링보다, `outline-none` 처리 후 얇은 1px border나 희미한 box-shadow(inset)를 선호. Focus 시 `--ring` 색상(`5E6AD2/50`) 사용.
- **Border Radius**: 패널/모달은 `6px` ~ `8px`, 작은 버튼/항목은 `4px`로 미세하게 라운딩.
- **구분선**: Border 색상은 `#222222` 또는 `rgba(255,255,255,0.08)`를 사용하여 눈에 띄지 않게 은은하게 나눔.

### 4. Components Implementation
첨부된 이미지를 바탕으로 아래 세부 컴포넌트들을 **다음과 같은 원칙으로 새롭게 구현**해 주세요:
1. **`index.css` & `tailwind.config.js` 설정 제안**
   - 상기 명시된 다크모드 색상과 텍스트 스타일을 Root CSS 변수로 완전히 매핑하는 기초 설정 뼈대를 제공해 주세요.
2. **`Sidebar.tsx` (좌측 네비게이션)**
   - 최상단 앱 타이틀 영역을 Linear의 워크스페이스 스위처처럼 작고 깔끔하게 배치.
   - 프로젝트 폴더 및 대화 스레드 목록에서 Phosphor Icon(`weight="bold"` 또는 `fill`)을 사용하되, 크기를 `14px` ~ `12px`로 작게 맞춥니다.
   - Hover 시 `bg-white/5` 적용, 선택된(액티브) 항목은 배경 효과와 함께 텍스트가 밝은 하얀색(`text-foreground`)으로 선명해지도록 처리.
3. **`ChatArea.tsx`**
   - 상단 헤더 컨테이너를 Linear의 이슈 상세 페이지 헤더처럼 하단 보더를 가늘게 치고, 상태(Working/Idle) 뱃지, 브랜치 아이콘 등을 밀도 있게 일렬로 배치 (`h-[44px]` 유지).
   - **채팅 말풍선**: 말풍선 컨테이너(Bubble) 대신, 투명 배경(`bg-transparent`) 위에 좌측 에이전트 아바타(Phosphor Icon `Robot`, `User`)를 배치하고 우측에 텍스트가 나열되는 전형적인 수직 스레드 형태로 구성. (Linear의 코멘트 스레드 UI 참조)
   - **마크다운 & 코드블록**: 코드블록 배경은 `#111` 또는 `#0d0d0d` + `border border-white/10` 적용.
   - **Input Box**: Linear 이슈 작성기처럼 바닥에 붙어있는 깔끔한 에디터. Border를 `white/10`으로 두르고 Focus 시 `border-primary/50`으로 은은히 빛나게 처리. 여백을 줄이고 `PaperPlaneRight` 아이콘을 전송 버튼으로 사용.

## 🗂️ **UI Architecture & Features Breakdown**

코드를 직접 수정할 수 없는 경우를 대비해, 화면을 크게 3가지 영역(3-Panel)으로 나눈 구조와 반드시 포함해야 할 기능 요소를 설명합니다.

### 1. Left Panel (Sidebar - 200px ~ 250px)
앱의 네비게이션을 담당하는 좌측 고정 패널입니다.
- **Top Header**: 앱 이름(`tunaDish`)과 설정/사이드바 토글 아이콘 패널.
- **Project Tree**: 사용자가 참여 중인 프로젝트/폴더 목록.
  - 클릭 수축/확장 기능(토글 화살표 아이콘).
  - 프로젝트 하위에는 개별 대화(Conversation, Branch, Discussion) 스레드 목록이 존재함.
  - 대화 스레드 아이콘 (기본 채팅, 브랜치 모양, 그룹 채팅 모양 구분).
  - 마우스를 올릴 때만 보이는 **New session (+)** 버튼.
- **Bottom Footer**: 앱의 백엔드 연결 상태(`Connected` - 초록불, `Offline` - 회색/빨간불, `Preview` - 노란불)를 나타내는 아주 작은 뱃지 영역.

### 2. Center Panel (Main Chat Area - Flex)
AI 에이전트와 사용자가 대화를 나누는 중앙 넓은 영역입니다.
- **Top Header (`h-[42px]`)**: 
  - 좌측: 현재 열려있는 대화의 경로 및 이름 (예: `Project Name > Main Branch`).
  - 우측: 현재 AI 에이전트의 구동 상태 표시 (예: 스피너와 함께 `Working...` 혹은 중지 시 `Stopping...`). 추가로 브랜치 병합(`Merge`) 및 버리기(`Abandon`) 아이콘.
- **Message List (Scrollable Area)**: 
  - 위에서 아래로 쌓이는 메시지 스레드.
  - **User Message**: 배경이 살짝 들어간 아바타(User 아이콘)와 "You", "시간" 라벨 조합. 일반 텍스트 포맷.
  - **Agent Message**: AI 로봇 아바타와 "Agent", "시간" 라벨 조합. **Markdown 렌더링**을 완벽하게 지원하는 긴 텍스트와 코드 블록 위주.
- **Input Area (Bottom Pinned)**: 
  - 화면 하단에 고정된 텍스트 입력창 세트 (Linear의 코멘트 및 이슈 생성기 UI 참고 바람).
  - 포커스 시 은은한 ring(`primary` 색상) 효과.
  - 내부 요소: 멀티라인 가능한 Textarea, 좌측 하단에 파일 첨부(`Paperclip`) 및 마크다운 프리뷰 전환(`MarkdownLogo`), 우측 하단에 취소(Stop) 및 전송(Send - 활성화 시 색상 변환) 아이콘 버튼 배치.

### 3. Right Panel (Context Panel - 250px ~ 300px, 닫기 가능)
향후 에이전트 설정이나 컨텍스트(파일, Diff)를 표시하기 위한 우측 패널입니다.
- 현재는 `Context Area`라는 타이틀만 존재하는 단순한 사이드바 틀 수준으로만 구현해 두면 됩니다.

---

📌 **Stitch AI님을 위한 요약**: 위 1~3번의 레이아웃 설명을 토대로, 컴포넌트 내부의 세분화된 HTML/React 구조와 Tailwind 클래스만 `Linear.app`의 B2B SaaS 느낌(다크모드 전문 툴)으로 정밀하게 추출해서 짜주시면 됩니다. 랜딩/마케팅 페이지의 화려함보다는 **조밀하고 정보 밀도가 높은 개발자 환경(IDE)**의 차분한 CSS 테마 구성을 우선시해 주세요!

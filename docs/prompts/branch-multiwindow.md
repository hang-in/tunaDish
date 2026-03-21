# 브랜치 멀티윈도우 구현 계획

> 목적: 브랜치 뷰를 메인 창 위의 floating panel이 아닌, 독립된 OS 네이티브 창으로 분리한다.
> 범위: Tauri 윈도우 생성 + React 라우팅 + 기존 floating panel 제거

## 결론

현재 `position: fixed` floating panel로 구현된 브랜치 뷰를 Tauri `WebviewWindow`로 전환한다.
메인 창은 그대로 유지되고, 브랜치 작업은 별도 네이티브 창에서 진행된다.

## 왜 별도 창인가

| 기준 | Floating Panel (현재) | 별도 네이티브 창 |
|------|---------------------|-----------------|
| 메인 채팅 가림 | O (55vw 차지) | X |
| 듀얼 모니터 | 불가 | 가능 |
| 창 크기 자유도 | 고정 비율 | OS 레벨 자유 |
| 구현 복잡도 | 낮음 | 중간 (Tauri 커맨드 추가) |
| 모바일 | 사용 불가 (너무 좁음) | 해당 없음 (데스크톱 전용) |

## 현재 상태

### Tauri 설정
- Tauri v2, 단일 창 (`tauri.conf.json`에 `main` 창만 정의)
- `capabilities/default.json`에 `main` 창 권한만 설정
- `lib.rs`에 `greet()` 커맨드만 등록

### 브랜치 뷰 상태 관리
- `systemStore.ts`: `branchViewMode`, `branchGraphOpen`, `branchGraphWidth`
- `chatStore.ts`: `activeBranchId`, `activeBranchLabel`
- `wsClient.ts`: `branch.created` → `setBranchViewMode(true)`, `branch.adopted` → `setBranchViewMode(false)`

### 현재 렌더링 (App.tsx)
```
메인 레이아웃 (Sidebar + ChatArea + ContextPanel)
└── {branchViewMode && <FloatingPanel> ... </FloatingPanel>}
```

## 아키텍처 설계

### 핵심 원칙

각 Tauri 윈도우는 독립된 웹뷰(JS 컨텍스트)를 가진다. 따라서:

1. **각 창은 자체 Zustand 스토어 인스턴스**를 가짐
2. **각 창은 자체 WebSocket 연결**을 가짐 (동일 tunapi 서버)
3. **창 간 상태 동기화는 불필요** — 백엔드가 단일 진실 소스

### 윈도우 구분 방식

Tauri 2에서는 `WebviewWindow.label`로 창을 식별한다.
브랜치 창은 URL 쿼리 파라미터로 초기 컨텍스트를 전달받는다.

```
메인 창:   label="main"    url="/"
브랜치 창: label="branch-{id}" url="/?branch={branchId}&conv={convId}&label={branchLabel}"
```

### 컴포넌트 렌더링 분기

```
App.tsx
├── isBranchWindow ? (URL 파라미터 감지)
│   └── BranchWindow (BranchGraphPanel + ChatArea)
└── MainWindow (기존 레이아웃)
```

## 구현 범위

### Phase 1: Tauri 윈도우 인프라

**`src-tauri/src/lib.rs`** — 브랜치 창 열기/닫기 커맨드 추가

```rust
#[tauri::command]
fn open_branch_window(
    app: tauri::AppHandle,
    branch_id: String,
    conv_id: String,
    label: String,
) -> Result<(), String> {
    let window_label = format!("branch-{}", &branch_id[..8.min(branch_id.len())]);
    let url_path = format!(
        "/?branch={}&conv={}&label={}",
        branch_id, conv_id, label
    );
    tauri::WebviewWindowBuilder::new(&app, &window_label, tauri::WebviewUrl::App(url_path.into()))
        .title(format!("Branch: {}", label))
        .inner_size(900.0, 700.0)
        .min_inner_size(600.0, 400.0)
        .center()
        .decorations(false)  // 메인 창과 동일 스타일
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn close_branch_window(app: tauri::AppHandle, branch_id: String) -> Result<(), String> {
    let window_label = format!("branch-{}", &branch_id[..8.min(branch_id.len())]);
    if let Some(window) = app.get_webview_window(&window_label) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

**`src-tauri/capabilities/default.json`** — 브랜치 창 권한 추가

```json
{
  "windows": ["main", "branch-*"],
  "permissions": [...]
}
```

### Phase 2: React 라우팅

**`client/src/lib/windowContext.ts`** (신규) — 창 컨텍스트 감지

```typescript
export interface BranchWindowParams {
  branchId: string;
  convId: string;
  label: string;
}

export function getBranchWindowParams(): BranchWindowParams | null {
  const params = new URLSearchParams(window.location.search);
  const branchId = params.get('branch');
  const convId = params.get('conv');
  const label = params.get('label');
  if (!branchId || !convId) return null;
  return { branchId, convId, label: label || branchId.slice(0, 8) };
}

export function isBranchWindow(): boolean {
  return getBranchWindowParams() !== null;
}
```

**`client/src/lib/tauriBridge.ts`** (신규) — Tauri invoke 래퍼

```typescript
import { invoke } from '@tauri-apps/api/core';

export async function openBranchWindow(branchId: string, convId: string, label: string) {
  await invoke('open_branch_window', { branchId, convId, label });
}

export async function closeBranchWindow(branchId: string) {
  await invoke('close_branch_window', { branchId });
}
```

### Phase 3: App.tsx 분기

**`client/src/App.tsx`** — 조건부 렌더링

```typescript
import { isBranchWindow } from '@/lib/windowContext';

function App() {
  if (isBranchWindow()) {
    return <BranchApp />;
  }
  return <MainApp />;  // 기존 레이아웃
}
```

**`client/src/BranchApp.tsx`** (신규) — 브랜치 전용 레이아웃

```
TopNav (간소화: 브랜치 이름 + 닫기 버튼)
├── BranchGraphPanel (왼쪽, 접이식)
└── ChatArea (메인 영역, activeBranchId 세팅된 상태)
```

브랜치 창이 열릴 때:
1. URL 파라미터에서 `branchId`, `convId` 추출
2. `chatStore.setActiveConversation(convId)` 호출
3. `chatStore.setActiveBranch(branchId, label)` 호출
4. WebSocket 연결 → `project.context` 요청

### Phase 4: 이벤트 핸들링 변경

**`client/src/lib/wsClient.ts`** — 브랜치 생성 시 창 열기로 전환

```typescript
case 'branch.created': {
  const branchId = params.branch_id as string;
  const label = params.label as string;
  const convId = params.conversation_id as string;

  if (isBranchWindow()) {
    // 브랜치 창 안에서 새 브랜치 생성 → 내부 전환
    chat.setActiveBranch(branchId, label);
  } else {
    // 메인 창에서 브랜치 생성 → 별도 창 열기
    openBranchWindow(branchId, convId, label);
  }
  break;
}

case 'branch.adopted': {
  if (isBranchWindow()) {
    // 브랜치 창 닫기
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().close();
  }
  break;
}
```

### Phase 5: 정리

- `App.tsx`에서 floating panel 코드 제거 (`branchViewMode && <div className="fixed ...">`)
- `systemStore.ts`에서 `branchViewMode` 상태 제거 (더 이상 불필요)
- `BranchIndicator`의 "Open Branch View" 클릭 → `openBranchWindow()` 호출로 변경

## 제거 대상

| 파일 | 제거 항목 |
|------|---------|
| `App.tsx` | floating panel 전체 (라인 173-207), `branchViewMode` 읽기, `startResizing('branch')` |
| `systemStore.ts` | `branchViewMode`, `setBranchViewMode()` |
| `wsClient.ts` | `setBranchViewMode(true/false)` 호출 |

## 유지 대상

| 항목 | 이유 |
|------|------|
| `BranchGraphPanel.tsx` | 브랜치 창 내부에서 그대로 사용 |
| `BranchIndicator.tsx` | 메인 창에서 브랜치 존재 표시 + 클릭으로 창 열기 |
| `chatStore.activeBranchId` | 브랜치 창의 store에서 사용 |
| `branchGraphOpen`, `branchGraphWidth` | 브랜치 창 내부 레이아웃에서 사용 |

## 변경 금지

- WebSocket 프로토콜 (`branch.create`, `branch.switch` 등 RPC 스펙)
- 백엔드 transport 코드
- BranchAdoptCard, MessageActions의 기존 동작

## 작업 순서

1. Tauri 커맨드 추가 (`lib.rs`: `open_branch_window`, `close_branch_window`)
2. 권한 설정 업데이트 (`capabilities/default.json`)
3. `windowContext.ts`, `tauriBridge.ts` 유틸 생성
4. `BranchApp.tsx` 생성 (브랜치 전용 레이아웃)
5. `App.tsx` 분기 추가 + floating panel 제거
6. `wsClient.ts` 이벤트 핸들링 변경
7. `BranchIndicator.tsx` 클릭 핸들러 변경
8. `systemStore.ts`에서 `branchViewMode` 정리
9. 빌드 및 수동 테스트

## 위험 요소

| 위험 | 대응 |
|------|------|
| 브랜치 창의 WS 재연결 | 기존 `wsClient` 로직이 각 창에서 독립 동작 — 추가 처리 불필요 |
| 브랜치 창 닫은 후 메인에서 context 갱신 | `branch.adopted` 이벤트가 메인 WS에도 전달됨 — `project.context` 재요청으로 처리 |
| 동일 브랜치 창 중복 열기 | `Tauri::get_webview_window(label)` 확인 후 이미 있으면 focus만 |
| 모바일 (Android) | Tauri 모바일에서는 멀티윈도우 미지원 — 모바일에서만 기존 floating panel 유지 가능 |

## 검증

- 메인 창에서 브랜치 생성 → 별도 네이티브 창 열림
- 브랜치 창에서 대화 진행 가능
- 브랜치 adopt → 창 자동 닫힘
- BranchIndicator 클릭 → 브랜치 창 열림 (또는 기존 창 focus)
- 메인 창 조작이 브랜치 창에 의해 차단되지 않음
- 브랜치 창 수동 닫기 시 메인 창 정상 동작

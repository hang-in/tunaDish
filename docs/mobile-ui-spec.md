# tunaDish Mobile UI Specification

> Roundtable consensus document — implementation-ready spec for mobile (Android) UI adaptation.
> Date: 2026-03-22

---

## 1. Design Decision Summary

| Area | Decision | Rationale |
|------|----------|-----------|
| Layout Strategy | **Hybrid C** — Desktop/Mobile shell split at `App.tsx` level | Shared store/lib/chat components, only layout shell diverges |
| Navigation | **Drawer + Bottom Sheet + Full-screen Search** | Single-conversation focus; ChatGPT mobile pattern |
| InputArea | **Compact summary chip + bottom sheet settings** | Virtual keyboard space preservation |
| Message Actions | **Long-press context menu** (replace hover action bar) | No hover on touch devices |
| Search | **Full-screen overlay** (Telegram pattern) | Touch target size on mobile |
| Branch Panel | **Bottom sheet** (50%/75% snap points) | Maintain chat context while browsing branches |
| Component Boundary | `layout/` folder = mobile variant allowed; `chat/` folder = responsive CSS only | Prevent `if(mobile)` proliferation |

---

## 2. File Scope & Boundaries

### Files that get mobile variants (layout/)

| Current File | Mobile Variant | Action |
|-------------|---------------|--------|
| `App.tsx` | `App.tsx` (conditional render) | Add `useIsMobile()` gate → `<MobileShell>` vs `<DesktopShell>` |
| `components/layout/TopNav.tsx` | `components/layout/MobileHeader.tsx` | New file — simplified header |
| `components/layout/Sidebar.tsx` | `components/layout/MobileDrawer.tsx` | New file — swipeable drawer |
| `components/layout/BranchPanel.tsx` | `components/layout/MobileBranchSheet.tsx` | New file — bottom sheet |
| N/A | `components/layout/MobileSearch.tsx` | New file — full-screen search overlay |
| N/A | `components/layout/BottomSheet.tsx` | New file — reusable bottom sheet primitive |

### Files that use responsive CSS only (NO mobile variant)

- `components/chat/MessageView.tsx` — padding/avatar adjustments via Tailwind
- `components/chat/MarkdownComponents.tsx` — code block overflow touch scroll
- `components/chat/ActionToast.tsx` — no change needed
- `components/chat/BusyIndicator.tsx` — no change needed
- `components/chat/InputArea.tsx` — single file, internal `<QuickChipsCompact>` vs `<QuickChipsFull>` branch

### Files with NO changes

- `store/*` — all stores shared as-is
- `lib/*` — wsClient, db, shiki, utils shared as-is
- `components/ui/*` — shadcn components shared as-is

---

## 3. New Hook: `useIsMobile()`

**File**: `src/lib/useIsMobile.ts` (new)

```typescript
import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < MOBILE_BREAKPOINT;
  });

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
```

**Detection criteria** (ordered by priority):
1. `window.innerWidth < 768` — primary signal, matches Tailwind `md:` breakpoint
2. Future enhancement: `@media (pointer: coarse)` for hybrid devices

Do NOT use `os.type()` as the sole criterion. A wide tablet in landscape should use desktop layout.

---

## 4. App.tsx Layout Split

**Current**: Single layout with responsive sidebar hiding at `lg:` (1024px).

**New structure**:

```tsx
// App.tsx
import { useIsMobile } from './lib/useIsMobile';
import { DesktopShell } from './components/layout/DesktopShell';
import { MobileShell } from './components/layout/MobileShell';

function App() {
  const isMobile = useIsMobile();

  useEffect(() => {
    hydrateFromDb().then(() => wsClient.connect());
  }, []);

  return isMobile ? <MobileShell /> : <DesktopShell />;
}
```

**DesktopShell**: Extract current `App.tsx` layout logic (lines 14–135) into `components/layout/DesktopShell.tsx` unchanged.

**MobileShell**: New component described in section 5.

---

## 5. MobileShell Layout

**File**: `src/components/layout/MobileShell.tsx` (new)

### 5.1 Visual Structure

```
┌──────────────────────────┐
│ ☰  ProjectName     🔍   │  ← MobileHeader (48px, safe-area-aware)
├──────────────────────────┤
│                          │
│  ChatArea                │
│  (full width, flex-1)    │
│                          │
├──────────────────────────┤
│  SettingsSummary (1 line)│  ← "opus4.6 · default · always" tap → bottom sheet
│  [textarea]              │
│  [+ attach]  [Send ▸]   │  ← InputArea compact
└──────────────────────────┘
```

### 5.2 Component Tree

```tsx
<div className="flex flex-col h-[var(--vvh,100vh)] bg-surface-container-lowest overflow-hidden">
  {/* Safe area top */}
  <div style={{ height: 'env(safe-area-inset-top)' }} className="bg-[#0e0e0e] shrink-0" />

  <MobileHeader />

  <main className="flex-1 overflow-hidden relative">
    <ChatArea />
  </main>

  {/* Safe area bottom */}
  <div style={{ height: 'env(safe-area-inset-bottom)' }} className="bg-[#161616] shrink-0" />

  {/* Overlays (portaled) */}
  <MobileDrawer />
  <MobileBranchSheet />
  <MobileSearch />
  <MobileSettingsSheet />
</div>
```

### 5.3 Viewport Height CSS Variable

Add to `index.css` at the top of `@layer base`:

```css
:root {
  --vvh: 100vh; /* fallback */
}
```

Add to `MobileShell.tsx` (or a shared hook `useVisualViewport.ts`):

```typescript
// src/lib/useVisualViewport.ts (new)
import { useEffect } from 'react';

export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
}
```

**Why**: On mobile, `100vh` includes the area behind the virtual keyboard. `visualViewport.height` gives the actual visible area. This must be wired up in P1 (not deferred to P2).

---

## 6. MobileHeader

**File**: `src/components/layout/MobileHeader.tsx` (new)

```
┌──────────────────────────┐
│ ☰  Current Project  🔍  │
└──────────────────────────┘
```

### Spec

| Element | Behavior |
|---------|----------|
| Height | 48px (touch-friendly) |
| Left: Hamburger `☰` | Opens `MobileDrawer` via `useSystemStore.setSidebarOpen(true)` |
| Center: Project/conversation name | Truncated, non-interactive |
| Right: Search icon `🔍` | Opens `MobileSearch` overlay |

**No window controls** (Minimize/Maximize/Close) — Tauri Android uses native chrome.

### Implementation Notes

- No `appWindow.startDragging()` — not applicable on Android
- Use `@tauri-apps/api/core` to detect platform: skip `getCurrentWindow()` import on Android
- Reuse existing Phosphor icons: `List` (hamburger), `MagnifyingGlass` (search)

---

## 7. MobileDrawer (Sidebar replacement)

**File**: `src/components/layout/MobileDrawer.tsx` (new)

### Behavior

- Triggered by: hamburger tap OR left-edge swipe (touch start within 20px of left edge)
- Width: 85vw, max 320px
- Backdrop: `bg-black/60 backdrop-blur-sm` (matches current overlay style)
- Close: backdrop tap, swipe left, or programmatic
- Animation: `translateX(-100%) → translateX(0)`, 300ms ease-out

### Content

Reuse `<Sidebar />` component directly inside the drawer. The sidebar component itself does not change — only its container (fixed overlay vs inline panel) changes.

```tsx
<div className="fixed inset-0 z-50">
  {/* Backdrop */}
  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
  {/* Drawer */}
  <div className="absolute left-0 top-0 bottom-0 w-[85vw] max-w-[320px] bg-[#131313]">
    <Sidebar />
  </div>
</div>
```

### Tree Navigation on Mobile

- Keep existing tree structure (no flattening)
- Increase touch target: `min-height: 44px` on `.sidebar-item` when mobile
- Reduce indent for depth ≥ 3: cap at `--sidebar-indent-l2 * 2`
- Add CSS rule in `index.css`:

```css
@media (max-width: 767px) {
  .sidebar-item {
    min-height: 44px;
  }
}
```

---

## 8. InputArea Mobile Adaptation

**File**: `src/components/chat/InputArea.tsx` (existing — modify in place)

### Changes

The InputArea remains a single component. Use `useIsMobile()` internally for two differences:

#### 8.1 QuickChips → Summary Chip (mobile)

**Desktop** (unchanged): Three separate QuickChip dropdowns (Engine, Persona, Trigger).

**Mobile**: Replace with a single summary line that opens a bottom sheet:

```tsx
// Inside InputArea, above textarea:
{isMobile ? (
  <button
    onClick={() => openSettingsSheet()}
    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-on-surface-variant/60"
  >
    <Lightning size={12} className="text-primary" />
    <span>{engine}/{model}</span>
    <span className="text-on-surface-variant/30">·</span>
    <span>{persona || 'default'}</span>
    <span className="text-on-surface-variant/30">·</span>
    <span>{trigger}</span>
    <CaretDown size={10} className="opacity-40" />
  </button>
) : (
  <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-0">
    <QuickChipEngine ... />
    <QuickChipPersona ... />
    <QuickChipTrigger ... />
  </div>
)}
```

#### 8.2 Action Buttons (mobile)

**Desktop** (unchanged): Attach left, Stop + Send right.

**Mobile**:
- **Always visible**: Send button only
- **Hidden behind `+` overflow**: Attach, Branch info, Merge button
- Git branch indicator: hidden on mobile (available via drawer)

```tsx
{isMobile ? (
  <div className="absolute bottom-3 left-3 flex items-center gap-1">
    <OverflowMenu /> {/* +: Attach, Branch, Merge */}
  </div>
) : (
  /* existing desktop layout */
)}
```

#### 8.3 Keyboard Behavior

- On textarea focus, the `--vvh` CSS variable automatically adjusts via `useVisualViewport()`
- After keyboard opens, scroll last message into view:

```typescript
useEffect(() => {
  if (isMobile && document.activeElement === textareaRef.current) {
    // Scroll chat to bottom when keyboard appears
    const timer = setTimeout(() => {
      document.querySelector('[data-messages-end]')?.scrollIntoView({ behavior: 'smooth' });
    }, 300); // wait for keyboard animation
    return () => clearTimeout(timer);
  }
}, [/* visualViewport height changes */]);
```

#### 8.4 Textarea Sizing (mobile)

- Remove `min-h-[100px]` on mobile — use `min-h-[44px]` instead
- Keep `max-h-[300px]` → change to `max-h-[120px]` on mobile
- `pb-[52px]` → `pb-[44px]` on mobile

---

## 9. MobileSearch (Full-screen Overlay)

**File**: `src/components/layout/MobileSearch.tsx` (new)

### Behavior

- Triggered by: search icon in MobileHeader
- Full-screen overlay (`fixed inset-0 z-60`)
- Auto-focus input on open
- Back arrow or swipe-right to close
- Reuse existing `MessageSearchResults` component for results

### Layout

```
┌──────────────────────────┐
│ ← [search input_______]  │  ← 48px header
├──────────────────────────┤
│                          │
│  MessageSearchResults    │
│  (full height scroll)    │
│                          │
└──────────────────────────┘
```

### Implementation

```tsx
export function MobileSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-[#0e0e0e] flex flex-col">
      <div className="flex items-center gap-2 px-3 h-12 border-b border-outline-variant/30 shrink-0">
        <button onClick={onClose} className="p-2">
          <ArrowLeft size={20} />
        </button>
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="메시지 검색..."
          className="flex-1 bg-transparent text-[14px] outline-none"
        />
        {query && (
          <button onClick={() => setQuery('')}>
            <X size={16} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {query.trim().length >= 2 && (
          <MessageSearchResults
            query={query}
            onSelect={() => { onClose(); setQuery(''); }}
          />
        )}
      </div>
    </div>
  );
}
```

---

## 10. MobileBranchSheet (Bottom Sheet)

**File**: `src/components/layout/MobileBranchSheet.tsx` (new)

### Behavior

- Triggered by: branch indicator tap, or `openBranchPanel()` action
- Bottom sheet with two snap points: 50vh, 75vh
- Drag handle at top (pill indicator)
- Swipe down to dismiss
- Content: reuse `BranchPanel` inner content (messages + input)

### Snap Point Logic

```typescript
const SNAP_POINTS = [0.5, 0.75]; // fraction of viewport height
const [snapIndex, setSnapIndex] = useState(0);

// Drag end: snap to nearest point or dismiss if below 30%
const handleDragEnd = (translateY: number) => {
  const ratio = 1 - translateY / window.innerHeight;
  if (ratio < 0.3) { close(); return; }
  const nearest = SNAP_POINTS.reduce((prev, curr) =>
    Math.abs(curr - ratio) < Math.abs(prev - ratio) ? curr : prev
  );
  setSnapIndex(SNAP_POINTS.indexOf(nearest));
};
```

### Content

```tsx
<BottomSheet open={branchPanelOpen} onClose={closeBranchPanel} snapPoints={[0.5, 0.75]}>
  {/* Header */}
  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-outline-variant/30">
    <GitFork size={16} className="text-violet-400" />
    <span className="font-medium text-[13px] text-violet-300 truncate flex-1">{label}</span>
    <button onClick={handleAdopt}>
      <GitMerge size={16} />
    </button>
    <button onClick={handleArchive}>
      <Archive size={16} />
    </button>
  </div>

  {/* Messages — scrollable */}
  <div className="flex-1 overflow-y-auto">
    {/* Same message rendering as BranchPanel */}
  </div>

  {/* Branch InputArea */}
  <InputArea overrideConversationId={branchChannel} compact />
</BottomSheet>
```

---

## 11. BottomSheet Primitive

**File**: `src/components/layout/BottomSheet.tsx` (new)

A reusable bottom sheet component used by both `MobileBranchSheet` and `MobileSettingsSheet`.

### Props

```typescript
interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  snapPoints?: number[];     // fractions of viewport, default [0.5]
  children: React.ReactNode;
}
```

### Implementation Approach

- Pure CSS + touch event handlers (no external library in P1)
- `position: fixed; bottom: 0; left: 0; right: 0`
- Height controlled by snap point
- Backdrop: `bg-black/40`
- Drag handle: 32px wide pill, 4px height, centered
- Touch tracking: `onTouchStart` / `onTouchMove` / `onTouchEnd` on the drag handle region
- Transition: `transform 300ms cubic-bezier(0.32, 0.72, 0, 1)` (iOS-like spring)
- If `vaul` library is later adopted, replace internals while keeping the same prop interface

---

## 12. Message Actions: Long-Press Menu

**File**: `src/components/chat/MessageActions.tsx` (existing — modify in place)

### Current Behavior (desktop)

Hover action bar: `opacity-0 group-hover:opacity-100`, positioned absolutely at `top-1 right-2`.

### Mobile Behavior

Replace hover with long-press context menu:

```tsx
// In MessageView.tsx, wrap each message row:
const handleLongPress = useLongPress(() => {
  setContextMenuMsg(msg);
}, { threshold: 500 });

<div {...handleLongPress} className="msg-row group relative">
  {/* existing message content */}
</div>
```

**Context Menu**: Render as a popover/dropdown anchored near the long-press position.

### `useLongPress` Hook

**File**: `src/lib/useLongPress.ts` (new)

```typescript
import { useRef, useCallback } from 'react';

interface LongPressOptions {
  threshold?: number;  // ms, default 500
}

export function useLongPress(callback: () => void, options: LongPressOptions = {}) {
  const { threshold = 500 } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const isLongPress = useRef(false);

  const start = useCallback(() => {
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      callback();
    }, threshold);
  }, [callback, threshold]);

  const clear = useCallback(() => {
    clearTimeout(timerRef.current);
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: clear, // cancel on scroll
  };
}
```

### Context Menu Actions (same as desktop, reorganized)

1. Reply
2. Copy
3. Copy as text
4. Branch from here
5. Save to memory
6. ---
7. Retry (assistant only)
8. Adopt (branch context only)
9. Edit (user only)
10. Delete

### Desktop: No Change

Hover action bar continues to work as-is. The mobile long-press path is additive.

```tsx
// In MessageView.tsx:
{isMobile ? (
  <MobileLongPressMenu msg={msg} ... />
) : (
  <MessageActions ... /> // existing hover bar
)}
```

---

## 13. MobileSettingsSheet

**File**: `src/components/layout/MobileSettingsSheet.tsx` (new)

Triggered by tapping the summary chip in InputArea. Uses `<BottomSheet snapPoints={[0.5]}>`.

### Content

Three sections, each with a list of options:

```
┌──────────────────────────┐
│  ─── (drag handle) ───   │
├──────────────────────────┤
│  ENGINE / MODEL          │
│  ○ claude / opus4.6      │
│  ○ claude / sonnet4.6    │
│  ○ gemini / (auto)       │
│  ○ codex / o3            │
├──────────────────────────┤
│  PERSONA                 │
│  ○ default               │
│  ○ concise               │
│  ○ creative              │
│  ○ technical             │
├──────────────────────────┤
│  TRIGGER MODE            │
│  ○ always                │
│  ○ mentions              │
│  ○ off                   │
└──────────────────────────┘
```

Each option row: 44px height, radio-style selection. Selecting an option immediately applies via `wsClient.sendRpc()` + `updateConvSettings()` (same logic as current QuickChip components).

---

## 14. Responsive CSS Changes

### 14.1 `index.css` additions

```css
/* ── Mobile viewport variable ── */
:root {
  --vvh: 100vh;
}

/* ── Safe area ── */
@supports (padding: env(safe-area-inset-top)) {
  :root {
    --sat: env(safe-area-inset-top);
    --sab: env(safe-area-inset-bottom);
    --sal: env(safe-area-inset-left);
    --sar: env(safe-area-inset-right);
  }
}

/* ── Mobile message layout ── */
@media (max-width: 767px) {
  .sidebar-item {
    min-height: 44px;
  }

  .msg-row {
    padding-left: 12px;
    padding-right: 12px;
  }

  .msg-row__avatar-col {
    width: 36px;
  }

  .msg-row__avatar {
    width: 28px;
    height: 28px;
  }

  /* Code blocks: horizontal scroll with touch momentum */
  .prose pre {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* Tables: horizontal scroll wrapper */
  .prose table {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}
```

### 14.2 Touch Target Enforcement

All interactive elements on mobile must meet 44x44px minimum:
- Buttons in MobileHeader: `min-w-[44px] min-h-[44px]`
- Sidebar items: `min-h-[44px]` (CSS above)
- Context menu items: `min-h-[44px]`
- Bottom sheet action rows: `min-h-[44px]`

---

## 15. Tauri Android Configuration

### 15.1 `tauri.conf.json` changes

The existing window config has `minWidth: 800, minHeight: 600, decorations: false`. For Android:

```jsonc
// src-tauri/tauri.conf.json
{
  "app": {
    "windows": [{
      "title": "tunaDish",
      "width": 1920,
      "height": 1200,
      // Remove or conditionally skip for mobile:
      // "minWidth": 800,  ← not applicable on Android
      // "minHeight": 600, ← not applicable on Android
      "decorations": false
    }]
  }
}
```

For Tauri v2 Android, `minWidth`/`minHeight` are ignored by the Android runtime, so no code change needed — just be aware.

### 15.2 Android Init

```bash
cd client
npx tauri android init
# Generates: src-tauri/gen/android/
```

### 15.3 Platform-Conditional Code

The `TopNav.tsx` imports `getCurrentWindow()` from `@tauri-apps/api/window` at module top level. On Android, window controls are not needed.

**Solution**: Lazy import with platform check:

```typescript
// src/lib/tauriBridge.ts — add:
export const isDesktop = (): boolean => {
  // Tauri v2: check if window management APIs are available
  try {
    return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
    // More precise: use @tauri-apps/api/core to check OS
  } catch {
    return false;
  }
};
```

For `TopNav.tsx`: only render `<WindowControls />` on desktop. `MobileHeader` does not import window APIs at all.

---

## 16. systemStore Extensions

Add to `src/store/systemStore.ts`:

```typescript
interface SystemState {
  // ... existing fields ...

  // Mobile UI state
  mobileSearchOpen: boolean;
  mobileSettingsSheetOpen: boolean;

  setMobileSearchOpen: (open: boolean) => void;
  setMobileSettingsSheetOpen: (open: boolean) => void;
}

// In create():
mobileSearchOpen: false,
mobileSettingsSheetOpen: false,
setMobileSearchOpen: (open) => set({ mobileSearchOpen: open }),
setMobileSettingsSheetOpen: (open) => set({ mobileSettingsSheetOpen: open }),
```

The existing `sidebarOpen` and `branchPanelOpen` are reused for MobileDrawer and MobileBranchSheet respectively.

---

## 17. Implementation Phases

### P0: Foundation (low risk)

**New files:**
- `src/lib/useIsMobile.ts`
- `src/lib/useVisualViewport.ts`

**Modified files:**
- `src/index.css` — add `--vvh`, safe-area variables, mobile media queries

**Validation:** `useIsMobile()` returns correct value on resize. `--vvh` updates when virtual keyboard opens (test in Chrome DevTools mobile emulation).

---

### P0.5: Connection Setup Screen (low risk)

모바일에서는 `localhost`가 아닌 PC의 LAN/VPN IP로 접속해야 하므로, 서버 주소 입력 화면이 필수.

**New files:**
- `src/components/layout/ConnectionScreen.tsx`

**Modified files:**
- `src/store/systemStore.ts` — `wsUrl`, `recentServers`, `connectionStatus` 상태 추가
- `src/App.tsx` (또는 `MobileShell.tsx`) — 연결 미설정/실패 시 ConnectionScreen 표시

**UI 구조:**

```
┌──────────────────────────┐
│                          │
│      🐟 tunaDish         │
│                          │
│  서버 주소               │
│  ┌──────────────────────┐│
│  │ ws://192.168.0.10:876││
│  └──────────────────────┘│
│                          │
│  최근 서버               │
│  ○ ws://192.168.0.10:8765│  ← 집 (LAN)
│  ○ ws://10.8.0.1:8765    │  ← VPN
│                          │
│       [ 연결 ]           │
│                          │
└──────────────────────────┘
```

**동작:**
- 서버 주소 수동 입력 + 연결 버튼
- 최근 연결 성공한 주소 목록 (`localStorage` 저장, 최대 5개)
- 연결 성공 시 주소 저장 → 다음 실행 시 자동 연결 시도
- 자동 연결 실패 시 이 화면 자동 표시 (3초 타임아웃)
- 데스크톱에서도 사용 가능 (원격 tunapi 접속 시)

**Validation:** 주소 입력 → 연결 성공 → 메인 화면 전환. 잘못된 주소 → 에러 표시 → 재입력 가능.

---

### P1: Layout Shell + Drawer (medium risk)

**New files:**
- `src/components/layout/DesktopShell.tsx` — extract from current `App.tsx`
- `src/components/layout/MobileShell.tsx`
- `src/components/layout/MobileHeader.tsx`
- `src/components/layout/MobileDrawer.tsx`

**Modified files:**
- `src/App.tsx` — replace with isMobile gate

**Key requirement:** Wire `useVisualViewport()` in MobileShell from the start. Do NOT defer this.

**Validation:**
- Desktop: zero visual regression (DesktopShell = exact same code)
- Mobile (Chrome DevTools, 375px): MobileHeader shows, drawer opens/closes, ChatArea fills remaining space

---

### P2: InputArea Compact + Settings Sheet (high risk)

**New files:**
- `src/components/layout/BottomSheet.tsx`
- `src/components/layout/MobileSettingsSheet.tsx`

**Modified files:**
- `src/components/chat/InputArea.tsx` — add mobile branch (summary chip, overflow menu, reduced sizing)
- `src/store/systemStore.ts` — add mobile UI state

**Key risk:** Keyboard + InputArea + scroll interaction. Test sequence:
1. Open chat with messages
2. Tap input → keyboard opens → last message still visible
3. Type multi-line → textarea grows → still within `max-h-[120px]`
4. Send → textarea resets → scroll to bottom

**Validation:** The above sequence works without layout jumps.

---

### P3: Message Touch Interactions (medium risk)

**New files:**
- `src/lib/useLongPress.ts`

**Modified files:**
- `src/components/chat/MessageView.tsx` — add long-press handler for mobile
- `src/components/chat/MessageActions.tsx` — add mobile context menu variant

**Validation:**
- Long-press (500ms) on message → context menu appears
- Scroll does NOT trigger long-press (touchmove cancels)
- Desktop hover bar unchanged

---

### P4: Search + Branch Sheet (medium risk)

**New files:**
- `src/components/layout/MobileSearch.tsx`
- `src/components/layout/MobileBranchSheet.tsx`

**Validation:**
- Search: full-screen opens, results appear, selecting a result navigates to message
- Branch sheet: opens at 50%, drags to 75%, swipe down dismisses
- Branch input works with keyboard (--vvh adjusts sheet height)

---

### P5: Android WebView Testing & Polish

**No new files.** Fix issues found in real device testing:

- Safe area insets on devices with notches
- Touch scroll momentum on code blocks
- Font rendering differences
- WebView-specific CSS quirks
- Startup performance (reduce initial bundle if needed)

---

### P6: Server Auto-Discovery & Firewall (post-MVP)

기본 기능 개발 완료 후 추가하는 편의 기능.

#### 6.1 QR 코드 자동 연결

모바일에서 서버 주소를 수동 입력하는 대신 QR 스캔으로 즉시 연결.

**tunapi 측:**
- 서버 시작 시 터미널에 QR 코드 출력 (`ws://<LAN_IP>:<PORT>`)
- `qrcode` Python 패키지 사용 (터미널 ASCII QR)

**tunadish 클라이언트 측:**
- ConnectionScreen에 "QR 스캔" 버튼 추가
- Tauri 카메라 플러그인 또는 `tauri-plugin-barcode-scanner` 필요
- QR 디코딩 → WS URL 파싱 → 자동 연결

**대안 검토:**

| 방식 | 클라이언트 작업량 | tunapi 작업량 | VPN 지원 |
|------|:--:|:--:|:--:|
| 수동 입력 (P0.5) | 없음 | 없음 | O |
| QR 코드 | 중 | 소 | O |
| mDNS (`_tunadish._tcp`) | 소 | 중 | X |
| UDP broadcast | 중 (Rust side) | 소 | X |

QR 코드가 UX 대비 구현 비용이 가장 합리적. mDNS는 VPN 미지원이라 보조 수단.

#### 6.2 Windows 방화벽 자동 처리

tunapi 서버가 LAN 접속을 받으려면 Windows 방화벽 인바운드 규칙이 필요.

**tunapi 측 (서버 첫 실행 시):**
```python
import subprocess, sys

def ensure_firewall_rule(port: int = 8765):
    rule_name = "tunapi-tunadish"
    # 이미 있는지 확인
    check = subprocess.run(
        ["netsh", "advfirewall", "firewall", "show", "rule", f"name={rule_name}"],
        capture_output=True
    )
    if check.returncode == 0:
        return  # 이미 존재

    # 규칙 추가 (UAC 프롬프트 발생)
    subprocess.run([
        "netsh", "advfirewall", "firewall", "add", "rule",
        f"name={rule_name}", "dir=in", "action=allow",
        "protocol=TCP", f"localport={port}",
        f"program={sys.executable}"
    ])
```

**주의사항:**
- `netsh`는 관리자 권한 필요 → UAC 팝업 1회 발생
- 규칙은 프로그램 경로(`sys.executable`) 기반으로 제한하여 보안 유지
- 이미 규칙이 있으면 스킵

**이 작업은 tunapi 레포 프롬프트로 별도 요청 필요** (tunadish 클라이언트 작업 아님).

---

## 18. Testing Strategy

### Unit Tests (Vitest)

- `useIsMobile.test.ts` — mock `matchMedia`, verify state transitions
- `useLongPress.test.ts` — verify timer, cancel on move
- `useVisualViewport.test.ts` — mock `window.visualViewport`

### E2E Tests (Playwright)

Add mobile viewport presets to existing `e2e/fixtures.ts`:

```typescript
export const mobileViewport = { width: 375, height: 812 }; // iPhone 13

test('mobile: drawer opens on hamburger tap', async ({ page }) => {
  await page.setViewportSize(mobileViewport);
  // ...
});
```

### Manual Testing Checklist

- [ ] Chrome DevTools mobile emulation (375x812)
- [ ] Android emulator via `npx tauri android dev`
- [ ] Real Android device (if available)
- [ ] Landscape orientation handling
- [ ] Virtual keyboard open/close cycle
- [ ] Swipe gestures (drawer, bottom sheet, scroll)

---

## 19. Dependencies

**No new npm packages required for P0–P4.**

The bottom sheet and drawer are implemented with native touch events + CSS transforms. If a polished spring animation library is desired later, `vaul` (3.5KB gzipped) is the recommended candidate — but only after the basic implementation is validated.

---

## 20. Files Created/Modified Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| P0 | `useIsMobile.ts`, `useVisualViewport.ts` | `index.css` |
| P0.5 | `ConnectionScreen.tsx` | `systemStore.ts`, `App.tsx` |
| P1 | `DesktopShell.tsx`, `MobileShell.tsx`, `MobileHeader.tsx`, `MobileDrawer.tsx` | `App.tsx` |
| P2 | `BottomSheet.tsx`, `MobileSettingsSheet.tsx` | `InputArea.tsx`, `systemStore.ts` |
| P3 | `useLongPress.ts` | `MessageView.tsx`, `MessageActions.tsx` |
| P4 | `MobileSearch.tsx`, `MobileBranchSheet.tsx` | (none) |
| P5 | (none) | (bug fixes as needed) |
| P6 | (tunapi 측 작업) | ConnectionScreen에 QR 스캔 버튼 추가 |

**Total new files:** 11
**Total modified files:** 5

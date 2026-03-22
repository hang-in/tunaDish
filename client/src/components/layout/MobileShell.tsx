import { useVisualViewport } from '@/lib/useVisualViewport';
import { MobileHeader } from './MobileHeader';
import { MobileDrawer } from './MobileDrawer';
import { MobileSettingsSheet } from './MobileSettingsSheet';
import { MobileSearch } from './MobileSearch';
import { MobileBranchSheet } from './MobileBranchSheet';
import { ChatArea } from './ChatArea';

export function MobileShell() {
  useVisualViewport();

  return (
    <div className="flex flex-col h-[var(--vvh,100vh)] bg-surface-container-lowest overflow-hidden">
      {/* Safe area top */}
      <div style={{ height: 'env(safe-area-inset-top)' }} className="bg-[#0e0e0e] shrink-0" />

      <MobileHeader />

      <main className="flex-1 overflow-hidden relative">
        <ChatArea />
      </main>

      {/* Safe area bottom */}
      <div style={{ height: 'env(safe-area-inset-bottom)' }} className="bg-[#161616] shrink-0" />

      {/* Overlays */}
      <MobileDrawer />
      <MobileSettingsSheet />
      <MobileSearch />
      <MobileBranchSheet />
    </div>
  );
}

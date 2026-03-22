import { useRef, useCallback, useEffect, useState } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  snapPoints?: number[];
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, snapPoints = [0.5], children }: BottomSheetProps) {
  const [snapIndex, setSnapIndex] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const currentTranslateY = useRef(0);
  const isDragging = useRef(false);
  const scrollableRef = useRef<HTMLElement | null>(null);

  const currentHeight = snapPoints[snapIndex] * window.innerHeight;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // scrollTop이 0일 때만 sheet 드래그 허용 (내부 스크롤 충돌 방지)
    const target = e.target as HTMLElement;
    const scrollable = target.closest('[data-bottom-sheet-scroll]') as HTMLElement | null;
    scrollableRef.current = scrollable;

    if (scrollable && scrollable.scrollTop > 0) return;

    dragStartY.current = e.touches[0].clientY;
    currentTranslateY.current = 0;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;

    // 내부 스크롤이 0 이상이면 드래그 취소
    if (scrollableRef.current && scrollableRef.current.scrollTop > 0) {
      isDragging.current = false;
      return;
    }

    const deltaY = e.touches[0].clientY - dragStartY.current;
    if (deltaY < 0) return; // 위로 드래그 방지 (snap point 전환은 추후)

    currentTranslateY.current = deltaY;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const translateY = currentTranslateY.current;

    if (sheetRef.current) {
      sheetRef.current.style.transform = '';
    }

    // 30% 이상 아래로 드래그하면 닫기
    const ratio = 1 - translateY / currentHeight;
    if (ratio < 0.7) {
      onClose();
      return;
    }

    // snap point 전환
    const currentRatio = translateY / window.innerHeight;
    const targetRatio = 1 - currentRatio;
    const nearest = snapPoints.reduce((prev, curr) =>
      Math.abs(curr - targetRatio) < Math.abs(prev - targetRatio) ? curr : prev
    );
    setSnapIndex(snapPoints.indexOf(nearest));
  }, [currentHeight, onClose, snapPoints]);

  // Escape 키로 닫기
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // 열릴 때 snap index 초기화
  useEffect(() => {
    if (open) setSnapIndex(0);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="absolute bottom-0 left-0 right-0 bg-[#1a1a1a] rounded-t-2xl flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{
          height: `${currentHeight}px`,
          transition: isDragging.current ? 'none' : 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1), height 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-2 shrink-0">
          <div className="w-8 h-1 rounded-full bg-[#e5e2e1]/20" />
        </div>
        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}

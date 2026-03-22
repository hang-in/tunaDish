import { useRef, useCallback } from 'react';

interface LongPressOptions {
  threshold?: number; // ms, default 500
}

export function useLongPress(callback: () => void, options: LongPressOptions = {}) {
  const { threshold = 500 } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
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

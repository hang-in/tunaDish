import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * 모바일 플랫폼 판별.
 * - Tauri Android → 항상 모바일
 * - Tauri 데스크톱 → 항상 데스크톱 (뷰포트 무관)
 * - 브라우저/E2E → 뷰포트 기반 (모바일 테스트 가능)
 */
function detectPlatform(): 'android' | 'desktop' | 'browser' {
  if (typeof window === 'undefined') return 'desktop';

  const ua = navigator.userAgent.toLowerCase();
  const hasTauri = '__TAURI_INTERNALS__' in window;

  if (hasTauri && ua.includes('android')) return 'android';
  if (hasTauri) return 'desktop';

  return 'browser';
}

const PLATFORM = detectPlatform();

export function useIsMobile(): boolean {
  // 브라우저/E2E 환경에서만 뷰포트 반응형 (hooks는 항상 호출)
  const [viewportMobile, setViewportMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < MOBILE_BREAKPOINT;
  });

  useEffect(() => {
    if (PLATFORM !== 'browser') return;
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setViewportMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  if (PLATFORM === 'android') return true;
  if (PLATFORM === 'desktop') return false;
  return viewportMobile; // browser
}

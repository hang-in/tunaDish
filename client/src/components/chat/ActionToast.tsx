import { useState, useEffect } from 'react';

// --- Toast feedback (module-level state) ---
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let setToastGlobal: ((msg: string | null) => void) | null = null;

export function showToast(msg: string) {
  if (setToastGlobal) {
    setToastGlobal(msg);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToastGlobal?.(null), 2000);
  }
}

export function ActionToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setToastGlobal = setMsg; return () => { setToastGlobal = null; }; }, []);
  if (!msg) return null;
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full bg-[#1a1a1a]/95 border border-white/10 shadow-lg text-[11px] text-on-surface-variant/80 font-medium animate-in fade-in slide-in-from-top-2 duration-200">
      {msg}
    </div>
  );
}

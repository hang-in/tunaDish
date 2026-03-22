/**
 * Shiki highlighter 싱글턴.
 * 앱 전체에서 한 번만 초기화하여 WASM 중복 로드 방지.
 */
import { createHighlighter, type Highlighter } from 'shiki';

let highlighter: Highlighter | null = null;
let initPromise: Promise<Highlighter> | null = null;

// 자주 사용되는 언어만 미리 로드, 나머지는 lazy
const PRELOAD_LANGS = [
  'javascript', 'typescript', 'tsx', 'jsx',
  'python', 'rust', 'go', 'bash', 'sh',
  'json', 'html', 'css', 'sql', 'toml', 'yaml', 'markdown',
] as const;

export async function getHighlighter(): Promise<Highlighter> {
  if (highlighter) return highlighter;
  if (initPromise) return initPromise;
  initPromise = createHighlighter({
    themes: ['github-dark-default'],
    langs: [...PRELOAD_LANGS],
  }).then(h => {
    highlighter = h;
    return h;
  });
  return initPromise;
}

/** 동기적으로 하이라이팅 시도. highlighter 미초기화면 null 반환. */
export function highlightSync(code: string, lang: string): string | null {
  if (!highlighter) return null;
  try {
    return highlighter.codeToHtml(code, {
      lang: lang || 'text',
      theme: 'github-dark-default',
    });
  } catch {
    // 지원 안 되는 언어 → fallback
    return null;
  }
}

/** 비동기 하이라이팅. 필요시 언어를 lazy load. */
export async function highlightAsync(code: string, lang: string): Promise<string> {
  const h = await getHighlighter();
  const loadedLangs = h.getLoadedLanguages();
  if (lang && !loadedLangs.includes(lang)) {
    try {
      await h.loadLanguage(lang as Parameters<typeof h.loadLanguage>[0]);
    } catch {
      // 지원 안 되는 언어 → text fallback
      lang = 'text';
    }
  }
  return h.codeToHtml(code, {
    lang: lang || 'text',
    theme: 'github-dark-default',
  });
}

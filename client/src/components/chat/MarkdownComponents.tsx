import { useState, useCallback, useEffect, type ReactNode, type ComponentPropsWithoutRef } from 'react';
import type { Components } from 'react-markdown';
import { Check, Copy, CaretDown, CaretUp } from '@phosphor-icons/react';
import { highlightSync, highlightAsync, getHighlighter } from '@/lib/shiki';

// 앱 시작 시 highlighter 미리 초기화
getHighlighter();

// ── 코드블록: 언어 라벨 + 복사 버튼 + 접기/펼치기 + shiki ──────

const FOLD_THRESHOLD = 30;

function CodeBlock({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'pre'> & { node?: unknown }) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // children에서 code 요소의 className → 언어 + 텍스트 추출
  let language = '';
  let codeText = '';

  const codeChild = Array.isArray(children)
    ? children.find((c: unknown) => {
        const cls = (c as { props?: { className?: string } })?.props?.className ?? '';
        return cls.includes('language-');
      })
    : (() => {
        const cls = (children as { props?: { className?: string } })?.props?.className ?? '';
        return cls.includes('language-') ? children : null;
      })();

  // 언어 클래스가 있는 code 요소 또는 단순 code 요소에서 텍스트 추출
  const resolvedChild = codeChild ?? (
    Array.isArray(children) ? children[0] : children
  );
  if (resolvedChild && typeof resolvedChild === 'object' && 'props' in (resolvedChild as object)) {
    const codeProps = (resolvedChild as { props: { className?: string; children?: ReactNode } }).props;
    const cls = codeProps.className ?? '';
    const match = cls.match(/(?:language-|lang-)(\S+)/);
    if (match) language = match[1];
    codeText = extractText(codeProps.children);
  }

  // shiki 하이라이팅
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(() =>
    highlightSync(codeText, language),
  );

  useEffect(() => {
    if (highlightedHtml || !codeText) return;
    let cancelled = false;
    highlightAsync(codeText, language).then(html => {
      if (!cancelled) setHighlightedHtml(html);
    });
    return () => { cancelled = true; };
  }, [codeText, language, highlightedHtml]);

  const lineCount = codeText.split('\n').length;
  const canFold = lineCount >= FOLD_THRESHOLD;
  const [initFolded] = useState(() => canFold);
  const isCollapsed = canFold && (collapsed || (initFolded && collapsed !== false && !collapsed));

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard API 실패 시 무시 */ }
  }, [codeText]);

  return (
    <div className="relative group/code my-2">
      <div className="flex items-center justify-between px-3 py-1 rounded-t-lg bg-[#1a1a1a] border-b border-white/5 text-[10px]">
        <span className="font-mono text-on-surface-variant/40 uppercase tracking-wider">
          {language || 'code'}
        </span>
        <div className="flex items-center gap-1">
          {canFold && (
            <button
              onClick={() => setCollapsed(c => !c)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-on-surface-variant/40 hover:text-on-surface-variant/80 hover:bg-white/5 transition-colors"
              title={isCollapsed ? '펼치기' : '접기'}
            >
              {isCollapsed ? <CaretDown size={10} /> : <CaretUp size={10} />}
              <span>{lineCount} lines</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-on-surface-variant/40 hover:text-on-surface-variant/80 hover:bg-white/5 transition-colors"
            title="복사"
          >
            {copied
              ? <><Check size={10} weight="bold" className="text-emerald-400" /><span className="text-emerald-400">Copied</span></>
              : <><Copy size={10} /><span>Copy</span></>
            }
          </button>
        </div>
      </div>
      {highlightedHtml ? (
        <div
          className="shiki-wrapper !rounded-t-none !mt-0 overflow-x-auto [&_pre]:!bg-[#010101] [&_pre]:!m-0 [&_pre]:p-4 [&_pre]:!rounded-t-none [&_code]:!text-[13px] [&_code]:!leading-relaxed"
          style={isCollapsed ? { maxHeight: '6rem', overflow: 'hidden' } : undefined}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <pre
          {...rest}
          className="!rounded-t-none !mt-0 !bg-[#010101] overflow-x-auto"
          style={isCollapsed ? { maxHeight: '6rem', overflow: 'hidden' } : undefined}
        >
          {children}
        </pre>
      )}
      {isCollapsed && (
        <div
          className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#010101] to-transparent rounded-b-lg cursor-pointer"
          onClick={() => setCollapsed(false)}
        />
      )}
    </div>
  );
}

// ── 테이블: 오버플로우 스크롤 래퍼 ──────────────────────────────

function ScrollTable({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'table'> & { node?: unknown }) {
  return (
    <div className="overflow-x-auto my-2 rounded-lg max-w-full">
      <table {...rest} className="w-auto border-collapse whitespace-nowrap [&_td]:whitespace-normal [&_th]:whitespace-nowrap [&_td]:break-words">
        {children}
      </table>
    </div>
  );
}

// ── 인라인 코드: 파일 경로 감지 → FileViewer 연동 ───────────────

// 문서 확장자 목록 (파일 경로 감지용)
const DOC_EXTS = 'md|mdx|txt|json|yaml|yml|toml|xml|csv|log|ts|tsx|js|jsx|py|rs|go|java|sh|css|html|sql|env|markdown';
// 파일 경로 패턴: 절대경로, 상대경로(dir/file.ext) 매칭. 단독 파일명은 제외 (위치 불명확)
const FILE_PATH_RE = new RegExp(`^((?:[A-Za-z]:)?(?:[\\\\/][^\\\\/:\\s]+)+\\.(?:${DOC_EXTS})|(?:[\\w.-]+[\\\\/])+[\\w.-]+\\.(?:${DOC_EXTS}))(?::(\\d+))?$`);

function InlineCode({ children, node: _node, className, ...rest }: ComponentPropsWithoutRef<'code'> & { node?: unknown }) {
  // 코드블록 내부 <code>는 그대로 패스 (CodeBlock이 처리)
  if (className?.includes('language-')) {
    return <code className={className} {...rest}>{children}</code>;
  }
  const text = typeof children === 'string' ? children : '';
  const match = text.match(FILE_PATH_RE);

  if (match) {
    const filePath = match[1];
    return (
      <code
        {...rest}
        className="text-[13px] text-blue-300/80 hover:text-blue-300 cursor-pointer underline underline-offset-2 decoration-blue-400/30 transition-colors before:content-none after:content-none"
        onClick={() => {
          // lazy import to avoid circular deps
          import('./FileViewer').then(m => m.useFileViewerStore.getState().openFile(filePath));
        }}
        title={`파일 열기: ${filePath}`}
      >
        {children}
      </code>
    );
  }

  return <code {...rest}>{children}</code>;
}

// ── 텍스트 내 파일 경로 자동 링크 변환 ───────────────────────────

// 텍스트 중간에 있는 파일 경로도 감지 (인라인 코드가 아닌 일반 텍스트용)
// 절대경로, 상대경로(dir/file.ext) 매칭. 단독 파일명은 제외 (위치 불명확)
const FILE_PATH_INLINE_RE = new RegExp(`((?:[A-Za-z]:)?(?:[\\\\/][^\\\\/:\\s]+)+\\.(?:${DOC_EXTS})|(?:[\\w.-]+[\\\\/])+[\\w.-]+\\.(?:${DOC_EXTS}))(?::(\\d+))?`, 'g');

function linkifyFilePaths(children: ReactNode): ReactNode {
  if (typeof children === 'string') {
    const parts: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    FILE_PATH_INLINE_RE.lastIndex = 0;
    while ((match = FILE_PATH_INLINE_RE.exec(children)) !== null) {
      if (match.index > lastIndex) {
        parts.push(children.slice(lastIndex, match.index));
      }
      const filePath = match[1];
      const full = match[0];
      parts.push(
        <span
          key={match.index}
          className="text-blue-300/80 hover:text-blue-300 cursor-pointer underline underline-offset-2 decoration-blue-400/30 transition-colors"
          onClick={() => {
            import('./FileViewer').then(m => m.useFileViewerStore.getState().openFile(filePath));
          }}
          title={`파일 열기: ${filePath}`}
        >
          {full}
        </span>
      );
      lastIndex = match.index + full.length;
    }
    if (parts.length === 0) return children; // 매치 없음
    if (lastIndex < children.length) parts.push(children.slice(lastIndex));
    return <>{parts}</>;
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => <span key={i}>{linkifyFilePaths(child)}</span>);
  }
  return children;
}

// 테이블 셀: 파일 경로 자동 링크
function LinkedTd({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'td'> & { node?: unknown }) {
  return <td {...rest}>{linkifyFilePaths(children)}</td>;
}

// ── 링크: 외부 링크 안전 처리 ────────────────────────────────────

// ファイルパス判定用正規表現 (DOC_EXTSと同期)
const FILE_HREF_RE = new RegExp(`\\.(?:${DOC_EXTS})(?::\\d+)?$`);

function SafeLink({ href, children, node: _node, ...rest }: ComponentPropsWithoutRef<'a'> & { node?: unknown }) {
  const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
  // ローカルファイルパスのリンク → FileViewer で開く（WebView ナビゲーション防止）
  const isFilePath = href && !isExternal && FILE_HREF_RE.test(href);

  if (isFilePath) {
    return (
      <span
        {...rest}
        className="text-blue-300/80 hover:text-blue-300 cursor-pointer underline underline-offset-2 decoration-blue-400/30 transition-colors"
        onClick={(e) => {
          e.preventDefault();
          import('./FileViewer').then(m => m.useFileViewerStore.getState().openFile(href));
        }}
        title={`파일 열기: ${href}`}
      >
        {children}
      </span>
    );
  }

  return (
    <a
      {...rest}
      href={href}
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="text-primary hover:underline"
    >
      {children}
      {isExternal && <span className="inline-block ml-0.5 text-[10px] opacity-40">↗</span>}
    </a>
  );
}

// ── 텍스트 추출 유틸 ─────────────────────────────────────────────

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

// ── Export ────────────────────────────────────────────────────────

export const markdownComponents: Partial<Components> = {
  pre: CodeBlock as Components['pre'],
  code: InlineCode as Components['code'],
  table: ScrollTable as Components['table'],
  td: LinkedTd as Components['td'],
  a: SafeLink as Components['a'],
};

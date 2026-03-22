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
    <div className="overflow-x-auto my-2 rounded-lg">
      <table {...rest} className="min-w-full">
        {children}
      </table>
    </div>
  );
}

// ── 링크: 외부 링크 안전 처리 ────────────────────────────────────

function SafeLink({ href, children, node: _node, ...rest }: ComponentPropsWithoutRef<'a'> & { node?: unknown }) {
  const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
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
  table: ScrollTable as Components['table'],
  a: SafeLink as Components['a'],
};

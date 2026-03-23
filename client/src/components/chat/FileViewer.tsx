import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from './MarkdownComponents';
import { isTauriEnv } from '@/lib/db';
import { useChatStore } from '@/store/chatStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { File, Copy, ArrowSquareOut } from '@phosphor-icons/react';

// --- Store ---

interface FileViewerState {
  open: boolean;
  filePath: string | null;
  openFile: (path: string) => void;
  close: () => void;
}

function resolveFilePath(path: string): string {
  // 이미 절대경로면 그대로
  if (/^[A-Za-z]:/.test(path) || path.startsWith('/')) return path;
  // 프로젝트 path를 기준으로 resolve
  const state = useChatStore.getState();
  const activeConvId = state.activeConversationId;
  const conv = activeConvId ? state.conversations[activeConvId] : null;
  const project = conv ? state.projects.find(p => p.key === conv.projectKey) : null;
  if (project?.path) {
    const base = project.path.replace(/[\\/]$/, '');
    return `${base}/${path}`;
  }
  return path;
}

export const useFileViewerStore = create<FileViewerState>((set) => ({
  open: false,
  filePath: null,
  openFile: (path) => set({ open: true, filePath: resolveFilePath(path) }),
  close: () => set({ open: false, filePath: null }),
}));

// --- Component ---

const proseClasses =
  'prose prose-sm dark:prose-invert max-w-none text-[14px] leading-relaxed ' +
  'prose-p:my-1.5 prose-p:text-[1em] ' +
  'prose-headings:text-[1em] prose-headings:font-bold prose-headings:text-on-surface prose-headings:mt-4 prose-headings:mb-2 ' +
  'prose-pre:rounded-lg prose-pre:my-2 prose-pre:!bg-[#010101] ' +
  'prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none ' +
  'prose-strong:text-on-surface prose-li:my-0.5 prose-li:text-[1em] prose-ol:my-1.5 prose-ul:my-1.5 ' +
  'prose-blockquote:border-primary/20 prose-blockquote:text-on-surface-variant prose-blockquote:not-italic prose-blockquote:text-[1em] ' +
  'prose-th:text-[1em] prose-th:px-4 prose-th:py-2 prose-td:text-[1em] prose-td:px-4 prose-td:py-1.5';

function fileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

export function FileViewer() {
  const { open, filePath, close } = useFileViewerStore();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !filePath) {
      setContent(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);

    if (isTauriEnv()) {
      invoke<string>('read_text_file', { path: filePath })
        .then(text => { setContent(text); setLoading(false); })
        .catch(err => { setError(String(err)); setLoading(false); });
    } else {
      setError('파일 읽기는 Tauri 환경에서만 가능합니다');
      setLoading(false);
    }
  }, [open, filePath]);

  const isMarkdown = filePath?.match(/\.(md|mdx|markdown)$/i);

  const handleCopy = () => {
    if (content) navigator.clipboard.writeText(content);
  };

  const handleCopyPath = () => {
    if (filePath) navigator.clipboard.writeText(filePath);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent showCloseButton={false} className="!max-w-[90vw] !max-h-[90vh] w-[680px] h-[60vh] flex flex-col bg-[#1a1a1a] border border-white/10 resize overflow-auto min-w-[320px] min-h-[200px]">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-0">
            <DialogTitle className="flex items-center gap-2 text-[13px] font-mono flex-1 min-w-0">
              <File size={16} className="text-primary shrink-0" />
              <span className="truncate" title={filePath ?? ''}>{filePath ? fileName(filePath) : ''}</span>
            </DialogTitle>
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={handleCopyPath} className="p-1.5 rounded hover:bg-white/10 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors" title="경로 복사">
                <ArrowSquareOut size={14} />
              </button>
              <button onClick={handleCopy} className="p-1.5 rounded hover:bg-white/10 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors" title="내용 복사">
                <Copy size={14} />
              </button>
              <button onClick={close} className="p-1.5 rounded hover:bg-white/10 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors" title="닫기">
                <span className="text-[14px] font-bold leading-none">✕</span>
              </button>
            </div>
          </div>
          {filePath && (
            <div className="text-[10px] text-on-surface-variant/30 font-mono truncate">{filePath}</div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 rounded-lg bg-[#0a0a0a] border border-white/5 p-4">
          {loading && (
            <div className="text-[12px] text-on-surface-variant/40 animate-pulse">Loading...</div>
          )}
          {error && (
            <div className="text-[12px] text-red-400/80">{error}</div>
          )}
          {content !== null && !loading && (
            isMarkdown ? (
              <div className={proseClasses}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {content}
                </ReactMarkdown>
              </div>
            ) : (
              <pre className="text-[12px] text-on-surface-variant/80 font-mono whitespace-pre-wrap break-words leading-relaxed">
                {content}
              </pre>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

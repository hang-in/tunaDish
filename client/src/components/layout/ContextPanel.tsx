import { useSystemStore } from '@/store/systemStore';
import { useContextStore, selectConvBranches, type ContextTab, type MemoryEntry, type GitBranch, type ConversationBranch, type CodeSearchResult } from '@/store/contextStore';
import { useChatStore } from '@/store/chatStore';
import { wsClient } from '@/lib/wsClient';
import { useEffect, useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Folder,
  Lightning,
  Brain,
  GitBranch as GitBranchIcon,
  GitFork,
  ChatCircle,
  Eye,
  BookOpen,
  Tag,
  Trash,
  ArrowSquareOut,
  Archive,
  MagnifyingGlass,
  Code,
  CaretDown,
  CaretRight,
  CircleNotch,
} from '@phosphor-icons/react';

// --- Tab keys ---
const TAB_KEYS: { key: ContextTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'memory', label: 'Memory' },
  { key: 'branches', label: 'Branches' },
  { key: 'code', label: 'Code' },
];

// --- Overview Tab ---
function OverviewTab() {
  const ctx = useContextStore(s => s.projectContext);

  if (!ctx) {
    return (
      <div className="p-5 text-[12px] text-on-surface-variant/40 text-center">
        프로젝트를 선택하세요.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Project header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Folder size={14} weight="fill" className="text-primary" />
          <span className="text-[13px] font-semibold text-on-surface">{ctx.project}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-on-surface-variant">
          {ctx.engine && (
            <span className="flex items-center gap-1">
              <Lightning size={12} weight="fill" className="text-primary" />
              {ctx.engine}{ctx.model ? `/${ctx.model}` : ''}
            </span>
          )}
          {ctx.persona && (
            <span className="flex items-center gap-1">
              <Brain size={12} />
              {ctx.persona}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Lightning size={12} />
            {ctx.triggerMode}
          </span>
        </div>
      </div>

      {/* Active branches summary */}
      {(ctx.activeBranches.length > 0 || ctx.convBranches.length > 0) && (
        <section>
          <SectionLabel icon={<GitBranchIcon size={12} />} label="Branches" />
          <div className="space-y-1">
            {ctx.activeBranches.map(b => (
              <div key={b.name} className="flex items-center gap-2 text-[11px] text-on-surface-variant px-1 py-0.5">
                <GitBranchIcon size={12} className="text-emerald-400 shrink-0" />
                <span className="text-on-surface font-medium">{b.name}</span>
                {b.linkedDiscussionCount > 0 && (
                  <span className="text-[10px] text-on-surface-variant/40">{b.linkedDiscussionCount} disc</span>
                )}
              </div>
            ))}
            {ctx.convBranches.map(b => (
              <div key={b.id} className="flex items-center gap-2 text-[11px] text-on-surface-variant px-1 py-0.5">
                <GitFork size={12} className="text-blue-400 shrink-0" />
                <span className="text-on-surface font-medium">{b.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent decisions from memory */}
      {ctx.memoryEntries.length > 0 && (
        <section>
          <SectionLabel icon={<BookOpen size={12} />} label={`Memory (${ctx.memoryEntries.length})`} />
          <div className="space-y-1">
            {ctx.memoryEntries.slice(0, 5).map(e => (
              <MemoryEntryRow key={e.id} entry={e} compact />
            ))}
          </div>
        </section>
      )}

      {/* Pending reviews */}
      {ctx.pendingReviewCount > 0 && (
        <section>
          <SectionLabel icon={<Eye size={12} />} label={`Pending Reviews (${ctx.pendingReviewCount})`} />
        </section>
      )}

      {/* Recent discussions */}
      {ctx.recentDiscussions.length > 0 && (
        <section>
          <SectionLabel icon={<ChatCircle size={12} />} label="Recent Discussions" />
          <div className="space-y-1">
            {ctx.recentDiscussions.map(d => (
              <div key={d.id} className="flex items-center gap-2 text-[11px] px-1 py-0.5">
                <ChatCircle size={12} className="text-on-surface-variant/40 shrink-0" />
                <span className="text-on-surface">{d.topic}</span>
                <span className="text-[10px] text-on-surface-variant/30">[{d.status}]</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Code Structure (rawq map) */}
      <CodeStructureSection />

      {/* Empty state */}
      {ctx.memoryEntries.length === 0 && ctx.activeBranches.length === 0 && ctx.recentDiscussions.length === 0 && (
        <div className="text-[11px] text-on-surface-variant/30 text-center py-4">
          프로젝트에 저장된 컨텍스트가 없습니다.
        </div>
      )}
    </div>
  );
}

// --- Code Structure (rawq map) ---
interface SymbolNode {
  name: string;
  kind: string;
  line: number;
  children: SymbolNode[];
}

interface MapFile {
  path: string;
  symbols: SymbolNode[];
}

const KIND_COLORS: Record<string, string> = {
  function: 'text-amber-400',
  method: 'text-amber-400',
  struct: 'text-blue-400',
  class: 'text-blue-400',
  module: 'text-purple-400',
  trait: 'text-emerald-400',
  interface: 'text-emerald-400',
  enum: 'text-pink-400',
  const: 'text-on-surface-variant/50',
  type: 'text-cyan-400',
};

function CodeStructureSection() {
  const codeMap = useContextStore(s => s.codeMap);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  if (!codeMap || !codeMap.available || !codeMap.map) return null;
  const files = (codeMap.map as { files?: MapFile[] }).files;
  if (!files || files.length === 0) return null;

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  return (
    <section>
      <SectionLabel icon={<Code size={12} />} label={`Code Structure (${files.length} files)`} />
      <ScrollArea className="max-h-48"><div className="space-y-0.5">
        {files.map(f => (
          <div key={f.path}>
            <button
              onClick={() => toggleFile(f.path)}
              className="flex items-center gap-1 w-full text-left px-1 py-0.5 rounded hover:bg-white/3 text-[10px]"
            >
              {expandedFiles.has(f.path) ? <CaretDown size={8} /> : <CaretRight size={8} />}
              <span className="text-on-surface-variant/60 truncate">{f.path}</span>
            </button>
            {expandedFiles.has(f.path) && f.symbols.length > 0 && (
              <div className="pl-3">
                {f.symbols.map((sym, i) => (
                  <SymbolTree key={`${sym.name}-${i}`} node={sym} depth={0} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div></ScrollArea>
    </section>
  );
}

function SymbolTree({ node, depth }: { node: SymbolNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const colorClass = KIND_COLORS[node.kind] ?? 'text-on-surface-variant/50';

  return (
    <div style={{ paddingLeft: depth * 8 }}>
      <div
        className="flex items-center gap-1 py-px text-[10px] cursor-default hover:bg-white/3 rounded px-1"
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? <CaretDown size={8} className="shrink-0" /> : <CaretRight size={8} className="shrink-0" />
        ) : (
          <span className="w-2 shrink-0" />
        )}
        <span className={cn('font-mono', colorClass)}>{node.name}</span>
        <span className="text-[9px] text-on-surface-variant/25">{node.kind}</span>
      </div>
      {expanded && hasChildren && node.children.map((child, i) => (
        <SymbolTree key={`${child.name}-${i}`} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

// --- Memory Tab ---
function MemoryTab() {
  const entries = useContextStore(s => s.memoryEntries);
  const ctx = useContextStore(s => s.projectContext);

  if (!ctx) {
    return <div className="p-5 text-[12px] text-on-surface-variant/40 text-center">프로젝트를 선택하세요.</div>;
  }

  if (entries.length === 0) {
    return <div className="p-5 text-[12px] text-on-surface-variant/40 text-center">저장된 메모리가 없습니다.</div>;
  }

  const byType = entries.reduce<Record<string, MemoryEntry[]>>((acc, e) => {
    (acc[e.type] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="p-4 space-y-4">
      {(['decision', 'review', 'idea', 'context'] as const).map(type => {
        const items = byType[type];
        if (!items?.length) return null;
        return (
          <section key={type}>
            <SectionLabel icon={<Tag size={12} />} label={`${type} (${items.length})`} />
            <div className="space-y-1">
              {items.map(e => <MemoryEntryRow key={e.id} entry={e} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// --- Delete Confirm Dialog ---
function DeleteConfirmDialog({
  branchLabel,
  open,
  onConfirm,
  onCancel,
}: {
  branchLabel: string;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <DialogContent showCloseButton={false} className="bg-[#1a1a1a] border-outline-variant/30 w-72 p-4 gap-3">
        <DialogHeader>
          <DialogTitle className="text-[13px]">브랜치 삭제</DialogTitle>
          <DialogDescription className="text-[11px] text-on-surface-variant/70">
            <span className="font-medium text-on-surface">{branchLabel}</span> 브랜치를 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 pt-1">
          <DialogClose
            render={<Button variant="ghost" className="flex-1 px-3 py-1.5 text-[11px] font-medium bg-white/5 text-on-surface-variant/60 hover:bg-white/10" />}
          >
            취소
          </DialogClose>
          <Button
            variant="ghost"
            onClick={onConfirm}
            className="flex-1 px-3 py-1.5 text-[11px] font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25"
          >
            삭제
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Branches Tab ---
function BranchesTab() {
  const gitBranches = useContextStore(s => s.gitBranches);
  const convBranches = useContextStore(selectConvBranches);
  const ctx = useContextStore(s => s.projectContext);
  const activeConvId = useChatStore(s => s.activeConversationId);
  const activeConv = useChatStore(s =>
    s.activeConversationId ? s.conversations[s.activeConversationId] : null
  );
  const [deleteTarget, setDeleteTarget] = useState<ConversationBranch | null>(null);

  if (!ctx) {
    return <div className="p-5 text-[12px] text-on-surface-variant/40 text-center">프로젝트를 선택하세요.</div>;
  }

  const activeBranches = convBranches.filter(b => b.status === 'active');
  const archivedBranches = convBranches.filter(b => b.status === 'archived' || b.status === 'adopted');

  const handleOpenBranch = (branch: ConversationBranch) => {
    if (!activeConvId || !activeConv?.projectKey) return;
    useSystemStore.getState().openBranchPanel(branch.id, activeConvId, branch.label, activeConv.projectKey);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget || !activeConvId) return;
    wsClient.sendRpc('branch.delete', {
      conversation_id: activeConvId,
      branch_id: deleteTarget.id,
    });
    setDeleteTarget(null);
  };

  return (
    <div className="p-4 space-y-5">
      {/* Git Branches */}
      <section>
        <SectionLabel icon={<GitBranchIcon size={12} />} label="Git Branches" />
        {gitBranches.length === 0 ? (
          <div className="text-[11px] text-on-surface-variant/30 px-1">없음</div>
        ) : (
          <div className="space-y-1.5">
            {gitBranches.map(b => (
              <GitBranchRow key={b.name} branch={b} />
            ))}
          </div>
        )}
      </section>

      {/* Active Branches */}
      {activeBranches.length > 0 && (
        <section>
          <SectionLabel icon={<GitFork size={12} />} label={`Active (${activeBranches.length})`} />
          <div className="space-y-1">
            {activeBranches.map(b => (
              <ManagedBranchRow
                key={b.id}
                branch={b}
                onOpen={() => handleOpenBranch(b)}
                onDelete={() => setDeleteTarget(b)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Archived / Adopted Branches */}
      {archivedBranches.length > 0 && (
        <section>
          <SectionLabel icon={<Archive size={12} />} label={`Archived (${archivedBranches.length})`} />
          <div className="space-y-1">
            {archivedBranches.map(b => (
              <ManagedBranchRow
                key={b.id}
                branch={b}
                onDelete={() => setDeleteTarget(b)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {convBranches.length === 0 && gitBranches.length === 0 && (
        <div className="text-[11px] text-on-surface-variant/30 text-center py-4">
          브랜치가 없습니다.
        </div>
      )}

      {/* Delete confirmation */}
      <DeleteConfirmDialog
        branchLabel={deleteTarget?.label ?? ''}
        open={!!deleteTarget}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// --- Code Search Tab ---
function CodeSearchTab() {
  const ctx = useContextStore(s => s.projectContext);
  const searchResults = useContextStore(s => s.codeSearchResults);
  const loading = useContextStore(s => s.codeSearchLoading);
  const [query, setQuery] = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback((q: string) => {
    if (!ctx?.project || !q.trim()) return;
    wsClient.searchCode(q.trim(), ctx.project);
  }, [ctx?.project]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => doSearch(val), 300);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSearch(query);
    }
  };

  if (!ctx) {
    return <div className="p-5 text-[12px] text-on-surface-variant/40 text-center">프로젝트를 선택하세요.</div>;
  }

  if (searchResults && !searchResults.available) {
    return (
      <div className="p-5 text-center space-y-2">
        <Code size={24} className="mx-auto text-on-surface-variant/30" />
        <div className="text-[12px] text-on-surface-variant/40">rawq가 설치되어 있지 않습니다.</div>
        <div className="text-[10px] text-on-surface-variant/30">코드 검색을 사용하려면 rawq를 설치하세요.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="p-3 border-b border-outline-variant/20">
        <div className="relative">
          <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/40 z-10" />
          <Input
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="코드 검색..."
            className="h-7 pl-8 pr-8 bg-white/5 border-outline-variant/20 text-[12px] text-on-surface placeholder:text-on-surface-variant/30 focus-visible:border-primary/50 focus-visible:ring-0"
          />
          {loading && (
            <CircleNotch size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-primary animate-spin" />
          )}
        </div>
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        {searchResults?.results && searchResults.results.length > 0 ? (
          <div className="p-2 space-y-0.5">
            <div className="px-1 pb-2 text-[10px] text-on-surface-variant/30">
              {searchResults.results.length}건 · {searchResults.query_ms}ms · {searchResults.total_tokens} tokens
            </div>
            {searchResults.results.map((r, i) => (
              <CodeResultRow
                key={`${r.file}-${r.lines?.[0]}-${i}`}
                result={r}
                expanded={expandedIdx === i}
                onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
              />
            ))}
          </div>
        ) : searchResults && query.trim() ? (
          <div className="p-5 text-[12px] text-on-surface-variant/40 text-center">결과 없음</div>
        ) : (
          <div className="p-5 text-[12px] text-on-surface-variant/30 text-center">
            검색어를 입력하세요.
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function CodeResultRow({ result, expanded, onToggle }: { result: CodeSearchResult; expanded: boolean; onToggle: () => void }) {
  const fileName = result.file.split('/').pop() ?? result.file;
  const dirPath = result.file.split('/').slice(0, -1).join('/');
  const confidenceColor = result.confidence >= 0.7 ? 'text-emerald-400' : result.confidence >= 0.5 ? 'text-amber-400' : 'text-on-surface-variant/40';

  return (
    <div className="rounded hover:bg-white/3">
      <button onClick={onToggle} className="w-full text-left px-2 py-1.5 flex items-center gap-1.5">
        {expanded ? <CaretDown size={10} className="text-on-surface-variant/40 shrink-0" /> : <CaretRight size={10} className="text-on-surface-variant/40 shrink-0" />}
        <Code size={12} className="text-blue-400 shrink-0" />
        <span className="text-[11px] text-on-surface font-medium truncate">{fileName}</span>
        {result.lines && (
          <span className="text-[10px] text-on-surface-variant/30 shrink-0">:{result.lines[0]}-{result.lines[1]}</span>
        )}
        <span className={cn('text-[10px] ml-auto shrink-0 font-mono', confidenceColor)}>
          {(result.confidence * 100).toFixed(0)}%
        </span>
      </button>
      {expanded && (
        <div className="px-2 pb-2">
          {dirPath && <div className="text-[9px] text-on-surface-variant/25 mb-1 pl-5">{dirPath}</div>}
          {result.scope && <div className="text-[10px] text-purple-400/60 mb-1 pl-5">{result.scope}</div>}
          <pre className="text-[10px] leading-relaxed bg-black/30 rounded p-2 overflow-x-auto text-on-surface-variant/70 font-mono">
            {result.content}
          </pre>
        </div>
      )}
    </div>
  );
}

// --- Shared sub-components ---

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className="text-on-surface-variant/40">{icon}</span>
      <span className="text-[10px] font-semibold text-on-surface-variant/50 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function MemoryEntryRow({ entry, compact }: { entry: MemoryEntry; compact?: boolean }) {
  const typeColors: Record<string, string> = {
    decision: 'text-amber-400',
    review: 'text-blue-400',
    idea: 'text-emerald-400',
    context: 'text-purple-400',
  };

  return (
    <div className="px-1 py-1 rounded hover:bg-white/3 group">
      <div className="flex items-center gap-2 text-[11px]">
        <span className={cn('text-[10px] font-medium uppercase', typeColors[entry.type] ?? 'text-on-surface-variant/50')}>
          {entry.type.slice(0, 3)}
        </span>
        <span className="text-on-surface font-medium truncate flex-1">{entry.title}</span>
        <span className="text-[10px] text-on-surface-variant/30 shrink-0">{entry.source}</span>
      </div>
      {!compact && entry.content && (
        <div className="text-[10px] text-on-surface-variant/50 mt-0.5 line-clamp-2 pl-7">{entry.content}</div>
      )}
      {entry.tags.length > 0 && (
        <div className="flex gap-1 mt-0.5 pl-7">
          {entry.tags.map(t => (
            <span key={t} className="text-[9px] px-1 py-px rounded bg-white/5 text-on-surface-variant/40">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function GitBranchRow({ branch }: { branch: GitBranch }) {
  const statusIcon = branch.status === 'active' ? '🌿' : branch.status === 'merged' ? '✅' : '🗑';

  return (
    <div className="px-1 py-1 rounded hover:bg-white/3 text-[11px]">
      <div className="flex items-center gap-2">
        <span>{statusIcon}</span>
        <span className="text-on-surface font-medium">{branch.name}</span>
        {branch.status !== 'active' && (
          <span className="text-[10px] text-on-surface-variant/30">[{branch.status}]</span>
        )}
      </div>
      {branch.description && (
        <div className="text-[10px] text-on-surface-variant/50 mt-0.5 pl-6">{branch.description}</div>
      )}
      <div className="flex gap-2 text-[10px] text-on-surface-variant/30 mt-0.5 pl-6">
        {branch.linkedEntryCount > 0 && <span>{branch.linkedEntryCount} entries</span>}
        {branch.linkedDiscussionCount > 0 && <span>{branch.linkedDiscussionCount} discussions</span>}
      </div>
    </div>
  );
}


function ManagedBranchRow({
  branch,
  onOpen,
  onDelete,
}: {
  branch: ConversationBranch;
  onOpen?: () => void;
  onDelete: () => void;
}) {
  const statusColors: Record<string, string> = {
    active: 'text-emerald-400',
    adopted: 'text-violet-400',
    archived: 'text-on-surface-variant/40',
    discarded: 'text-red-400/50',
  };

  return (
    <div className="px-1 py-1.5 rounded hover:bg-white/5 text-[11px] group">
      <div className="flex items-center gap-2">
        <GitFork size={12} className={statusColors[branch.status] ?? 'text-on-surface-variant/30'} />
        <span className="text-on-surface font-medium truncate flex-1">{branch.label}</span>
        {branch.status !== 'active' && (
          <span className="text-[9px] text-on-surface-variant/30 font-mono">{branch.status}</span>
        )}
        <div className="hidden group-hover:flex items-center gap-1 shrink-0">
          {onOpen && (
            <button
              onClick={onOpen}
              className="p-0.5 rounded text-on-surface-variant/40 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
              title="브랜치 열기"
            >
              <ArrowSquareOut size={12} />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-0.5 rounded text-on-surface-variant/40 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="브랜치 삭제"
          >
            <Trash size={12} />
          </button>
        </div>
      </div>
      {branch.gitBranch && (
        <div className="text-[10px] text-on-surface-variant/30 pl-5 mt-0.5">→ {branch.gitBranch}</div>
      )}
    </div>
  );
}

// --- Main ContextPanel ---
export function ContextPanel() {
  const activeTab = useContextStore(s => s.activeTab);
  const activeProjectKey = useChatStore(s => s.activeProjectKey);
  const activeConversationId = useChatStore(s => s.activeConversationId);
  const isConnected = useSystemStore(s => s.isConnected);

  // 프로젝트/대화 변경 시 이전 데이터 초기화 후 재요청
  useEffect(() => {
    useContextStore.getState().clear();
    if (!isConnected || !activeProjectKey) return;
    const params: Record<string, string> = { project: activeProjectKey };
    if (activeConversationId) params.conversation_id = activeConversationId;
    wsClient.sendRpc('project.context', params);
    // rawq code map 요청 (overview 탭 구조 뷰용)
    wsClient.getCodeMap(activeProjectKey);
  }, [activeProjectKey, activeConversationId, isConnected]);

  // 탭 변경 시 상세 데이터 요청
  useEffect(() => {
    if (!isConnected || !activeProjectKey) return;
    const params: Record<string, string> = { project: activeProjectKey };
    if (activeConversationId) params.conversation_id = activeConversationId;

    if (activeTab === 'branches') {
      wsClient.sendRpc('branch.list.json', params);
    } else if (activeTab === 'memory') {
      wsClient.sendRpc('memory.list.json', params);
    }
  }, [activeTab, activeProjectKey, activeConversationId, isConnected]);

  return (
    <aside className="h-full bg-[#131313] border-l border-outline-variant overflow-hidden font-sans flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-outline-variant/40 flex items-center justify-between shrink-0">
        <h2 className="text-[11px] font-bold text-on-surface uppercase tracking-widest">Context</h2>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={v => useContextStore.getState().setActiveTab(v as ContextTab)}
        className="flex flex-col flex-1 min-h-0 gap-0"
      >
        <TabsList variant="line" className="w-full shrink-0 border-b border-outline-variant/30 rounded-none bg-transparent h-auto p-0">
          {TAB_KEYS.map(t => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className="flex-1 py-2 text-[11px] font-semibold uppercase tracking-wider rounded-none border-0 h-auto
                text-on-surface-variant/50 hover:text-on-surface-variant/80
                data-active:text-primary data-active:shadow-none"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="flex-1 min-h-0">
          <ScrollArea className="h-full"><OverviewTab /></ScrollArea>
        </TabsContent>
        <TabsContent value="memory" className="flex-1 min-h-0">
          <ScrollArea className="h-full"><MemoryTab /></ScrollArea>
        </TabsContent>
        <TabsContent value="branches" className="flex-1 min-h-0">
          <ScrollArea className="h-full"><BranchesTab /></ScrollArea>
        </TabsContent>
        <TabsContent value="code" className="flex-1 min-h-0">
          <CodeSearchTab />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

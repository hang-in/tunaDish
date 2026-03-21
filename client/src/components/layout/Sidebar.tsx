import { useChatStore } from '@/store/chatStore';
import { useSystemStore } from '@/store/systemStore';
import { useContextStore } from '@/store/contextStore';
import { wsClient } from '@/lib/wsClient';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Plus,
  GearSix,
  MagnifyingGlass,
  Lightning,
  Eye,
  Brain,
  Broadcast,
  BookOpen,
  Trash,
  CaretDown,
  CaretRight,
  Folder,
  Cpu,
} from '@phosphor-icons/react';
import { SidebarTree } from './SidebarTree';

// ── Collapsible sub-section (ContextMemorySection용으로 유지) ────
function SubSection({
  title,
  icon,
  children,
  count,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  count?: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1">
      <div
        className="flex items-center justify-between pl-[26px] pr-2 py-1 cursor-pointer group"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-on-surface-variant/40 group-hover:text-on-surface-variant/60 transition-colors">{icon}</span>
          <span className="text-[10px] font-semibold tracking-wider text-on-surface-variant/40 uppercase group-hover:text-on-surface-variant/60 transition-colors">
            {title}
          </span>
          {count !== undefined && count > 0 && (
            <span className="text-[9px] text-on-surface-variant/25 font-mono">{count}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {open
            ? <CaretDown size={9} className="text-on-surface-variant/25 group-hover:text-on-surface-variant/50" />
            : <CaretRight size={9} className="text-on-surface-variant/25 group-hover:text-on-surface-variant/50" />
          }
        </div>
      </div>
      {open && <nav className="space-y-px">{children}</nav>}
    </div>
  );
}

// ── Memory entry row with expand/delete ──────────────────────────
function MemoryEntryRow({ entry }: { entry: { id: string; title: string; content?: string; type: string; source?: string } }) {
  const [expanded, setExpanded] = useState(false);
  const activeConvId = useChatStore(s => s.activeConversationId);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeConvId) return;
    useContextStore.getState().removeMemoryEntry(entry.id);
    wsClient.sendRpc('memory.delete', { conversation_id: activeConvId, id: entry.id });
  };

  return (
    <div
      className="pl-10 pr-2 py-1 text-[10px] hover:bg-white/3 rounded cursor-pointer group/mem"
      onClick={() => setExpanded(o => !o)}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-on-surface-variant/70 font-medium truncate flex-1">{entry.title}</span>
        <button
          type="button"
          tabIndex={-1}
          onClick={handleDelete}
          className="hidden group-hover/mem:flex items-center justify-center size-3.5 rounded text-on-surface-variant/25 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
          title="삭제"
        >
          <Trash size={9} />
        </button>
      </div>
      {expanded && entry.content && (
        <div className="mt-1 text-[9px] text-on-surface-variant/40 leading-relaxed whitespace-pre-wrap break-words">
          {entry.content}
        </div>
      )}
    </div>
  );
}

// ── Context & Memory compact section (sidebar bottom) ─────────────
function ContextMemorySection() {
  const ctx = useContextStore(s => s.projectContext);
  const memoryEntries = useContextStore(s => s.memoryEntries);
  const activeConvId = useChatStore(s => s.activeConversationId);
  const activeProjectKey = useChatStore(s => s.activeProjectKey);
  const projects = useChatStore(s => s.projects);
  const isConnected = useSystemStore(s => s.isConnected);

  const activeProject = projects.find(p => p.key === activeProjectKey);

  useEffect(() => {
    useContextStore.getState().clear();
    if (!isConnected || !activeProjectKey) return;
    const params: Record<string, string> = { project: activeProjectKey };
    if (activeConvId) params.conversation_id = activeConvId;
    wsClient.sendRpc('project.context', params);
    wsClient.sendRpc('memory.list.json', params);
  }, [activeProjectKey, activeConvId, isConnected]);

  if (!ctx) return null;

  return (
    <div className="border-t border-outline-variant/20 pt-1 mt-1">
      <SubSection title="Overview" icon={<Lightning size={11} />} defaultOpen>
        <div className="pl-10 pr-2 space-y-1 text-[10px] text-on-surface-variant/60">
          {ctx.model && (
            <div className="flex items-center gap-1.5">
              <Cpu size={10} weight="fill" className="text-primary shrink-0" />
              <span className="font-mono truncate">{ctx.model}</span>
            </div>
          )}
          {activeProject && (
            <div className="flex items-center gap-1.5">
              <Folder size={10} className="shrink-0" />
              <span className="truncate">{activeProject.name}</span>
            </div>
          )}
          {ctx.persona && (
            <div className="flex items-center gap-1.5">
              <Brain size={10} className="shrink-0" />
              <span>persona: {ctx.persona}</span>
            </div>
          )}
          {ctx.triggerMode && (
            <div className="flex items-center gap-1.5">
              <Broadcast size={10} className="shrink-0" />
              <span>trigger: {ctx.triggerMode}</span>
            </div>
          )}
          {ctx.pendingReviewCount > 0 && (
            <div className="flex items-center gap-1.5">
              <Eye size={10} className="text-amber-400 shrink-0" />
              <span>{ctx.pendingReviewCount} pending reviews</span>
            </div>
          )}
        </div>
      </SubSection>

      {memoryEntries.length > 0 && (
        <SubSection title="Memory" icon={<BookOpen size={11} />} count={memoryEntries.length} defaultOpen>
          {memoryEntries.map(e => (
            <MemoryEntryRow key={e.id} entry={e} />
          ))}
        </SubSection>
      )}
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────
export function Sidebar() {
  const projects = useChatStore(s => s.projects);
  const activeProjectKey = useChatStore(s => s.activeProjectKey);
  const isConnected = useSystemStore(s => s.isConnected);
  const [search, setSearch] = useState('');

  // 연결(재연결) 시 프로젝트 목록 + 활성 프로젝트 대화 목록 리프레시
  useEffect(() => {
    if (!isConnected) return;
    wsClient.sendRpc('project.list');
    if (activeProjectKey) {
      wsClient.sendRpc('conversation.list', { project: activeProjectKey });
      wsClient.sendRpc('branch.list.json', { project: activeProjectKey });
    }
  }, [isConnected]);

  const handleNewSession = () => {
    if (!activeProjectKey) return;
    const newId = crypto.randomUUID();
    wsClient.sendRpc('conversation.create', { conversation_id: newId, project: activeProjectKey });
  };

  return (
    <aside className="h-full w-full flex flex-col bg-[#131313] font-sans tracking-tight leading-none py-3 shrink-0 px-2">

      {/* Search */}
      <div className="relative mb-3 px-1">
        <MagnifyingGlass size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/30" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full bg-white/5 border-none rounded-md text-[11px] pl-7 pr-2 py-1.5 text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {/* New Session CTA */}
      <button
        onClick={handleNewSession}
        disabled={!activeProjectKey}
        className="flex items-center gap-2 w-full px-2 py-1.5 mb-3 text-on-surface-variant hover:bg-white/5 hover:text-on-surface rounded-[4px] transition-all active:scale-[0.98] disabled:opacity-30 text-[13px]"
      >
        <Plus size={14} weight="bold" />
        <span className="font-medium">New Session</span>
      </button>

      {/* Tree */}
      <div className="flex-grow overflow-hidden flex flex-col min-h-0">
        {projects.length === 0 ? (
          <div className="px-2 py-6 text-[11px] text-on-surface-variant/30 text-center">
            {isConnected ? 'Loading...' : '연결 안됨'}
          </div>
        ) : (
          <SidebarTree searchTerm={search} />
        )}
      </div>

      {/* Context & Memory (bottom section) */}
      <ContextMemorySection />

      {/* Footer */}
      <div className="pt-2 border-t border-outline-variant/20">
        <div className="px-2 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px]">
            <span className={cn(
              'size-[6px] rounded-full shrink-0',
              isConnected ? 'bg-[#5e6ad2]' : 'bg-on-surface-variant/20',
            )} />
            <span className="text-on-surface-variant/60 font-medium tracking-wide">
              {isConnected ? 'Connected' : '연결 안됨'}
            </span>
          </div>
          <div className="flex gap-1.5 items-center">
            <button className="text-on-surface-variant/50 hover:text-on-surface transition-colors p-1 rounded hover:bg-white/5" title="Settings">
              <GearSix size={14} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

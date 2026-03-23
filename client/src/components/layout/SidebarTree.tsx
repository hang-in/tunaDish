import { useState, useCallback, useRef } from 'react';
import { useSidebarTreeData, type SidebarNode } from '@/lib/sidebarTreeData';
import { useChatStore } from '@/store/chatStore';
import { useRunStore } from '@/store/runStore';
import { useSystemStore } from '@/store/systemStore';
import { wsClient } from '@/lib/wsClient';
import * as dbSync from '@/lib/dbSync';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  GitBranch,
  ChatCircle,
  ChatsCircle,
  CircleNotch,
  Plus,
  CaretDown,
  CaretRight,
  Folder,
  Lightning,
  PauseCircle,
  Eye,
  Trash,
} from '@phosphor-icons/react';

const INDENT = 16;
const ROW_H = 28;
const LINE_CLR = 'rgba(255,255,255,0.12)';

// ─── Public component ────────────────────────────────────────────
interface SidebarTreeProps { searchTerm: string }

export function SidebarTree({ searchTerm }: SidebarTreeProps) {
  const data = useSidebarTreeData(searchTerm);
  return (
    <ScrollArea className="h-full pr-0.5">
      <TreeNodeList nodes={data} lineGuides={[]} />
    </ScrollArea>
  );
}

// ─── Recursive list ──────────────────────────────────────────────
// lineGuides[i] = true → depth i에 수직 연속선 표시
function TreeNodeList({ nodes, lineGuides }: { nodes: SidebarNode[]; lineGuides: boolean[] }) {
  return (
    <>
      {nodes.map((node, idx) => (
        <TreeNodeItem
          key={node.id}
          node={node}
          isLast={idx === nodes.length - 1}
          lineGuides={lineGuides}
        />
      ))}
    </>
  );
}

// ─── Single node + children ──────────────────────────────────────
function TreeNodeItem({ node, isLast, lineGuides }: {
  node: SidebarNode;
  isLast: boolean;
  lineGuides: boolean[];
}) {
  const depth = lineGuides.length;
  const [open, setOpen] = useState(() => defaultOpen(node));
  const toggle = useCallback(() => setOpen(o => !o), []);

  const hasChildren = (node.children?.length ?? 0) > 0;

  // separator 노드
  if (node.nodeType === 'separator') {
    return <div className="my-1.5 mx-2 border-t border-outline-variant/15" />;
  }

  // 자식에게 전달할 lineGuides: 현재 depth에 "형제가 더 있는지" 추가
  const childGuides = [...lineGuides, !isLast];

  return (
    <>
      {/* ── Row ── */}
      <div className="relative flex items-center" style={{ minHeight: ROW_H }}>
        {/* 트리 연결선 */}
        <TreeGuides lineGuides={lineGuides} isLast={isLast} depth={depth} />

        {/* 컨텐츠 (paddingLeft = depth * INDENT) */}
        <div
          className="flex items-center flex-1 min-w-0 leading-normal"
          style={{ paddingLeft: depth * INDENT }}
        >
          <NodeContent node={node} open={open} toggle={toggle} hasChildren={hasChildren} />
        </div>
      </div>

      {/* ── Children ── */}
      {open && hasChildren && (
        <TreeNodeList nodes={node.children!} lineGuides={childGuides} />
      )}
    </>
  );
}

// ─── Tree guide lines (SVG) ─────────────────────────────────────
// depth > 0 인 노드만 그린다.
function TreeGuides({ lineGuides, isLast, depth }: {
  lineGuides: boolean[];
  isLast: boolean;
  depth: number;
}) {
  if (depth === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: depth * INDENT, height: ROW_H }}
      aria-hidden
    >
      {/* 상위 depth 수직 연속선 — i=0(루트)은 스킵, i>=1은 부모 커넥터 x로 보정 */}
      {lineGuides.map((show, i) =>
        show && i > 0 ? (
          <line
            key={i}
            x1={(i - 1) * INDENT + INDENT / 2} y1={0}
            x2={(i - 1) * INDENT + INDENT / 2} y2={ROW_H}
            stroke={LINE_CLR} strokeWidth={1}
          />
        ) : null,
      )}

      {/* 현재 depth 커넥터: ├── 또는 └── */}
      {(() => {
        const x = (depth - 1) * INDENT + INDENT / 2;
        const midY = ROW_H / 2;
        return (
          <>
            {/* 세로선: 위에서 중간(└) 또는 위에서 아래(├) */}
            <line
              x1={x} y1={0}
              x2={x} y2={isLast ? midY : ROW_H}
              stroke={LINE_CLR} strokeWidth={1}
            />
            {/* 가로선: 중간에서 오른쪽으로 */}
            <line
              x1={x} y1={midY}
              x2={x + INDENT / 2 + 2} y2={midY}
              stroke={LINE_CLR} strokeWidth={1}
            />
          </>
        );
      })()}
    </svg>
  );
}

// ─── Node content by type ────────────────────────────────────────
function NodeContent({ node, open, toggle, hasChildren }: {
  node: SidebarNode;
  open: boolean;
  toggle: () => void;
  hasChildren: boolean;
}) {
  switch (node.nodeType) {
    case 'category':
      return <CategoryRow node={node} open={open} toggle={toggle} />;
    case 'project':
      return <ProjectRow node={node} open={open} toggle={toggle} />;
    case 'session':
      return <SessionRow node={node} open={open} toggle={toggle} hasChildren={hasChildren} />;
    case 'git-section':
      return <GitSectionRow node={node} open={open} toggle={toggle} />;
    case 'gitBranch':
      return <GitBranchRow node={node} />;
    default:
      return null;
  }
}

function defaultOpen(node: SidebarNode): boolean {
  switch (node.nodeType) {
    case 'category':
      // DISC(discovered)는 접힌 채로, 나머지(Projects, Chat)는 열린 채로
      return node.id !== 'cat:disc';
    case 'project': return true;
    case 'session': return true;
    case 'git-section': return false;
    default: return false;
  }
}

// ─── Arrow ───────────────────────────────────────────────────────
function Arrow({ open }: { open: boolean }) {
  return open
    ? <CaretDown size={10} className="text-on-surface-variant/30 shrink-0" />
    : <CaretRight size={10} className="text-on-surface-variant/30 shrink-0" />;
}

function TransportIcon({ source, active }: { source?: string; active: boolean }) {
  switch (source) {
    case 'mattermost':
      return <ChatsCircle size={14} weight={active ? 'fill' : 'regular'} className="text-blue-400/70" />;
    case 'slack':
      return <Lightning size={14} weight={active ? 'fill' : 'regular'} className="text-amber-400/70" />;
    default:
      return <ChatCircle size={14} weight={active ? 'fill' : 'regular'} className="text-emerald-400/60" />;
  }
}

// ─── Category ────────────────────────────────────────────────────
function CategoryRow({ node, open, toggle }: { node: SidebarNode; open: boolean; toggle: () => void }) {
  const icon = node.id === 'cat:disc'
    ? <GitBranch size={11} />
    : node.id === 'cat:chat'
      ? <ChatCircle size={11} />
      : <Folder size={11} />;

  return (
    <div className="flex items-center justify-between w-full px-1 cursor-pointer group" onClick={toggle}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="shrink-0 self-center text-on-surface-variant/40 group-hover:text-on-surface-variant/60 transition-colors">{icon}</span>
        <span className="text-[10px] font-semibold tracking-wider text-on-surface-variant/40 uppercase group-hover:text-on-surface-variant/60 transition-colors">
          {node.name}
        </span>
        {(node.count ?? 0) > 0 && <span className="text-[9px] text-on-surface-variant/25 font-mono">{node.count}</span>}
      </div>
      <Arrow open={open} />
    </div>
  );
}

// ─── Project ─────────────────────────────────────────────────────
function ProjectRow({ node, open, toggle }: { node: SidebarNode; open: boolean; toggle: () => void }) {
  const activeProjectKey = useChatStore(s => s.activeProjectKey);
  const setActiveProject = useChatStore(s => s.setActiveProject);
  const isConnected = useSystemStore(s => s.isConnected);
  const isActive = activeProjectKey === node.projectKey;

  const handleClick = () => {
    if (node.projectKey) {
      setActiveProject(node.projectKey);
      if (isConnected) {
        wsClient.sendRpc('conversation.list', { project: node.projectKey });
        wsClient.sendRpc('branch.list.json', { project: node.projectKey });
      }
    }
    // 비활성 프로젝트 클릭 시 자동 펼침 (이미 열려있으면 유지)
    if (!open) toggle();
  };

  const handleNewSession = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.projectKey) {
      wsClient.sendRpc('conversation.create', { conversation_id: crypto.randomUUID(), project: node.projectKey });
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 min-w-0 w-full pr-1 rounded cursor-pointer group/proj transition-colors',
        isActive ? 'bg-white/5' : 'hover:bg-white/3',
      )}
      onClick={handleClick}
    >
      <span className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors" onClick={e => { e.stopPropagation(); toggle(); }}>
        <Arrow open={open} />
      </span>
      <Folder size={14} weight={isActive ? 'fill' : 'regular'} className={isActive ? 'text-primary shrink-0' : 'text-on-surface-variant/60 shrink-0'} />
      <span className={cn('text-[12px] truncate flex-1', isActive ? 'text-on-surface font-medium' : 'text-on-surface-variant/70')}>
        {node.name}
      </span>
      {node.isDiscovered && (
        <span className="text-[8px] px-1 py-px rounded bg-white/5 text-on-surface-variant/30 font-medium uppercase shrink-0">Disc</span>
      )}
      {!open && (node.count ?? 0) > 0 && (
        <span className="text-[9px] text-on-surface-variant/25 shrink-0 group-hover/proj:hidden">{node.count} sessions</span>
      )}
      <button
        onClick={handleNewSession}
        className="hidden group-hover/proj:flex items-center justify-center size-4 rounded text-on-surface-variant/30 hover:text-on-surface-variant hover:bg-white/5 transition-colors shrink-0"
        title="New session"
      >
        <Plus size={9} weight="bold" />
      </button>
    </div>
  );
}

// ─── Session ─────────────────────────────────────────────────────
function SessionRow({ node, open, toggle, hasChildren }: {
  node: SidebarNode; open: boolean; toggle: () => void; hasChildren: boolean;
}) {
  const conv = node.conv;
  if (!conv) return null;

  const activeConvId = useChatStore(s => s.activeConversationId);
  const setActive = useChatStore(s => s.setActiveConversation);
  const renameConversation = useChatStore(s => s.renameConversation);
  const runStatus = useRunStore(s => s.activeRuns[conv.id] ?? 'idle');
  const isActive = activeConvId === conv.id;
  const isRunning = runStatus === 'running';
  const isCancelling = runStatus === 'cancelling';

  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (editing) return;
    setActive(conv.id);
    if (hasChildren && !open) toggle();
  };
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isRunning) wsClient.sendRpc('conversation.delete', { conversation_id: conv.id }).catch(console.error);
  };
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditLabel(conv.label);
    setEditing(true);
    setTimeout(() => { inputRef.current?.select(); }, 0);
  };
  const commitRename = () => {
    const trimmed = editLabel.trim();
    if (trimmed && trimmed !== conv.label) {
      renameConversation(conv.id, trimmed);
      dbSync.syncConvLabel(conv.id, trimmed);
    }
    setEditing(false);
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
    if (e.key === 'Escape') setEditing(false);
  };

  return (
    <div
      className={cn(
        'flex items-center min-w-0 w-full pr-1 rounded cursor-pointer transition-colors group/row',
        isActive
          ? 'bg-[var(--channel-active-bg)] text-[var(--channel-text-active)]'
          : 'text-[var(--channel-text)] hover:bg-[var(--channel-hover-bg)] hover:text-[var(--channel-text-active)]',
      )}
      onClick={handleClick}
    >
      {hasChildren && <span className="shrink-0 mr-0.5 p-0.5 rounded hover:bg-white/10 transition-colors" onClick={e => { e.stopPropagation(); toggle(); }}><Arrow open={open} /></span>}
      <span className="shrink-0 self-center w-[18px] flex items-center justify-center mr-1">
        <TransportIcon source={conv.source} active={isActive} />
      </span>
      {editing ? (
        <input
          ref={inputRef}
          value={editLabel}
          onChange={e => setEditLabel(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleKeyDown}
          onClick={e => e.stopPropagation()}
          className="flex-1 min-w-0 text-[13px] bg-white/10 border border-primary/40 rounded px-1 py-px outline-none"
          autoFocus
        />
      ) : (
        <span className="flex-1 truncate text-[13px]" onDoubleClick={handleDoubleClick}>{conv.label}</span>
      )}
      <span className="shrink-0 flex items-center gap-0.5 ml-1">
        {conv.hasResumeToken && <PauseCircle size={10} className="text-on-surface-variant/30" />}
        {(conv.pendingReviewCount ?? 0) > 0 && <Eye size={10} className="text-amber-400/50" />}
        {isRunning && <CircleNotch size={11} weight="bold" className="text-emerald-400 animate-spin" />}
        {isCancelling && <CircleNotch size={11} weight="bold" className="text-amber-400 animate-spin" />}
      </span>
      {!editing && !isRunning && conv.source !== 'mattermost' && conv.source !== 'slack' && (
        <button type="button" tabIndex={-1} onClick={handleDelete}
          className="hidden group-hover/row:flex items-center justify-center size-4 rounded text-on-surface-variant/30 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0 ml-0.5"
          title="Delete session">
          <Trash size={10} />
        </button>
      )}
      {isActive && <div className="absolute left-0 top-[20%] bottom-[20%] w-0.5 rounded bg-[var(--channel-unread-indicator)]" />}
    </div>
  );
}

// ─── Git Section ─────────────────────────────────────────────────
function GitSectionRow({ node, open, toggle }: { node: SidebarNode; open: boolean; toggle: () => void }) {
  return (
    <div className="flex items-center justify-between w-full pr-1 cursor-pointer group" onClick={toggle}>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <GitBranch size={11} className="text-on-surface-variant/40 group-hover:text-on-surface-variant/60 transition-colors shrink-0 self-center" />
        <span className="text-[10px] font-semibold tracking-wider text-on-surface-variant/40 uppercase group-hover:text-on-surface-variant/60 transition-colors">
          {node.name}
        </span>
        {(node.count ?? 0) > 0 && <span className="text-[9px] text-on-surface-variant/25 font-mono">{node.count}</span>}
      </div>
      <Arrow open={open} />
    </div>
  );
}

// ─── Git Branch ──────────────────────────────────────────────────
function GitBranchRow({ node }: { node: SidebarNode }) {
  const gb = node.gitBranch;
  if (!gb) return null;
  return (
    <div className="flex items-center gap-1.5 w-full pr-1 text-[11px] text-on-surface-variant/60 hover:bg-white/3 rounded cursor-default">
      <GitBranch size={12} className={cn('shrink-0 self-center', gb.status === 'active' ? 'text-emerald-400/60' : 'text-on-surface-variant/25')} />
      <span className="truncate flex-1">{gb.name}</span>
      {gb.linkedEntryCount > 0 && <span className="text-[9px] text-on-surface-variant/25 shrink-0">{gb.linkedEntryCount} entries</span>}
    </div>
  );
}

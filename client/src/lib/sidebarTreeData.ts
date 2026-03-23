import { useMemo } from 'react';
import { useChatStore, type Conversation } from '@/store/chatStore';
import { useContextStore, type ConversationBranch, type GitBranch } from '@/store/contextStore';

// ── Node types ───────────────────────────────────────────────────

export type NodeType =
  | 'category'       // Projects / Disc / Chat top-level header
  | 'separator'      // 카테고리 간 구분선
  | 'project'
  | 'session'
  | 'convBranch'
  | 'git-section'
  | 'gitBranch';

export interface SidebarNode {
  id: string;
  name: string;
  nodeType: NodeType;
  children?: SidebarNode[];
  // Original data refs
  conv?: Conversation;
  branch?: ConversationBranch;
  gitBranch?: GitBranch;
  projectKey?: string;
  isDiscovered?: boolean;
  /** category 안에 세션/브랜치 수 표시용 */
  count?: number;
}

// ── Stable empty array (Zustand selector 안정성) ─────────────────
const EMPTY_BRANCHES: ConversationBranch[] = [];

/** 플랫 브랜치 리스트 → parentBranchId 기반 트리 구조 변환 */
function buildBranchTree(branches: ConversationBranch[], projectKey: string): SidebarNode[] {
  const byId = new Map(branches.map(b => [b.id, b]));
  const childrenOf = new Map<string | undefined, ConversationBranch[]>();

  for (const b of branches) {
    // parentBranchId가 같은 프로젝트 브랜치에 있을 때만 자식으로 배치
    const parentKey = b.parentBranchId && byId.has(b.parentBranchId) ? b.parentBranchId : undefined;
    const list = childrenOf.get(parentKey) ?? [];
    list.push(b);
    childrenOf.set(parentKey, list);
  }

  function toNodes(parentId: string | undefined): SidebarNode[] {
    const list = childrenOf.get(parentId) ?? [];
    return list.map(b => {
      const sub = toNodes(b.id);
      return {
        id: `convbranch:${b.id}`,
        name: b.label,
        nodeType: 'convBranch' as const,
        branch: b,
        projectKey,
        children: sub.length > 0 ? sub : undefined,
      };
    });
  }

  return toNodes(undefined);
}

// ── Hook ─────────────────────────────────────────────────────────

export function useSidebarTreeData(searchTerm: string): SidebarNode[] {
  const projects = useChatStore(s => s.projects);
  const conversations = useChatStore(s => s.conversations);
  const activeProjectKey = useChatStore(s => s.activeProjectKey);
  const gitBranches = useContextStore(s => s.gitBranches);
  const convBranchesByProject = useContextStore(s => s.convBranchesByProject);

  return useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    // 3-way categorization
    const configured = projects.filter(p => p.source === 'configured' && p.type !== 'channel');
    const discovered = projects.filter(p => p.source === 'discovered');
    const channels = projects.filter(p => p.type === 'channel');

    function buildProjectNode(proj: typeof projects[0], isDisc: boolean): SidebarNode | null {
      const pk = proj.key;
      const convs = Object.values(conversations)
        .filter(c => c.projectKey === pk && c.type !== 'branch' && !c.id.startsWith('__'))
        .sort((a, b) => {
          const o: Record<string, number> = { main: 0, discussion: 1 };
          return (o[a.type] ?? 2) - (o[b.type] ?? 2) || (a.createdAt - b.createdAt);
        });

      // Search filter: project name or session label must match
      if (q) {
        const projectMatch = proj.name.toLowerCase().includes(q) || pk.toLowerCase().includes(q);
        const sessionMatch = convs.some(c => c.label.toLowerCase().includes(q));
        if (!projectMatch && !sessionMatch) return null;
      }

      const children: SidebarNode[] = [];

      // Conv branches per session (세션별 매핑)
      const projectBranches = convBranchesByProject[pk] ?? EMPTY_BRANCHES;
      const activeBranches = projectBranches.filter(b => b.status === 'active');

      // 세션: 프로젝트 직접 자식, conv branches는 세션의 자식으로 배치
      const filteredConvs = convs
        .filter(c => !q || c.label.toLowerCase().includes(q) || proj.name.toLowerCase().includes(q));

      for (const c of filteredConvs) {
        // 이 세션에 속하는 브랜치 (rtSessionId로 매핑, 없으면 빈 배열)
        const sessionBranches = activeBranches.filter(
          b => b.rtSessionId === c.id,
        );
        // parentBranchId 기반 트리 구조 변환
        const branchChildren = buildBranchTree(sessionBranches, pk);

        children.push({
          id: `session:${c.id}`,
          name: c.label,
          nodeType: 'session' as const,
          conv: c,
          projectKey: pk,
          children: branchChildren.length > 0 ? branchChildren : undefined,
        });
      }

      // rtSessionId가 없거나 매칭 안 되는 orphan branches → 프로젝트 직접 자식 (트리 구조)
      const mappedBranchIds = new Set(
        activeBranches.filter(b => filteredConvs.some(c => c.id === b.rtSessionId)).map(b => b.id),
      );
      const orphanBranches = activeBranches.filter(b => !mappedBranchIds.has(b.id));
      if (orphanBranches.length > 0) {
        children.push(...buildBranchTree(orphanBranches, pk));
      }

      // Git branches (active project only — requires project.context data)
      const isActive = activeProjectKey === pk;
      if (isActive && gitBranches.length > 0) {
        children.push({
          id: `gitbranches:${pk}`,
          name: 'Git Branches',
          nodeType: 'git-section',
          children: gitBranches.map(b => ({
            id: `gitbranch:${b.name}`,
            name: b.name,
            nodeType: 'gitBranch' as const,
            gitBranch: b,
            projectKey: pk,
          })),
          count: gitBranches.length,
          projectKey: pk,
        });
      }

      return {
        id: `project:${pk}`,
        name: proj.name,
        nodeType: 'project',
        children,
        projectKey: pk,
        isDiscovered: isDisc,
        count: convs.length,
      };
    }

    function buildCategory(
      id: string,
      name: string,
      list: typeof projects,
      isDisc: boolean,
    ): SidebarNode | null {
      const nodes = list
        .map(p => buildProjectNode(p, isDisc))
        .filter((n): n is SidebarNode => n !== null);
      if (nodes.length === 0) return null;
      return {
        id,
        name,
        nodeType: 'category',
        children: nodes,
        count: nodes.length,
      };
    }

    const result: SidebarNode[] = [];
    let sepIdx = 0;

    const projCat = buildCategory('cat:projects', 'Projects', configured, false);
    if (projCat) result.push(projCat);

    const discCat = buildCategory('cat:disc', 'Disc', discovered, true);
    if (discCat) {
      if (result.length > 0) result.push({ id: `sep:${sepIdx++}`, name: '', nodeType: 'separator' });
      result.push(discCat);
    }

    const chanCat = buildCategory('cat:chat', 'Chat', channels, false);
    if (chanCat) {
      if (result.length > 0) result.push({ id: `sep:${sepIdx++}`, name: '', nodeType: 'separator' });
      result.push(chanCat);
    }

    return result;
  }, [projects, conversations, activeProjectKey, gitBranches, convBranchesByProject, searchTerm]);
}

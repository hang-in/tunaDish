import { useMemo } from 'react';
import { useChatStore, type Conversation } from '@/store/chatStore';
import { useContextStore, type GitBranch } from '@/store/contextStore';

// ── Node types ───────────────────────────────────────────────────

export type NodeType =
  | 'category'       // Projects / Disc / Chat top-level header
  | 'separator'      // 카테고리 간 구분선
  | 'project'
  | 'session'
  | 'git-section'
  | 'gitBranch';

export interface SidebarNode {
  id: string;
  name: string;
  nodeType: NodeType;
  children?: SidebarNode[];
  // Original data refs
  conv?: Conversation;
  gitBranch?: GitBranch;
  projectKey?: string;
  isDiscovered?: boolean;
  /** category 안에 세션/브랜치 수 표시용 */
  count?: number;
}

// ── Hook ─────────────────────────────────────────────────────────

export function useSidebarTreeData(searchTerm: string): SidebarNode[] {
  const projects = useChatStore(s => s.projects);
  const conversations = useChatStore(s => s.conversations);
  const activeProjectKey = useChatStore(s => s.activeProjectKey);
  const gitBranches = useContextStore(s => s.gitBranches);

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
          // 1. 삭제 불가 세션(mattermost/slack) 최상위 고정
          const pinA = (a.source === 'mattermost' || a.source === 'slack') ? 0 : 1;
          const pinB = (b.source === 'mattermost' || b.source === 'slack') ? 0 : 1;
          if (pinA !== pinB) return pinA - pinB;
          // 2. 나머지: 알파벳 오름차순 (A→Z)
          return a.label.localeCompare(b.label);
        });

      // Search filter: project name or session label must match
      if (q) {
        const projectMatch = proj.name.toLowerCase().includes(q) || pk.toLowerCase().includes(q);
        const sessionMatch = convs.some(c => c.label.toLowerCase().includes(q));
        if (!projectMatch && !sessionMatch) return null;
      }

      const children: SidebarNode[] = [];

      // 세션만 표시 (브랜치는 하단 탭 패널로 이동)
      const filteredConvs = convs
        .filter(c => !q || c.label.toLowerCase().includes(q) || proj.name.toLowerCase().includes(q));

      for (const c of filteredConvs) {
        children.push({
          id: `session:${c.id}`,
          name: c.label,
          nodeType: 'session' as const,
          conv: c,
          projectKey: pk,
        });
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

    const chanCat = buildCategory('cat:chat', 'Chat', channels, false);
    if (chanCat) {
      if (result.length > 0) result.push({ id: `sep:${sepIdx++}`, name: '', nodeType: 'separator' });
      result.push(chanCat);
    }

    const discCat = buildCategory('cat:disc', 'Disc', discovered, true);
    if (discCat) {
      if (result.length > 0) result.push({ id: `sep:${sepIdx++}`, name: '', nodeType: 'separator' });
      result.push(discCat);
    }

    return result;
  }, [projects, conversations, activeProjectKey, gitBranches, searchTerm]);
}

import { useChatStore } from '@/store/chatStore';
import { useSystemStore } from '@/store/systemStore';
import { wsClient } from '@/lib/wsClient';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  GearSix,
  GitFork,
  BookOpen,
  Archive,
} from '@phosphor-icons/react';
import { SidebarTree } from './SidebarTree';
import { BranchTabContent } from './sidebar/BranchTab';
import { MemoTabContent } from './sidebar/MemoTab';
import { ArchiveTabContent } from './sidebar/ArchiveTab';

// ── Main Sidebar ──────────────────────────────────────────────────
export function Sidebar() {
  const projects = useChatStore(s => s.projects);
  const activeProjectKey = useChatStore(s => s.activeProjectKey);
  const isConnected = useSystemStore(s => s.isConnected);
  const isDbConnected = useSystemStore(s => s.isDbConnected);

  // 연결(재연결) 시 프로젝트 목록 리프레시
  useEffect(() => {
    if (!isConnected) return;
    wsClient.sendRpc('project.list');
  }, [isConnected]);

  // project.list 응답 후 → 모든 프로젝트의 대화 로드
  useEffect(() => {
    if (!isConnected || projects.length === 0) return;
    for (const p of projects) {
      wsClient.sendRpc('conversation.list', { project: p.key });
    }
    if (activeProjectKey) {
      wsClient.sendRpc('branch.list.json', { project: activeProjectKey });
    }
  }, [isConnected, projects.length]);

  return (
    <aside className="h-full w-full flex flex-col bg-[#131313] font-sans tracking-tight leading-none py-3 shrink-0 px-2">

      {/* 상단: 트리 */}
      <ScrollArea className="flex-1 min-h-0">
        {projects.length === 0 ? (
          <div className="px-2 py-6 text-[11px] text-on-surface-variant/30 text-center">
            {isConnected ? 'Loading...' : '연결 안됨'}
          </div>
        ) : (
          <SidebarTree searchTerm="" />
        )}
      </ScrollArea>

      {/* 하단: 탭 패널 */}
      <div className="flex-1 min-h-0 border-t border-outline-variant/20 flex flex-col">
        <Tabs defaultValue="branches" className="flex flex-col h-full gap-0">
          <TabsList variant="line" className="w-full shrink-0 px-1 pt-1">
            <TabsTrigger value="branches" className="text-[10px] px-2 py-1 h-6 gap-1">
              <GitFork size={10} />
              브랜치
            </TabsTrigger>
            <TabsTrigger value="memo" className="text-[10px] px-2 py-1 h-6 gap-1">
              <BookOpen size={10} />
              메모
            </TabsTrigger>
            <TabsTrigger value="archive" className="text-[10px] px-2 py-1 h-6 gap-1">
              <Archive size={10} />
              아카이브
            </TabsTrigger>
          </TabsList>
          <ScrollArea className="flex-1 min-h-0">
            <TabsContent value="branches">
              <BranchTabContent />
            </TabsContent>
            <TabsContent value="memo">
              <MemoTabContent />
            </TabsContent>
            <TabsContent value="archive">
              <ArchiveTabContent />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-outline-variant/20 shrink-0">
        <div className="px-2 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'size-[6px] rounded-full shrink-0',
                isConnected ? 'bg-emerald-400' : 'bg-red-400',
              )} />
              <span className="text-on-surface-variant/60 font-medium tracking-wide">API</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn(
                'size-[6px] rounded-full shrink-0',
                isDbConnected ? 'bg-emerald-400' : 'bg-red-400',
              )} />
              <span className="text-on-surface-variant/60 font-medium tracking-wide">DB</span>
            </div>
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

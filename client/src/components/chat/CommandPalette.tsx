import React from 'react';
import { cn } from '@/lib/utils';
import {
  MagnifyingGlass,
  Plus,
  TreeStructure,
  Lightning,
  UserCircle,
  Broadcast,
  Gear,
  BookOpen,
  Eye,
  Stop,
  GitBranch,
} from '@phosphor-icons/react';

export interface CmdDef {
  name: string;
  desc: string;
  icon: React.ReactNode;
  insert: string;          // text inserted into input (replaces "!" prefix)
  immediate?: boolean;     // if true, send immediately on select
}

export const COMMANDS: CmdDef[] = [
  { name: 'help', desc: '커맨드 및 엔진 목록', icon: <MagnifyingGlass size={14} className="text-on-surface-variant/60" />, insert: '!help', immediate: true },
  { name: 'new', desc: '새 대화 세션 시작', icon: <Plus size={14} className="text-emerald-400" />, insert: '!new', immediate: true },
  { name: 'search', desc: '코드 검색', icon: <MagnifyingGlass size={14} className="text-blue-400" />, insert: '!search ' },
  { name: 'map', desc: '프로젝트 구조 보기', icon: <TreeStructure size={14} className="text-emerald-400" />, insert: '!map ' },
  { name: 'model', desc: '엔진/모델 변경', icon: <Lightning size={14} className="text-primary" />, insert: '!model ' },
  { name: 'models', desc: '사용 가능한 모델 목록', icon: <Lightning size={14} className="text-primary/60" />, insert: '!models', immediate: true },
  { name: 'persona', desc: '페르소나 관리', icon: <UserCircle size={14} className="text-violet-400" />, insert: '!persona ' },
  { name: 'trigger', desc: '트리거 모드 변경', icon: <Broadcast size={14} className="text-emerald-400" />, insert: '!trigger ' },
  { name: 'status', desc: '현재 세션 상태', icon: <Gear size={14} className="text-blue-400" />, insert: '!status', immediate: true },
  { name: 'project', desc: '프로젝트 바인딩 관리', icon: <TreeStructure size={14} className="text-amber-400" />, insert: '!project ' },
  { name: 'memory', desc: '프로젝트 메모리 관리', icon: <BookOpen size={14} className="text-violet-400" />, insert: '!memory ' },
  { name: 'branch', desc: '대화 분기 관리', icon: <GitBranch size={14} className="text-violet-400" />, insert: '!branch ' },
  { name: 'context', desc: '프로젝트 컨텍스트 표시', icon: <Eye size={14} className="text-amber-400" />, insert: '!context', immediate: true },
  { name: 'cancel', desc: '실행 중인 작업 취소', icon: <Stop size={14} className="text-red-400" />, insert: '!cancel', immediate: true },
];

export function CommandPalette({ query, onSelect, selectedIndex }: {
  query: string;
  onSelect: (cmd: CmdDef) => void;
  selectedIndex: number;
}) {
  const filtered = COMMANDS.filter(c => c.name.includes(query.toLowerCase()));

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 mx-0 w-full max-w-sm bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl overflow-hidden z-20">
      <div className="px-3 py-1.5 border-b border-white/5 text-[10px] text-on-surface-variant/40 font-semibold uppercase tracking-wider">Commands</div>
      {filtered.map((cmd, i) => (
        <button
          key={cmd.name}
          onMouseDown={e => { e.preventDefault(); onSelect(cmd); }}
          className={cn(
            'flex items-center gap-2.5 w-full px-3 py-1.5 text-left transition-colors',
            i === selectedIndex % filtered.length
              ? 'bg-white/15 text-on-surface'
              : 'text-on-surface-variant/70 hover:bg-white/5',
          )}
        >
          {cmd.icon}
          <span className="text-[12px] font-medium">!{cmd.name}</span>
          <span className="text-[11px] text-on-surface-variant/40 ml-auto">{cmd.desc}</span>
        </button>
      ))}
    </div>
  );
}

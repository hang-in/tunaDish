import { useState } from 'react';
import { useSystemStore } from '@/store/systemStore';
import { MessageSearchResults } from './MessageSearchResults';
import { ArrowLeft, X } from '@phosphor-icons/react';

export function MobileSearch() {
  const open = useSystemStore(s => s.mobileSearchOpen);
  const close = () => useSystemStore.getState().setMobileSearchOpen(false);
  const [query, setQuery] = useState('');

  if (!open) return null;

  const handleClose = () => {
    close();
    setQuery('');
  };

  return (
    <div className="fixed inset-0 z-[60] bg-[#0e0e0e] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-12 border-b border-outline-variant/30 shrink-0">
        <button
          onClick={handleClose}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <ArrowLeft size={20} className="text-[#e5e2e1]/60" />
        </button>
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="메시지 검색..."
          className="flex-1 bg-transparent text-[14px] text-[#e5e2e1] placeholder:text-[#e5e2e1]/20 outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X size={16} className="text-[#e5e2e1]/40" />
          </button>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {query.trim().length >= 2 && (
          <MessageSearchResults
            query={query}
            onSelect={handleClose}
          />
        )}
      </div>
    </div>
  );
}

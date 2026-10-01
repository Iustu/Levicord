import { Hash, MessageCircle, Volume2, Search, X, Menu } from 'lucide-react';

export interface ChatHeaderProps {
  viewMode: 'channels' | 'dms';
  isVoiceChannel: boolean;
  channelName?: string;
  channelDescription?: string | null;
  dmDisplayName?: string;
  onToggleSidebar: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClearSearch: () => void;
}

export function ChatHeader({
  viewMode,
  isVoiceChannel,
  channelName,
  channelDescription,
  dmDisplayName,
  onToggleSidebar,
  searchQuery,
  onSearchChange,
  onClearSearch,
}: ChatHeaderProps) {
  return (
    <header className="chat-header">
      <button className="sidebar-toggle" onClick={onToggleSidebar} aria-label="Abrir menu">
        <Menu size={20} />
      </button>

      {viewMode === 'channels' ? (
        <div className="chat-header-title">
          <nav aria-label="Breadcrumb" className="chat-breadcrumbs">
            <span className="breadcrumb-section">Canais</span>
            <span className="breadcrumb-separator" aria-hidden="true">/</span>
          </nav>
          {isVoiceChannel ? (
            <Volume2 size={22} className="channel-icon" aria-hidden="true" />
          ) : (
            <Hash size={22} className="channel-icon" aria-hidden="true" />
          )}
          <h3>{channelName}</h3>
          {channelDescription && (
            <>
              <div className="chat-header-divider" aria-hidden="true" />
              <span className="channel-description">{channelDescription}</span>
            </>
          )}
        </div>
      ) : (
        <div className="chat-header-title">
          <nav aria-label="Breadcrumb" className="chat-breadcrumbs">
            <span className="breadcrumb-section">Mensagens Diretas</span>
            <span className="breadcrumb-separator" aria-hidden="true">/</span>
          </nav>
          <MessageCircle size={22} className="channel-icon" aria-hidden="true" />
          <h3>{dmDisplayName}</h3>
        </div>
      )}

      {viewMode === 'channels' && !isVoiceChannel && (
        <div className="chat-search">
          <Search size={14} className="chat-search-icon" aria-hidden="true" />
          <input
            className="chat-search-input"
            type="search"
            placeholder="Buscar mensagens..."
            aria-label="Buscar mensagens no canal"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button className="chat-search-clear" onClick={onClearSearch} aria-label="Limpar busca">
              <X size={12} />
            </button>
          )}
        </div>
      )}
    </header>
  );
}

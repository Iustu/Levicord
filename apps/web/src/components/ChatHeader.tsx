import { Hash, MessageCircle, Volume2, Search, X, Menu, Users, Phone, PhoneOff, Video } from 'lucide-react';

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
  isMembersSidebarOpen?: boolean;
  onToggleMembersSidebar?: () => void;
  onStartCall?: (isVideo: boolean) => void;
  isInDmCall?: boolean;
  onEndDmCall?: () => void;
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
  isMembersSidebarOpen,
  onToggleMembersSidebar,
  onStartCall,
  isInDmCall,
  onEndDmCall,
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

      {viewMode === 'dms' && dmDisplayName && (
        <div className="dm-call-controls" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isInDmCall ? (
            <>
              <span style={{ fontSize: '13px', color: '#23a55a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#23a55a', display: 'inline-block' }} />
                Em chamada
              </span>
              {onEndDmCall && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={onEndDmCall}
                  aria-label="Desconectar chamada"
                  title="Desconectar chamada"
                  style={{ color: '#ffffff', background: '#da373c', borderRadius: '4px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', border: 'none', cursor: 'pointer' }}
                >
                  <PhoneOff size={16} />
                  <span>Desconectar</span>
                </button>
              )}
            </>
          ) : (
            onStartCall && (
              <>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onStartCall(false)}
                  aria-label="Iniciar chamada de voz"
                  title="Iniciar chamada de voz"
                  style={{ color: '#b5bac1', padding: '6px', borderRadius: '4px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <Phone size={19} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onStartCall(true)}
                  aria-label="Iniciar chamada de vídeo"
                  title="Iniciar chamada de vídeo"
                  style={{ color: '#b5bac1', padding: '6px', borderRadius: '4px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <Video size={19} />
                </button>
              </>
            )
          )}
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

      {viewMode === 'channels' && onToggleMembersSidebar && (
        <button
          className={`icon-btn members-toggle-btn ${isMembersSidebarOpen ? 'active' : ''}`}
          onClick={onToggleMembersSidebar}
          aria-label="Alternar lista de membros"
          title={isMembersSidebarOpen ? 'Ocultar lista de membros' : 'Mostrar lista de membros'}
          style={{
            background: isMembersSidebarOpen ? 'rgba(79, 84, 92, 0.32)' : 'transparent',
            border: 'none',
            color: isMembersSidebarOpen ? '#f2f3f5' : '#b5bac1',
            borderRadius: '4px',
            padding: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: '12px',
            transition: 'all 0.15s ease',
          }}
        >
          <Users size={20} />
        </button>
      )}
    </header>
  );
}

import { useState, type RefObject } from 'react';
import {
  Hash,
  Plus,
  Pencil,
  Trash2,
  Volume2,
  Settings,
  LogOut,
  UserPlus,
  Server as ServerIcon,
  ChevronDown,
  ChevronRight,
  Mic,
  MicOff,
  Headphones,
} from 'lucide-react';
import { Avatar } from './Avatar';
import type { Channel, User, Server, ServerMemberRole } from '@discord-clone/shared';

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  viewMode: 'channels' | 'dms';
  onViewModeChange: (mode: 'channels' | 'dms') => void;
  channels: Channel[];
  activeChannelId: string | null;
  onSelectChannel: (channel: Channel) => void;
  onOpenCreateChannel: () => void;
  onEditChannel: (channel: Channel) => void;
  onDeleteChannel?: (channelId: string) => void;
  createChannelBtnRef: RefObject<HTMLButtonElement | null>;
  channelsError: string | null;
  onRetryChannels: () => void;
  users: User[];
  activeDmUserId: string | null;
  onSelectDmUser: (userId: string) => void;
  currentUser: User | null;
  onOpenProfile: () => void;
  onOpenLogout: () => void;
  activeServer?: (Server & { currentUserRole?: ServerMemberRole | null; allowMemberInvites?: boolean }) | null;
  onOpenInviteModal?: () => void;
  canCreateChannel?: boolean;
}

export function Sidebar({
  isOpen,
  onClose,
  viewMode,
  onViewModeChange,
  channels,
  activeChannelId,
  onSelectChannel,
  onOpenCreateChannel,
  onEditChannel,
  createChannelBtnRef,
  channelsError,
  onRetryChannels,
  users,
  activeDmUserId,
  onSelectDmUser,
  currentUser,
  onOpenProfile,
  onOpenLogout,
  activeServer,
  onOpenInviteModal,
  canCreateChannel = false,
  onDeleteChannel,
}: SidebarProps) {
  const [textChannelsExpanded, setTextChannelsExpanded] = useState(true);
  const [voiceChannelsExpanded, setVoiceChannelsExpanded] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  const textChannels = channels.filter((c) => c.type !== 'VOICE');
  const voiceChannels = channels.filter((c) => c.type === 'VOICE');

  const renderChannelItem = (channel: Channel) => (
    <li
      key={channel.id}
      className={`channel-item ${activeChannelId === channel.id ? 'active' : ''}`}
      onClick={() => onSelectChannel(channel)}
      role="option"
      aria-selected={activeChannelId === channel.id}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectChannel(channel);
        }
      }}
    >
      {channel.type === 'VOICE' ? (
        <Volume2 size={20} className="channel-icon" aria-hidden="true" />
      ) : (
        <Hash size={20} className="channel-icon" aria-hidden="true" />
      )}
      <span>{channel.name}</span>
      {canCreateChannel && (
        <div className="channel-actions" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <button
            className="channel-edit-btn"
            onClick={(e) => {
              e.stopPropagation();
              onEditChannel(channel);
            }}
            title="Editar canal"
            aria-label={`Editar canal ${channel.name}`}
          >
            <Pencil size={14} />
          </button>
          {onDeleteChannel && (
            <button
              className="channel-edit-btn channel-delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Tem certeza que deseja excluir o canal "#${channel.name}"? Esta ação não pode ser desfeita.`)) {
                  onDeleteChannel(channel.id);
                }
              }}
              title="Excluir canal"
              aria-label={`Excluir canal ${channel.name}`}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </li>
  );

  return (
    <>
      {/* ── Sidebar overlay (mobile) ──────────────────────────────────── */}
      <div
        className={`sidebar-overlay ${isOpen ? 'visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header" style={{ justifyContent: 'space-between' }}>
          <div className="sidebar-brand">
            <div className="brand-icon">
              {activeServer ? (
                <ServerIcon size={16} />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                  <circle cx="8" cy="12" r="1" fill="currentColor" />
                  <circle cx="12" cy="12" r="1" fill="currentColor" />
                  <circle cx="16" cy="12" r="1" fill="currentColor" />
                </svg>
              )}
            </div>
            <span className="brand-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
              {activeServer ? activeServer.name : 'Levicord'}
            </span>
          </div>

          {activeServer && onOpenInviteModal && (
            <button
              type="button"
              className="icon-btn"
              onClick={onOpenInviteModal}
              title="Convidar pessoas para este servidor"
              aria-label="Convidar pessoas"
              style={{ color: '#5865f2' }}
            >
              <UserPlus size={18} />
            </button>
          )}
        </div>

        {/* ── View Toggle (Home only: Canais Globais vs Mensagens Diretas) ── */}
        {!activeServer && (
          <div className="view-toggle">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'channels' ? 'active' : ''}`}
              onClick={() => onViewModeChange('channels')}
            >
              Canais Globais
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'dms' ? 'active' : ''}`}
              onClick={() => onViewModeChange('dms')}
            >
              Mensagens Diretas
            </button>
          </div>
        )}

        <div className="channels-section">
          {viewMode === 'channels' || activeServer ? (
            <>
              <div className="channels-header">
                <span>{activeServer ? 'CANAIS DO SERVIDOR' : 'CANAIS GLOBAIS'}</span>
                {canCreateChannel && (
                  <button
                    ref={createChannelBtnRef}
                    className="icon-btn"
                    onClick={onOpenCreateChannel}
                    aria-label="Criar novo canal"
                    title="Criar Canal"
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
              {channelsError && (
                <div className="sidebar-error" role="alert">
                  <span>{channelsError}</span>
                  <button type="button" onClick={onRetryChannels}>Tentar novamente</button>
                </div>
              )}

              {/* Categorias de Canais (Texto e Voz) */}
              <div className="channel-categories-container">
                {/* Seção Canais de Texto */}
                {textChannels.length > 0 && (
                  <div className="channel-category-group">
                    <div
                      className="channel-category-header"
                      onClick={() => setTextChannelsExpanded(!textChannelsExpanded)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setTextChannelsExpanded(!textChannelsExpanded);
                        }
                      }}
                      title={textChannelsExpanded ? 'Recolher Canais de Texto' : 'Expandir Canais de Texto'}
                    >
                      {textChannelsExpanded ? (
                        <ChevronDown size={14} className="chevron-icon" />
                      ) : (
                        <ChevronRight size={14} className="chevron-icon" />
                      )}
                      <span className="channel-category-title">
                        Canais de Texto
                        <span className="channel-category-count">({textChannels.length})</span>
                      </span>
                    </div>
                    {textChannelsExpanded && (
                      <ul className="channel-list" role="listbox" aria-label="Canais de Texto">
                        {textChannels.map(renderChannelItem)}
                      </ul>
                    )}
                  </div>
                )}

                {/* Seção Canais de Voz */}
                {voiceChannels.length > 0 && (
                  <div className="channel-category-group">
                    <div
                      className="channel-category-header"
                      onClick={() => setVoiceChannelsExpanded(!voiceChannelsExpanded)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setVoiceChannelsExpanded(!voiceChannelsExpanded);
                        }
                      }}
                      title={voiceChannelsExpanded ? 'Recolher Canais de Voz' : 'Expandir Canais de Voz'}
                    >
                      {voiceChannelsExpanded ? (
                        <ChevronDown size={14} className="chevron-icon" />
                      ) : (
                        <ChevronRight size={14} className="chevron-icon" />
                      )}
                      <span className="channel-category-title">
                        Canais de Voz
                        <span className="channel-category-count">({voiceChannels.length})</span>
                      </span>
                    </div>
                    {voiceChannelsExpanded && (
                      <ul className="channel-list" role="listbox" aria-label="Canais de Voz">
                        {voiceChannels.map(renderChannelItem)}
                      </ul>
                    )}
                  </div>
                )}

                {/* Se nenhum canal existir ainda */}
                {channels.length === 0 && (
                  <ul className="channel-list" role="listbox" aria-label="Canais">
                    <li style={{ padding: '16px 8px', color: '#949ba4', fontSize: '13px', textAlign: 'center' }}>
                      Nenhum canal disponível.
                    </li>
                  </ul>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="channels-header"><span>MENSAGENS DIRETAS</span></div>
              <ul className="channel-list" role="listbox" aria-label="Mensagens Diretas">
                {users.map((user) => (
                  <li
                    key={user.id}
                    className={`channel-item ${activeDmUserId === user.id ? 'active' : ''}`}
                    onClick={() => onSelectDmUser(user.id)}
                    role="option"
                    aria-selected={activeDmUserId === user.id}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectDmUser(user.id);
                      }
                    }}
                  >
                    <Avatar src={user.avatarUrl} name={user.displayName} size={24} className="dm-avatar-small" />
                    <span>{user.displayName}</span>
                  </li>
                ))}
                {users.length === 0 && (
                  <div className="empty-users">
                    <p>Ainda não há outros utilizadores na plataforma.</p>
                    <p style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      Convide alguém para começar uma conversa.
                    </p>
                  </div>
                )}
              </ul>
            </>
          )}
        </div>

        <div className="user-panel">
          <div
            className="user-profile-summary"
            onClick={onOpenProfile}
            title="Editar seu perfil (nome e foto)"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenProfile(); }}
          >
            <div className="user-avatar-wrapper">
              <Avatar src={currentUser?.avatarUrl} name={currentUser?.displayName} size={32} className="user-panel-avatar" />
              <span className="status-indicator" title="Online" />
            </div>
            <div className="user-details">
              <span className="user-display-name">{currentUser?.displayName || 'Você'}</span>
              <span className="user-status-text">Online</span>
            </div>
          </div>
          <div className="user-panel-actions">
            <button
              type="button"
              className={`icon-btn audio-control-btn ${isMuted ? 'muted' : ''}`}
              onClick={() => setIsMuted(!isMuted)}
              title={isMuted ? 'Ativar microfone' : 'Desativar microfone'}
              aria-label={isMuted ? 'Ativar microfone' : 'Desativar microfone'}
            >
              {isMuted ? <MicOff size={18} color="#ed4245" /> : <Mic size={18} />}
            </button>
            <button
              type="button"
              className={`icon-btn audio-control-btn ${isDeafened ? 'deafened' : ''}`}
              onClick={() => setIsDeafened(!isDeafened)}
              title={isDeafened ? 'Ativar áudio' : 'Silenciar áudio'}
              aria-label={isDeafened ? 'Ativar áudio' : 'Silenciar áudio'}
            >
              <Headphones size={18} color={isDeafened ? '#ed4245' : undefined} />
            </button>
            <button
              className="icon-btn profile-settings-btn"
              onClick={onOpenProfile}
              title="Editar perfil"
              aria-label="Editar perfil"
            >
              <Settings size={18} />
            </button>
            <button
              className="icon-btn logout-btn"
              onClick={onOpenLogout}
              title="Sair da conta"
              aria-label="Sair da conta"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}


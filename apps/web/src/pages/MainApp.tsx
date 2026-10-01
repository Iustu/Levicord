import { useEffect, useRef, useState, useCallback } from 'react';
import { Hash, Plus, Pencil, MessageCircle, Volume2, Search, X, Menu, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useChatStore } from '../stores/useChatStore';
import { useSocket } from '../hooks/useSocket';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { useChannelMessages } from '../hooks/useChannelMessages';
import { useDmMessages } from '../hooks/useDmMessages';
import { apiFetch } from '../lib/api';
import { CreateChannelModal } from '../components/CreateChannelModal';
import { EditProfileModal } from '../components/EditProfileModal';
import { Avatar } from '../components/Avatar';
import { MessageList } from '../components/MessageList';
import { ChatInput } from '../components/ChatInput';
import { VoiceScreen } from '../components/VoiceScreen';
import type { Channel, Message, User } from '@discord-clone/shared';
import type { UploadedAttachment } from '../components/ChatInput';
import './MainApp.css';

/**
 * MainApp — top-level layout and navigation orchestrator.
 *
 * Responsibilities of THIS file (and nothing else):
 *   1. Layout skeleton (sidebar + chat area)
 *   2. Navigation state (active channel, active DM, view mode, voice call)
 *   3. Channel CRUD
 *   4. Search
 *
 * Data fetching is fully delegated to hooks:
 *   - useChannelMessages → channel messages + pagination
 *   - useDmMessages      → DM messages
 *   - useTypingIndicator → typing state
 *
 * Route protection is handled by ProtectedRoute in App.tsx.
 * (ESM — SRP, Low Coupling)
 */
export default function MainApp() {
  const { token, logout } = useAuth();

  const {
    viewMode, setViewMode,
    channels, activeChannelId, setChannels, setActiveChannelId,
    users, setUsers,
    activeDmUserId, setActiveDmUserId,
    currentUser, setCurrentUser, updateCurrentUser,
  } = useChatStore();

  const { socket, joinChannel, sendMessage, sendDm, sendTypingStart, sendTypingStop } = useSocket();

  // ── Data hooks ─────────────────────────────────────────────────────────────
  const channelMessages = useChannelMessages({
    token,
    channelId: viewMode === 'channels' ? activeChannelId : null,
    onJoinChannel: joinChannel,
  });

  const dmMessages = useDmMessages({
    token,
    dmUserId: viewMode === 'dms' ? activeDmUserId : null,
  });

  const typingUserNames = useTypingIndicator({ socket, activeChannelId, users });

  // ── UI state ──────────────────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [channelsRetryKey, setChannelsRetryKey] = useState(0);
  const createChannelBtnRef = useRef<HTMLButtonElement>(null);

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!q.trim() || q.trim().length < 2) { setSearchResults(null); return; }
    searchDebounceRef.current = setTimeout(async () => {
      if (!token || !activeChannelId) return;
      setIsSearching(true);
      try {
        const results = await apiFetch<Message[]>(
          `/api/channels/${activeChannelId}/messages/search?q=${encodeURIComponent(q.trim())}`,
          token,
        );
        setSearchResults(results);
      } catch { setSearchResults([]); }
      finally { setIsSearching(false); }
    }, 350);
  }, [token, activeChannelId]);

  const clearSearch = () => { setSearchQuery(''); setSearchResults(null); };

  // ── Bootstrap fetches ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    apiFetch<User>('/api/auth/me', token)
      .then((user) => setCurrentUser(user))
      .catch(console.error);
  }, [token, setCurrentUser]);

  useEffect(() => {
    if (!token) return;
    setChannelsError(null);
    apiFetch<Channel[]>('/api/channels', token)
      .then((data) => {
        setChannels(data);
        const firstText = data.find((c) => c.type !== 'VOICE');
        if (firstText && !activeChannelId) setActiveChannelId(firstText.id);
      })
      .catch(() => setChannelsError('Não foi possível carregar os canais. Verifique a sua ligação e tente novamente.'));
  }, [token, channelsRetryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token || viewMode !== 'dms') return;
    apiFetch<{ users: User[]; nextCursor: string | null }>('/api/users', token)
      .then(({ users }) => setUsers(users))
      .catch(console.error);
  }, [token, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived values ────────────────────────────────────────────────────────
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const activeDmUser = users.find((u) => u.id === activeDmUserId);
  const isVoiceChannel = activeChannel?.type === 'VOICE';
  const isInCall = activeVoiceChannelId === activeChannelId;

  const currentMessages = viewMode === 'channels' ? channelMessages.messages : dmMessages.messages;
  const isLoadingMessages = viewMode === 'channels' ? channelMessages.isLoading : dmMessages.isLoading;
  const fetchError = viewMode === 'channels' ? channelMessages.fetchError : dmMessages.fetchError;
  const messagesEndRef = viewMode === 'channels' ? channelMessages.messagesEndRef : dmMessages.messagesEndRef;
  const messagesListRef = viewMode === 'channels' ? channelMessages.messagesListRef : dmMessages.messagesListRef;

  const handleRetry = () => {
    if (viewMode === 'channels') channelMessages.retry();
    else dmMessages.retry();
  };

  const chatPlaceholder = viewMode === 'channels'
    ? `Conversar em #${activeChannel?.name ?? ''}`
    : `Enviar mensagem para @${activeDmUser?.displayName ?? ''}`;

  const hasActiveConversation =
    (viewMode === 'channels' && !!activeChannelId && !!activeChannel) ||
    (viewMode === 'dms' && !!activeDmUserId && !!activeDmUser);

  // ── Send handlers ─────────────────────────────────────────────────────────
  const handleSend = (content: string | null, attachment: UploadedAttachment | null) => {
    const attachments = attachment ? [attachment] : undefined;
    if (viewMode === 'channels' && activeChannelId) sendMessage(activeChannelId, content, attachments);
    else if (viewMode === 'dms' && activeDmUserId) sendDm(activeDmUserId, content, attachments);
  };

  // ── Channel CRUD ──────────────────────────────────────────────────────────
  const handleSaveChannel = async (name: string, description: string, type: 'TEXT' | 'VOICE' = 'TEXT') => {
    if (!token) return;
    if (!editingChannel) {
      const newChannel = await apiFetch<Channel>('/api/channels', token, {
        method: 'POST',
        body: JSON.stringify({ name, description, type }),
      });
      setChannels([...channels, newChannel]);
      if (type === 'TEXT') setActiveChannelId(newChannel.id);
    } else {
      const updated = await apiFetch<Channel>(`/api/channels/${editingChannel.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ name, description }),
      });
      setChannels(channels.map((c) => (c.id === updated.id ? updated : c)));
      setEditingChannel(null);
    }
  };

  const handleChannelClick = (channel: Channel) => {
    setActiveChannelId(channel.id);
    if (channel.type === 'VOICE') setActiveVoiceChannelId(null);
  };

  return (
    <div className="app-container">
      {/* ── Sidebar overlay (mobile) ──────────────────────────────────── */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <div className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="brand-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                <circle cx="8" cy="12" r="1" fill="currentColor" />
                <circle cx="12" cy="12" r="1" fill="currentColor" />
                <circle cx="16" cy="12" r="1" fill="currentColor" />
              </svg>
            </div>
            <span className="brand-name">Levicord</span>
          </div>
        </div>

        <div className="view-toggle">
          <button className={`view-toggle-btn ${viewMode === 'channels' ? 'active' : ''}`} onClick={() => setViewMode('channels')}>
            Canais
          </button>
          <button className={`view-toggle-btn ${viewMode === 'dms' ? 'active' : ''}`} onClick={() => setViewMode('dms')}>
            Mensagens Diretas
          </button>
        </div>

        <div className="channels-section">
          {viewMode === 'channels' ? (
            <>
              <div className="channels-header">
                <span>CANAIS</span>
                <button ref={createChannelBtnRef} className="icon-btn" onClick={() => setIsModalOpen(true)} aria-label="Criar novo canal" title="Criar Canal">
                  <Plus size={16} />
                </button>
              </div>
              {channelsError && (
                <div className="sidebar-error" role="alert">
                  <span>{channelsError}</span>
                  <button type="button" onClick={() => setChannelsRetryKey((k) => k + 1)}>Tentar novamente</button>
                </div>
              )}
              <ul className="channel-list" role="listbox" aria-label="Canais">
                {channels.map((channel) => (
                  <li
                    key={channel.id}
                    className={`channel-item ${activeChannelId === channel.id ? 'active' : ''}`}
                    onClick={() => handleChannelClick(channel)}
                    role="option"
                    aria-selected={activeChannelId === channel.id}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleChannelClick(channel); } }}
                  >
                    {channel.type === 'VOICE'
                      ? <Volume2 size={20} className="channel-icon" aria-hidden="true" />
                      : <Hash size={20} className="channel-icon" aria-hidden="true" />}
                    <span>{channel.name}</span>
                    <button
                      className="channel-edit-btn"
                      onClick={(e) => { e.stopPropagation(); setEditingChannel(channel); }}
                      title="Editar canal"
                      aria-label={`Editar canal ${channel.name}`}
                    >
                      <Pencil size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="channels-header"><span>MENSAGENS DIRETAS</span></div>
              <ul className="channel-list" role="listbox" aria-label="Mensagens Diretas">
                {users.map((user) => (
                  <li
                    key={user.id}
                    className={`channel-item ${activeDmUserId === user.id ? 'active' : ''}`}
                    onClick={() => setActiveDmUserId(user.id)}
                    role="option"
                    aria-selected={activeDmUserId === user.id}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveDmUserId(user.id); } }}
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
            onClick={() => setIsProfileModalOpen(true)}
            title="Editar seu perfil (nome e foto)"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsProfileModalOpen(true); }}
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
            <button className="icon-btn profile-settings-btn" onClick={() => setIsProfileModalOpen(true)} title="Editar perfil" aria-label="Editar perfil">
              <Settings size={18} />
            </button>
            <button className="icon-btn logout-btn" onClick={logout} title="Sair da conta" aria-label="Sair da conta">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Chat Area ──────────────────────────────────────────────────── */}
      <div className="chat-area" id="main-content">
        {hasActiveConversation ? (
          <>
            <div className="chat-header">
              <button className="sidebar-toggle" onClick={() => setSidebarOpen((o) => !o)} aria-label="Abrir menu">
                <Menu size={20} />
              </button>
              {viewMode === 'channels' ? (
                <div className="chat-header-title">
                  {isVoiceChannel
                    ? <Volume2 size={22} className="channel-icon" aria-hidden="true" />
                    : <Hash size={22} className="channel-icon" aria-hidden="true" />}
                  <h3>{activeChannel?.name}</h3>
                  {activeChannel?.description && (
                    <>
                      <div className="chat-header-divider" aria-hidden="true" />
                      <span className="channel-description">{activeChannel.description}</span>
                    </>
                  )}
                </div>
              ) : (
                <div className="chat-header-title">
                  <MessageCircle size={22} className="channel-icon" aria-hidden="true" />
                  <h3>{activeDmUser?.displayName}</h3>
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
                    onChange={(e) => handleSearchChange(e.target.value)}
                  />
                  {searchQuery && (
                    <button className="chat-search-clear" onClick={clearSearch} aria-label="Limpar busca">
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {searchResults !== null && (
              <div className="search-results" role="region" aria-label="Resultados da busca">
                <div className="search-results-header">
                  {isSearching ? 'Buscando...' : `${searchResults.length} resultado${searchResults.length !== 1 ? 's' : ''} para "${searchQuery}"`}
                  <button onClick={clearSearch} className="search-results-close">Fechar</button>
                </div>
                {!isSearching && searchResults.length === 0 && (
                  <p className="search-results-empty">Nenhuma mensagem encontrada.</p>
                )}
                <ul className="search-results-list">
                  {searchResults.map((msg) => (
                    <li key={msg.id} className="search-result-item">
                      <img
                        src={msg.author.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${msg.author.displayName}`}
                        className="avatar"
                        alt={`Avatar de ${msg.author.displayName}`}
                        loading="lazy"
                      />
                      <div>
                        <span className="author-name">{msg.author.displayName}</span>
                        <span className="timestamp">{new Date(msg.createdAt).toLocaleString('pt-BR')}</span>
                        <p className="text">{msg.content}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isVoiceChannel ? (
              <VoiceScreen
                channelName={activeChannel!.name}
                channelId={activeChannelId!}
                isInCall={isInCall}
                onJoin={() => setActiveVoiceChannelId(activeChannelId!)}
                onDisconnect={() => setActiveVoiceChannelId(null)}
              />
            ) : (
              <>
                <MessageList
                  messages={currentMessages}
                  viewMode={viewMode}
                  activeChannelName={activeChannel?.name}
                  activeDmUser={activeDmUser}
                  isLoading={isLoadingMessages}
                  isLoadingOlder={viewMode === 'channels' ? channelMessages.isLoadingOlder : false}
                  fetchError={fetchError}
                  nextCursor={viewMode === 'channels' ? channelMessages.nextCursor : null}
                  onLoadOlder={channelMessages.loadOlderMessages}
                  onRetry={handleRetry}
                  messagesEndRef={messagesEndRef}
                  messagesListRef={messagesListRef}
                  typingUserNames={typingUserNames}
                />
                {token && (
                  <ChatInput
                    placeholder={chatPlaceholder}
                    token={token}
                    onSend={handleSend}
                    onTypingStart={viewMode === 'channels' && activeChannelId ? () => sendTypingStart(activeChannelId) : undefined}
                    onTypingStop={viewMode === 'channels' && activeChannelId ? () => sendTypingStop(activeChannelId) : undefined}
                  />
                )}
              </>
            )}
          </>
        ) : (
          <div className="empty-state">
            <p>
              {viewMode === 'channels'
                ? (channels.length === 0 ? 'Nenhum canal criado. Crie um canal para começar.' : 'Selecione um canal.')
                : (users.length === 0 ? 'Nenhum utilizador disponível.' : 'Selecione um utilizador para iniciar uma conversa.')}
            </p>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <CreateChannelModal
        isOpen={isModalOpen || editingChannel !== null}
        onClose={() => { setIsModalOpen(false); setEditingChannel(null); }}
        onSubmit={handleSaveChannel}
        initialName={editingChannel?.name}
        initialDescription={editingChannel?.description ?? ''}
        initialType={editingChannel?.type ?? 'TEXT'}
        title={editingChannel ? 'Editar Canal' : undefined}
        submitLabel={editingChannel ? 'Salvar alterações' : undefined}
        triggerRef={createChannelBtnRef}
      />

      <EditProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentUser={currentUser}
        token={token}
        onSaved={(updated) => updateCurrentUser(updated)}
      />
    </div>
  );
}

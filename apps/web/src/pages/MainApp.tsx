import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useChatStore } from '../stores/useChatStore';
import { useSocket } from '../hooks/useSocket';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { useChannelMessages } from '../hooks/useChannelMessages';
import { useDmMessages } from '../hooks/useDmMessages';
import { apiFetch } from '../lib/api';
import { Sidebar } from '../components/Sidebar';
import { ChatHeader } from '../components/ChatHeader';
import { SearchResultsOverlay } from '../components/SearchResultsOverlay';
import { CreateChannelModal } from '../components/CreateChannelModal';
import { EditProfileModal } from '../components/EditProfileModal';
import { LogoutModal } from '../components/LogoutModal';
import { MessageList } from '../components/MessageList';
import { ChatInput } from '../components/ChatInput';
import { VoiceScreen } from '../components/VoiceScreen';
import type { Channel, Message, User } from '@discord-clone/shared';
import type { UploadedAttachment } from '../components/ChatInput';
import './MainApp.css';

/**
 * MainApp — clean layout and navigation orchestrator.
 *
 * Responsibilities:
 *   1. Layout coordination (sidebar + chat area)
 *   2. Navigation state (active channel/DM, voice session)
 *   3. Channel CRUD and search actions
 *
 * All sub-interfaces are isolated into cohesive components:
 *   - Sidebar, ChatHeader, SearchResultsOverlay, LogoutModal
 *   (ESM Cap. 5 — High Cohesion, Low Coupling)
 */
export default function MainApp() {
  const { token, logout } = useAuth();

  // ── Fine-grained store subscriptions (prevents full-page re-renders) ────────
  const viewMode = useChatStore((s) => s.viewMode);
  const setViewMode = useChatStore((s) => s.setViewMode);
  const channels = useChatStore((s) => s.channels);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const setChannels = useChatStore((s) => s.setChannels);
  const setActiveChannelId = useChatStore((s) => s.setActiveChannelId);
  const users = useChatStore((s) => s.users);
  const setUsers = useChatStore((s) => s.setUsers);
  const activeDmUserId = useChatStore((s) => s.activeDmUserId);
  const setActiveDmUserId = useChatStore((s) => s.setActiveDmUserId);
  const currentUser = useChatStore((s) => s.currentUser);
  const setCurrentUser = useChatStore((s) => s.setCurrentUser);
  const updateCurrentUser = useChatStore((s) => s.updateCurrentUser);

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
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
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
    if (!q.trim() || q.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      if (!token || !activeChannelId) return;
      setIsSearching(true);
      try {
        const results = await apiFetch<Message[]>(
          `/api/channels/${activeChannelId}/messages/search?q=${encodeURIComponent(q.trim())}`,
          token,
        );
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  }, [token, activeChannelId]);

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

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
      .then(({ users: fetchedUsers }) => setUsers(fetchedUsers))
      .catch(console.error);
  }, [token, viewMode, setUsers]);

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
      {/* ── Sidebar Component ─────────────────────────────────────────── */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        channels={channels}
        activeChannelId={activeChannelId}
        onSelectChannel={handleChannelClick}
        onOpenCreateChannel={() => setIsModalOpen(true)}
        onEditChannel={setEditingChannel}
        createChannelBtnRef={createChannelBtnRef}
        channelsError={channelsError}
        onRetryChannels={() => setChannelsRetryKey((k) => k + 1)}
        users={users}
        activeDmUserId={activeDmUserId}
        onSelectDmUser={setActiveDmUserId}
        currentUser={currentUser}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onOpenLogout={() => setIsLogoutModalOpen(true)}
      />

      {/* ── Chat Area ──────────────────────────────────────────────────── */}
      <main className="chat-area" id="main-content">
        {hasActiveConversation ? (
          <>
            <ChatHeader
              viewMode={viewMode}
              isVoiceChannel={Boolean(isVoiceChannel)}
              channelName={activeChannel?.name}
              channelDescription={activeChannel?.description}
              dmDisplayName={activeDmUser?.displayName}
              onToggleSidebar={() => setSidebarOpen((o) => !o)}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              onClearSearch={clearSearch}
            />

            <SearchResultsOverlay
              searchResults={searchResults}
              searchQuery={searchQuery}
              isSearching={isSearching}
              onClose={clearSearch}
            />

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
                <ChatInput
                  placeholder={chatPlaceholder}
                  onSend={handleSend}
                  onTypingStart={viewMode === 'channels' && activeChannelId ? () => sendTypingStart(activeChannelId) : undefined}
                  onTypingStop={viewMode === 'channels' && activeChannelId ? () => sendTypingStop(activeChannelId) : undefined}
                />
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
      </main>

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

      <LogoutModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={logout}
      />
    </div>
  );
}

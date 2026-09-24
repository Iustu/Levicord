import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Plus, Pencil, MessageCircle, Volume2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useChatStore } from '../stores/useChatStore';
import { useSocket } from '../hooks/useSocket';
import { apiFetch } from '../lib/api';
import { CreateChannelModal } from '../components/CreateChannelModal';
import { MessageList } from '../components/MessageList';
import { ChatInput } from '../components/ChatInput';
import { VoiceScreen } from '../components/VoiceScreen';
import type { Channel, Message, DirectMessage, User } from '../stores/useChatStore';
import type { UploadedAttachment } from '../components/ChatInput';
import './MainApp.css';

/**
 * MainApp — top-level layout and data-fetching orchestrator.
 *
 * Responsibilities of THIS file (and nothing else):
 *   1. Route protection
 *   2. Data fetching (channels, users, messages, DMs)
 *   3. Navigation state (active channel, active DM, voice call)
 *   4. Layout skeleton (sidebar + chat area)
 *
 * All rendering of messages, input and voice UI is delegated to
 * <MessageList>, <ChatInput> and <VoiceScreen> respectively.
 * (Engenharia de Software — SRP, Low Coupling)
 */
export default function MainApp() {
  const { token, isLoading: isAuthLoading, logout } = useAuth();
  const navigate = useNavigate();

  const {
    viewMode, setViewMode,
    channels, activeChannelId, messages, setChannels, setActiveChannelId, setMessages, prependMessages,
    users, setUsers,
    activeDmUserId, setActiveDmUserId, dms, setDms,
  } = useChatStore();

  const { joinChannel, sendMessage, sendDm } = useSocket();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);

  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [channelsRetryKey, setChannelsRetryKey] = useState(0);

  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState<string | null>(null);

  const messagesListRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const preserveScrollRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const olderMessagesControllerRef = useRef<AbortController | null>(null);

  // ── Route protection ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthLoading && !token) navigate('/login');
  }, [isAuthLoading, token, navigate]);

  // ── Fetch channels ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    setChannelsError(null);
    apiFetch<Channel[]>('/api/channels', token)
      .then((data) => {
        setChannels(data);
        const firstText = data.find((c) => c.type !== 'VOICE');
        if (firstText && !activeChannelId) setActiveChannelId(firstText.id);
      })
      .catch(() => setChannelsError('Não foi possível carregar os canais.'));
  }, [token, channelsRetryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch users for DMs ────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || viewMode !== 'dms') return;
    apiFetch<User[]>('/api/users', token)
      .then(setUsers)
      .catch(console.error);
  }, [token, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch channel messages ─────────────────────────────────────────────────
  useEffect(() => {
    if (!token || viewMode !== 'channels' || !activeChannelId) return;
    const channel = channels.find((c) => c.id === activeChannelId);
    if (channel?.type === 'VOICE') return;

    let cancelled = false;
    joinChannel(activeChannelId);
    setIsLoadingMessages(true);
    setFetchError(null);
    shouldAutoScrollRef.current = true;
    setNextCursor(null);

    apiFetch<{ messages: Message[]; nextCursor: string | null }>(
      `/api/channels/${activeChannelId}/messages`,
      token,
    )
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages);
        setNextCursor(data.nextCursor);
      })
      .catch(() => { if (!cancelled) setFetchError('Não foi possível carregar as mensagens.'); })
      .finally(() => { if (!cancelled) setIsLoadingMessages(false); });

    return () => {
      cancelled = true;
      olderMessagesControllerRef.current?.abort();
      olderMessagesControllerRef.current = null;
    };
  }, [token, activeChannelId, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch DM messages ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || viewMode !== 'dms' || !activeDmUserId) return;
    let cancelled = false;
    setIsLoadingMessages(true);
    setFetchError(null);
    shouldAutoScrollRef.current = true;

    apiFetch<DirectMessage[]>(`/api/users/${activeDmUserId}/dms`, token)
      .then((data) => { if (!cancelled) setDms(activeDmUserId, data); })
      .catch(() => { if (!cancelled) setFetchError('Não foi possível carregar as mensagens.'); })
      .finally(() => { if (!cancelled) setIsLoadingMessages(false); });

    return () => { cancelled = true; };
  }, [token, activeDmUserId, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  const currentMessages = viewMode === 'channels'
    ? messages
    : (activeDmUserId ? (dms[activeDmUserId] ?? []) : []);

  useEffect(() => {
    if (preserveScrollRef.current) { preserveScrollRef.current = false; return; }
    if (shouldAutoScrollRef.current) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages]);

  // ── Load older messages ────────────────────────────────────────────────────
  const loadOlderMessages = async () => {
    if (!token || viewMode !== 'channels' || !activeChannelId || !nextCursor || isLoadingOlderMessages) return;
    const list = messagesListRef.current;
    const previousHeight = list?.scrollHeight ?? 0;
    const requested = activeChannelId;
    const controller = new AbortController();
    olderMessagesControllerRef.current?.abort();
    olderMessagesControllerRef.current = controller;
    setIsLoadingOlderMessages(true);

    try {
      const data = await apiFetch<{ messages: Message[]; nextCursor: string | null }>(
        `/api/channels/${activeChannelId}/messages?cursor=${encodeURIComponent(nextCursor)}`,
        token,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || requested !== activeChannelId) return;
      preserveScrollRef.current = true;
      prependMessages(data.messages);
      setNextCursor(data.nextCursor);
      requestAnimationFrame(() => {
        if (list) list.scrollTop += list.scrollHeight - previousHeight;
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFetchError('Não foi possível carregar mensagens anteriores.');
    } finally {
      if (olderMessagesControllerRef.current === controller) {
        olderMessagesControllerRef.current = null;
        setIsLoadingOlderMessages(false);
      }
    }
  };

  // ── Send handlers ──────────────────────────────────────────────────────────
  const handleSend = (content: string | null, attachment: UploadedAttachment | null) => {
    const attachments = attachment ? [attachment] : undefined;
    if (viewMode === 'channels' && activeChannelId) {
      sendMessage(activeChannelId, content, attachments);
    } else if (viewMode === 'dms' && activeDmUserId) {
      sendDm(activeDmUserId, content, attachments);
    }
  };

  // ── Channel CRUD ───────────────────────────────────────────────────────────
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
    if (channel.type === 'VOICE') {
      setActiveVoiceChannelId(null); // reset — user must explicitly join call
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const activeDmUser = users.find((u) => u.id === activeDmUserId);
  const isVoiceChannel = activeChannel?.type === 'VOICE';
  const isInCall = activeVoiceChannelId === activeChannelId;

  const chatPlaceholder = viewMode === 'channels'
    ? `Conversar em #${activeChannel?.name ?? ''}`
    : `Enviar mensagem para @${activeDmUser?.displayName ?? ''}`;

  const hasActiveConversation =
    (viewMode === 'channels' && !!activeChannelId && !!activeChannel) ||
    (viewMode === 'dms' && !!activeDmUserId && !!activeDmUser);

  return (
    <div className="app-container">
      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <div className="sidebar">
        <div className="sidebar-header"><h3>Levicord</h3></div>

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
                <button className="icon-btn" onClick={() => setIsModalOpen(true)} aria-label="Criar novo canal" title="Criar Canal">
                  <Plus size={16} />
                </button>
              </div>
              {channelsError && (
                <div className="sidebar-error" role="alert">
                  <span>{channelsError}</span>
                  <button type="button" onClick={() => setChannelsRetryKey((k) => k + 1)}>Tentar novamente</button>
                </div>
              )}
              <ul className="channel-list">
                {channels.map((channel) => (
                  <li
                    key={channel.id}
                    className={`channel-item ${activeChannelId === channel.id ? 'active' : ''}`}
                    onClick={() => handleChannelClick(channel)}
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
              <ul className="channel-list">
                {users.map((user) => (
                  <li
                    key={user.id}
                    className={`channel-item ${activeDmUserId === user.id ? 'active' : ''}`}
                    onClick={() => setActiveDmUserId(user.id)}
                  >
                    <img
                      src={user.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}`}
                      className="dm-avatar-small"
                      alt=""
                    />
                    <span>{user.displayName}</span>
                  </li>
                ))}
                {users.length === 0 && <div className="empty-users">Nenhum usuário encontrado.</div>}
              </ul>
            </>
          )}
        </div>

        <div className="user-panel">
          <div className="user-info"><span className="status-indicator" /><span>Online</span></div>
          <button className="icon-btn logout-btn" onClick={logout}>Sair</button>
        </div>
      </div>

      {/* ── Chat Area ──────────────────────────────────────────────────── */}
      <div className="chat-area">
        {hasActiveConversation ? (
          <>
            <div className="chat-header">
              {viewMode === 'channels' ? (
                <>
                  {isVoiceChannel
                    ? <Volume2 size={24} className="channel-icon" aria-hidden="true" />
                    : <Hash size={24} className="channel-icon" aria-hidden="true" />}
                  <div>
                    <h3>{activeChannel?.name}</h3>
                    {activeChannel?.description && (
                      <span className="channel-description">{activeChannel.description}</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <MessageCircle size={24} className="channel-icon" aria-hidden="true" />
                  <div><h3>{activeDmUser?.displayName}</h3></div>
                </>
              )}
            </div>

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
                  isLoadingOlder={isLoadingOlderMessages}
                  fetchError={fetchError}
                  nextCursor={nextCursor}
                  onLoadOlder={loadOlderMessages}
                  onRetry={() =>
                    viewMode === 'channels'
                      ? setActiveChannelId(activeChannelId!)
                      : setActiveDmUserId(activeDmUserId!)
                  }
                  messagesEndRef={messagesEndRef}
                  messagesListRef={messagesListRef}
                />
                {token && (
                  <ChatInput
                    placeholder={chatPlaceholder}
                    token={token}
                    onSend={handleSend}
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
                : (users.length === 0 ? 'Nenhum usuário disponível.' : 'Selecione um usuário para iniciar uma conversa.')}
            </p>
          </div>
        )}
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────── */}
      <CreateChannelModal
        isOpen={isModalOpen || editingChannel !== null}
        onClose={() => { setIsModalOpen(false); setEditingChannel(null); }}
        onSubmit={handleSaveChannel}
        initialName={editingChannel?.name}
        initialDescription={editingChannel?.description ?? ''}
        initialType={editingChannel?.type ?? 'TEXT'}
        title={editingChannel ? 'Editar Canal' : undefined}
        submitLabel={editingChannel ? 'Salvar alterações' : undefined}
      />
    </div>
  );
}

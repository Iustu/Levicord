import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Send, Plus, Loader2, Pencil, MessageCircle, Volume2, Paperclip, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useChatStore } from '../stores/useChatStore';
import { useSocket } from '../hooks/useSocket';
import { apiFetch, API_BASE } from '../lib/api';
import { CreateChannelModal } from '../components/CreateChannelModal';
import { WebRTCGrid } from '../components/WebRTCGrid';
import type { Channel, Message, User, DirectMessage } from '../stores/useChatStore';
import './MainApp.css';

interface UploadedAttachment {
  url: string;
  type: 'image' | 'video' | 'file';
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export default function MainApp() {
  const { token, isLoading: isAuthLoading, logout } = useAuth();
  const navigate = useNavigate();
  const {
    viewMode, setViewMode,
    channels, activeChannelId, messages, setChannels, setActiveChannelId, setMessages, prependMessages,
    users, setUsers,
    activeDmUserId, setActiveDmUserId, dms, setDms
  } = useChatStore();
  
  const { joinChannel, sendMessage, sendDm } = useSocket();

  const [inputText, setInputText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [channelsRetryKey, setChannelsRetryKey] = useState(0);

  // File upload state
  const [pendingAttachment, setPendingAttachment] = useState<UploadedAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice channel state
  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState<string | null>(null);

  const messagesListRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const preserveScrollRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const olderMessagesControllerRef = useRef<AbortController | null>(null);

  // Auth protection
  useEffect(() => {
    if (!isAuthLoading && !token) navigate('/login');
  }, [isAuthLoading, token, navigate]);

  // Fetch initial channels
  useEffect(() => {
    if (!token) return;
    setChannelsError(null);
    apiFetch<Channel[]>('/api/channels', token)
      .then((data) => {
        setChannels(data);
        const firstText = data.find(c => (c as any).type !== 'VOICE');
        if (firstText && !activeChannelId) {
          setActiveChannelId(firstText.id);
        }
      })
      .catch(() => setChannelsError('Não foi possível carregar os canais.'));
  }, [token, channelsRetryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch users when entering DMs view
  useEffect(() => {
    if (!token || viewMode !== 'dms') return;
    apiFetch<User[]>('/api/users', token)
      .then((data) => setUsers(data))
      .catch(console.error);
  }, [token, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Channel messages when active channel changes
  useEffect(() => {
    if (!token || viewMode !== 'channels' || !activeChannelId) return;

    // Don't load text messages for voice channels
    const channel = channels.find(c => c.id === activeChannelId);
    if ((channel as any)?.type === 'VOICE') return;

    let cancelled = false;
    joinChannel(activeChannelId);
    setIsLoadingMessages(true);
    setFetchError(null);
    shouldAutoScrollRef.current = true;
    setNextCursor(null);

    apiFetch<{ messages: Message[]; nextCursor: string | null }>(`/api/channels/${activeChannelId}/messages`, token)
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages);
        setNextCursor(data.nextCursor);
      })
      .catch(() => {
        if (!cancelled) setFetchError('Não foi possível carregar as mensagens. Tente novamente.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMessages(false);
      });

    return () => {
      cancelled = true;
      olderMessagesControllerRef.current?.abort();
      olderMessagesControllerRef.current = null;
    };
  }, [token, activeChannelId, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch DM messages when active DM user changes
  useEffect(() => {
    if (!token || viewMode !== 'dms' || !activeDmUserId) return;

    let cancelled = false;
    setIsLoadingMessages(true);
    setFetchError(null);
    shouldAutoScrollRef.current = true;

    apiFetch<DirectMessage[]>(`/api/users/${activeDmUserId}/dms`, token)
      .then((data) => {
        if (cancelled) return;
        setDms(activeDmUserId, data);
      })
      .catch(() => {
        if (!cancelled) setFetchError('Não foi possível carregar as mensagens. Tente novamente.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMessages(false);
      });

    return () => { cancelled = true; };
  }, [token, activeDmUserId, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOlderMessages = async () => {
    if (!token || viewMode !== 'channels' || !activeChannelId || !nextCursor || isLoadingOlderMessages) return;

    const list = messagesListRef.current;
    const previousHeight = list?.scrollHeight ?? 0;
    const requestedChannelId = activeChannelId;
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
      if (controller.signal.aborted || requestedChannelId !== activeChannelId) return;
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

  const handleMessagesScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    shouldAutoScrollRef.current = element.scrollHeight - element.clientHeight - element.scrollTop < 80;
    if (event.currentTarget.scrollTop <= 24) loadOlderMessages();
  };

  const currentMessages = viewMode === 'channels' ? messages : (activeDmUserId ? (dms[activeDmUserId] || []) : []);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (preserveScrollRef.current) {
      preserveScrollRef.current = false;
      return;
    }
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentMessages]);

  // File upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: token !== '__cookie__' ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error('Upload falhou');
      const attachment = await res.json();
      setPendingAttachment(attachment);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !pendingAttachment) return;
    
    const attachments = pendingAttachment ? [pendingAttachment] : undefined;

    if (viewMode === 'channels' && activeChannelId) {
      sendMessage(activeChannelId, inputText.trim() || null, attachments);
    } else if (viewMode === 'dms' && activeDmUserId) {
      sendDm(activeDmUserId, inputText.trim() || null, attachments);
    }
    
    setInputText('');
    setPendingAttachment(null);
  };

  const handleCreateChannel = async (name: string, description: string, type: 'TEXT' | 'VOICE' = 'TEXT') => {
    if (!token) return;
    const newChannel = await apiFetch<Channel>('/api/channels', token, {
      method: 'POST',
      body: JSON.stringify({ name, description, type }),
    });
    setChannels([...channels, newChannel]);
    if (type === 'TEXT') setActiveChannelId(newChannel.id);
  };

  const handleSaveChannel = async (name: string, description: string, type: 'TEXT' | 'VOICE' = 'TEXT') => {
    if (!token) return;
    if (!editingChannel) {
      await handleCreateChannel(name, description, type);
      return;
    }

    const updatedChannel = await apiFetch<Channel>(`/api/channels/${editingChannel.id}`, token, {
      method: 'PUT',
      body: JSON.stringify({ name, description }),
    });
    setChannels(channels.map((channel) => channel.id === updatedChannel.id ? updatedChannel : channel));
    setEditingChannel(null);
  };

  const activeChannel = channels.find(c => c.id === activeChannelId);
  const activeDmUser = users.find(u => u.id === activeDmUserId);
  const isVoiceChannel = (activeChannel as any)?.type === 'VOICE';

  const handleChannelClick = (channel: Channel) => {
    const chType = (channel as any).type;
    setActiveChannelId(channel.id);
    if (chType === 'VOICE') {
      setActiveVoiceChannelId(channel.id);
    } else {
      setActiveVoiceChannelId(null);
    }
  };

  const renderAttachment = (att: any) => {
    const fullUrl = att.url.startsWith('/') ? `${API_BASE}${att.url}` : att.url;
    if (att.type === 'image') {
      return <img key={att.id || att.url} src={fullUrl} alt={att.fileName} className="msg-attachment-image" />;
    }
    if (att.type === 'video') {
      return <video key={att.id || att.url} src={fullUrl} controls className="msg-attachment-video" />;
    }
    return (
      <a key={att.id || att.url} href={fullUrl} target="_blank" rel="noopener noreferrer" className="msg-attachment-file">
        📎 {att.fileName}
      </a>
    );
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h3>Levicord</h3>
        </div>

        <div className="view-toggle">
          <button 
            className={`view-toggle-btn ${viewMode === 'channels' ? 'active' : ''}`}
            onClick={() => setViewMode('channels')}
          >
            Canais
          </button>
          <button 
            className={`view-toggle-btn ${viewMode === 'dms' ? 'active' : ''}`}
            onClick={() => setViewMode('dms')}
          >
            Mensagens Diretas
          </button>
        </div>

        <div className="channels-section">
          {viewMode === 'channels' ? (
            <>
              <div className="channels-header">
                <span>CANAIS DE TEXTO</span>
                <button
                  className="icon-btn"
                  onClick={() => setIsModalOpen(true)}
                  title="Criar Canal"
                  aria-label="Criar novo canal"
                >
                  <Plus size={16} />
                </button>
              </div>

              {channelsError && (
                <div className="sidebar-error" role="alert">
                  <span>{channelsError}</span>
                  <button type="button" onClick={() => setChannelsRetryKey((key) => key + 1)}>Tentar novamente</button>
                </div>
              )}
              <ul className="channel-list">
                {channels.map(channel => {
                  const chType = (channel as any).type;
                  return (
                    <li
                      key={channel.id}
                      className={`channel-item ${activeChannelId === channel.id ? 'active' : ''}`}
                      onClick={() => handleChannelClick(channel)}
                    >
                      {chType === 'VOICE'
                        ? <Volume2 size={20} className="channel-icon" />
                        : <Hash size={20} className="channel-icon" />
                      }
                      <span>{channel.name}</span>
                      <button
                        className="channel-edit-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingChannel(channel);
                        }}
                        title="Editar canal"
                      >
                        <Pencil size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              <div className="channels-header">
                <span>MENSAGENS DIRETAS</span>
              </div>
              <ul className="channel-list">
                {users.map(user => (
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
                {users.length === 0 && (
                  <div className="empty-users">Nenhum usuário encontrado.</div>
                )}
              </ul>
            </>
          )}
        </div>

        <div className="user-panel">
          <div className="user-info">
            <span className="status-indicator" />
            <span>Online</span>
          </div>
          <button className="icon-btn logout-btn" onClick={logout}>Sair</button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="chat-area">
        {(viewMode === 'channels' && activeChannelId && activeChannel) || (viewMode === 'dms' && activeDmUserId && activeDmUser) ? (
          <>
            <div className="chat-header">
              {viewMode === 'channels' ? (
                <>
                  {isVoiceChannel ? <Volume2 size={24} className="channel-icon" /> : <Hash size={24} className="channel-icon" />}
                  <div>
                    <h3>{activeChannel?.name}</h3>
                    {activeChannel?.description && (
                      <span className="channel-description">{activeChannel.description}</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <MessageCircle size={24} className="channel-icon" />
                  <div>
                    <h3>{activeDmUser?.displayName}</h3>
                  </div>
                </>
              )}
            </div>

            {/* Voice Channel — show WebRTC Grid */}
            {isVoiceChannel && activeVoiceChannelId ? (
              <WebRTCGrid
                channelId={activeVoiceChannelId}
                onDisconnect={() => setActiveVoiceChannelId(null)}
              />
            ) : isVoiceChannel ? (
              <div className="voice-join-screen">
                <Volume2 size={64} className="voice-join-icon" />
                <h3>{activeChannel?.name}</h3>
                <p>Canal de Voz — clique para entrar na chamada.</p>
                <button className="btn-join-voice" onClick={() => setActiveVoiceChannelId(activeChannelId!)}>
                  Entrar na Chamada
                </button>
              </div>
            ) : (
              /* Text chat */
              <>
                <div ref={messagesListRef} className="messages-list" onScroll={handleMessagesScroll}>
                  {isLoadingOlderMessages && <div className="loading-older">Carregando mensagens anteriores...</div>}
                  {isLoadingMessages ? (
                    <div className="loading-state">
                      <Loader2 size={32} className="spinner" />
                      <span>Carregando mensagens...</span>
                    </div>
                  ) : fetchError ? (
                    <div className="error-state">
                      <p>{fetchError}</p>
                      <button className="btn-retry" onClick={() => viewMode === 'channels' ? setActiveChannelId(activeChannelId!) : setActiveDmUserId(activeDmUserId!)}>
                        Tentar novamente
                      </button>
                    </div>
                  ) : currentMessages.length === 0 ? (
                    <div className="empty-messages">
                      {viewMode === 'channels' ? (
                        <>
                          <Hash size={48} className="empty-icon" />
                          <h4>Bem-vindo ao #{activeChannel?.name}!</h4>
                          <p>Este é o início da conversa. Seja o primeiro a enviar uma mensagem.</p>
                        </>
                      ) : (
                        <>
                          <img 
                            src={activeDmUser?.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${activeDmUser?.displayName}`} 
                            className="empty-dm-avatar" 
                            alt="" 
                          />
                          <h4>Este é o começo da sua conversa com {activeDmUser?.displayName}.</h4>
                        </>
                      )}
                    </div>
                  ) : (
                    currentMessages.map((msg, idx) => {
                      const author = viewMode === 'channels' ? (msg as Message).author : (msg as DirectMessage).sender;
                      const isConsecutive = idx > 0 && 
                        (viewMode === 'channels' 
                          ? (currentMessages[idx - 1] as Message).author.id === author.id
                          : (currentMessages[idx - 1] as DirectMessage).sender.id === author.id);
                      const msgAttachments = (msg as any).attachments || [];

                      return (
                        <div key={msg.id} className={`message-item ${isConsecutive ? 'consecutive' : ''}`}>
                          {!isConsecutive && (
                            <img
                              src={author.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${author.displayName}`}
                              alt={`Avatar de ${author.displayName}`}
                              className="avatar"
                            />
                          )}
                          <div className="message-content">
                            {!isConsecutive && (
                              <div className="message-header">
                                <span className="author-name">{author.displayName}</span>
                                <span className="timestamp">
                                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            )}
                            {msg.content && <p className="text">{msg.content}</p>}
                            {msgAttachments.length > 0 && (
                              <div className="msg-attachments">
                                {msgAttachments.map(renderAttachment)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="chat-input-wrapper">
                  {pendingAttachment && (
                    <div className="pending-attachment">
                      <span>📎 {pendingAttachment.fileName}</span>
                      <button onClick={() => setPendingAttachment(null)} aria-label="Remover anexo">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <form onSubmit={handleSend} className="chat-form">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*,.pdf,.txt,.zip"
                      style={{ display: 'none' }}
                      onChange={handleFileSelect}
                      id="file-upload-input"
                    />
                    <button
                      type="button"
                      className="attach-btn"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      aria-label="Anexar arquivo"
                    >
                      {isUploading ? <Loader2 size={20} className="spinner" /> : <Paperclip size={20} />}
                    </button>
                    <input
                      type="text"
                      placeholder={viewMode === 'channels' ? `Conversar em #${activeChannel?.name}` : `Enviar mensagem para @${activeDmUser?.displayName}`}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      className="chat-input"
                      maxLength={2000}
                    />
                    <button type="submit" className="send-btn" disabled={!inputText.trim() && !pendingAttachment} aria-label="Enviar mensagem">
                      <Send size={20} />
                    </button>
                  </form>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="empty-state">
            <p>{viewMode === 'channels' 
              ? (channels.length === 0 ? 'Nenhum canal criado. Crie um canal para começar.' : 'Selecione um canal.') 
              : (users.length === 0 ? 'Nenhum usuário disponível para enviar mensagens.' : 'Selecione um usuário para iniciar uma conversa.')}
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      <CreateChannelModal
        isOpen={isModalOpen || editingChannel !== null}
        onClose={() => {
          setIsModalOpen(false);
          setEditingChannel(null);
        }}
        onSubmit={handleSaveChannel}
        initialName={editingChannel?.name}
        initialDescription={editingChannel?.description || ''}
        initialType={(editingChannel as any)?.type || 'TEXT'}
        title={editingChannel ? 'Editar Canal' : undefined}
        submitLabel={editingChannel ? 'Salvar alterações' : undefined}
      />
    </div>
  );
}

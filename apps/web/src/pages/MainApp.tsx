import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Send, Plus, Loader2, Pencil } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useChatStore } from '../stores/useChatStore';
import { useSocket } from '../hooks/useSocket';
import { apiFetch } from '../lib/api';
import { CreateChannelModal } from '../components/CreateChannelModal';
import type { Channel, Message } from '../stores/useChatStore';
import './MainApp.css';

export default function MainApp() {
  const { token, isLoading: isAuthLoading, logout } = useAuth();
  const navigate = useNavigate();
  const { channels, activeChannelId, messages, setChannels, setActiveChannelId, setMessages, prependMessages } = useChatStore();
  const { joinChannel, sendMessage } = useSocket();

  const [inputText, setInputText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [channelsRetryKey, setChannelsRetryKey] = useState(0);
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
        if (data.length > 0 && !activeChannelId) {
          setActiveChannelId(data[0].id);
        }
      })
      .catch(() => setChannelsError('Não foi possível carregar os canais.'));
  }, [token, channelsRetryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch messages when active channel changes and join socket room
  useEffect(() => {
    if (!token || !activeChannelId) return;

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
  }, [token, activeChannelId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOlderMessages = async () => {
    if (!token || !activeChannelId || !nextCursor || isLoadingOlderMessages) return;

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

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (preserveScrollRef.current) {
      preserveScrollRef.current = false;
      return;
    }
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChannelId) return;
    sendMessage(activeChannelId, inputText);
    setInputText('');
  };

  const handleCreateChannel = async (name: string, description: string) => {
    if (!token) return;
    const newChannel = await apiFetch<Channel>('/api/channels', token, {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
    setChannels([...channels, newChannel]);
    setActiveChannelId(newChannel.id);
  };

  const handleSaveChannel = async (name: string, description: string) => {
    if (!token) return;
    if (!editingChannel) {
      await handleCreateChannel(name, description);
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

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h3>Levicord</h3>
        </div>

        <div className="channels-section">
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
            {channels.map(channel => (
              <li
                key={channel.id}
                className={`channel-item ${activeChannelId === channel.id ? 'active' : ''}`}
                onClick={() => setActiveChannelId(channel.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setActiveChannelId(channel.id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-current={activeChannelId === channel.id ? 'page' : undefined}
              >
                <Hash size={20} className="channel-icon" />
                <span>{channel.name}</span>
                <button
                  className="channel-edit-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingChannel(channel);
                  }}
                  title="Editar canal"
                  aria-label={`Editar canal ${channel.name}`}
                >
                  <Pencil size={14} />
                </button>
              </li>
            ))}
          </ul>
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
        {activeChannelId && activeChannel ? (
          <>
            <div className="chat-header">
              <Hash size={24} className="channel-icon" />
              <div>
                <h3>{activeChannel.name}</h3>
                {activeChannel.description && (
                  <span className="channel-description">{activeChannel.description}</span>
                )}
              </div>
            </div>

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
                  <button
                    className="btn-retry"
                    onClick={() => setActiveChannelId(activeChannelId)}
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : messages.length === 0 ? (
                <div className="empty-messages">
                  <Hash size={48} className="empty-icon" />
                  <h4>Bem-vindo ao #{activeChannel.name}!</h4>
                  <p>Este é o início da conversa. Seja o primeiro a enviar uma mensagem.</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isConsecutive = idx > 0 && messages[idx - 1].author.id === msg.author.id;
                  return (
                    <div key={msg.id} className={`message-item ${isConsecutive ? 'consecutive' : ''}`}>
                      {!isConsecutive && (
                        <img
                          src={msg.author.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${msg.author.displayName}`}
                          alt={`Avatar de ${msg.author.displayName}`}
                          className="avatar"
                        />
                      )}
                      <div className="message-content">
                        {!isConsecutive && (
                          <div className="message-header">
                            <span className="author-name">{msg.author.displayName}</span>
                            <span className="timestamp">
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        )}
                        <p className="text">{msg.content}</p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-wrapper">
              <form onSubmit={handleSend} className="chat-form">
                <input
                  type="text"
                  placeholder={`Conversar em #${activeChannel.name}`}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="chat-input"
                  aria-label={`Mensagem para #${activeChannel.name}`}
                  maxLength={2000}
                />
                <button type="submit" className="send-btn" disabled={!inputText.trim()} aria-label="Enviar mensagem">
                  <Send size={20} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>{channels.length === 0 ? 'Nenhum canal criado. Crie um canal para começar.' : 'Selecione um canal.'}</p>
          </div>
        )}
      </div>

      {/* Modal (Don't Make Me Think — contextual, familiar UI) */}
      <CreateChannelModal
        isOpen={isModalOpen || editingChannel !== null}
        onClose={() => {
          setIsModalOpen(false);
          setEditingChannel(null);
        }}
        onSubmit={handleSaveChannel}
        initialName={editingChannel?.name}
        initialDescription={editingChannel?.description || ''}
        title={editingChannel ? 'Editar Canal de Texto' : undefined}
        submitLabel={editingChannel ? 'Salvar alterações' : undefined}
      />
    </div>
  );
}

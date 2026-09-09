import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Send, Plus, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useChatStore } from '../stores/useChatStore';
import { useSocket } from '../hooks/useSocket';
import { apiFetch } from '../lib/api';
import { CreateChannelModal } from '../components/CreateChannelModal';
import type { Channel, Message } from '../stores/useChatStore';
import './MainApp.css';

export default function MainApp() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const { channels, activeChannelId, messages, setChannels, setActiveChannelId, setMessages } = useChatStore();
  const { joinChannel, sendMessage } = useSocket();

  const [inputText, setInputText] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auth protection
  useEffect(() => {
    if (!token) navigate('/login');
  }, [token, navigate]);

  // Fetch initial channels
  useEffect(() => {
    if (!token) return;
    apiFetch<Channel[]>('/api/channels', token)
      .then((data) => {
        setChannels(data);
        if (data.length > 0 && !activeChannelId) {
          setActiveChannelId(data[0].id);
        }
      })
      .catch((err) => console.error('Failed to fetch channels:', err));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch messages when active channel changes and join socket room
  useEffect(() => {
    if (!token || !activeChannelId) return;

    joinChannel(activeChannelId);
    setIsLoadingMessages(true);
    setFetchError(null);

    apiFetch<Message[]>(`/api/channels/${activeChannelId}/messages`, token)
      .then((data) => setMessages(data))
      .catch(() => setFetchError('Não foi possível carregar as mensagens. Tente novamente.'))
      .finally(() => setIsLoadingMessages(false));
  }, [token, activeChannelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

          <ul className="channel-list">
            {channels.map(channel => (
              <li
                key={channel.id}
                className={`channel-item ${activeChannelId === channel.id ? 'active' : ''}`}
                onClick={() => setActiveChannelId(channel.id)}
                role="button"
                aria-current={activeChannelId === channel.id ? 'page' : undefined}
              >
                <Hash size={20} className="channel-icon" />
                <span>{channel.name}</span>
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

            <div className="messages-list">
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
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateChannel}
      />
    </div>
  );
}

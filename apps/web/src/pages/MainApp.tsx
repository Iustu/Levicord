import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Send, Plus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useChatStore } from '../stores/useChatStore';
import { useSocket } from '../hooks/useSocket';
import './MainApp.css';

export default function MainApp() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const { channels, activeChannelId, messages, setChannels, setActiveChannelId, setMessages } = useChatStore();
  const { joinChannel, sendMessage } = useSocket();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auth protection
  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  // Fetch initial channels
  useEffect(() => {
    const fetchChannels = async () => {
      if (!token) return;
      try {
        const res = await fetch('http://localhost:3000/api/channels', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setChannels(data);
        if (data.length > 0 && !activeChannelId) {
          setActiveChannelId(data[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch channels', err);
      }
    };
    fetchChannels();
  }, [token, setChannels, activeChannelId, setActiveChannelId]);

  // Fetch messages when active channel changes and join socket room
  useEffect(() => {
    const fetchMessages = async () => {
      if (!token || !activeChannelId) return;
      
      // Join socket room
      joinChannel(activeChannelId);

      try {
        const res = await fetch(`http://localhost:3000/api/channels/${activeChannelId}/messages`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setMessages(data);
      } catch (err) {
        console.error('Failed to fetch messages', err);
      }
    };
    
    fetchMessages();
  }, [token, activeChannelId, joinChannel, setMessages]);

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

  const handleCreateChannel = async () => {
    const name = prompt('Nome do novo canal (sem espaços):');
    if (!name || !token) return;

    try {
      const res = await fetch('http://localhost:3000/api/channels', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ name: name.toLowerCase() })
      });
      const newChannel = await res.json();
      setChannels([...channels, newChannel]);
      setActiveChannelId(newChannel.id);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar - Channels */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h3>Levicord</h3>
        </div>
        
        <div className="channels-section">
          <div className="channels-header">
            <span>CANAIS DE TEXTO</span>
            <button className="icon-btn" onClick={handleCreateChannel} title="Criar Canal">
              <Plus size={16} />
            </button>
          </div>
          
          <ul className="channel-list">
            {channels.map(channel => (
              <li 
                key={channel.id} 
                className={`channel-item ${activeChannelId === channel.id ? 'active' : ''}`}
                onClick={() => setActiveChannelId(channel.id)}
              >
                <Hash size={20} className="channel-icon" />
                <span>{channel.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="user-panel">
          <div className="user-info">
             {/* We can show current user name here later */}
             <span className="status-indicator"></span>
             <span>Online</span>
          </div>
          <button className="icon-btn logout-btn" onClick={logout}>Sair</button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="chat-area">
        {activeChannelId ? (
          <>
            <div className="chat-header">
              <Hash size={24} className="channel-icon" />
              <h3>{channels.find(c => c.id === activeChannelId)?.name}</h3>
            </div>
            
            <div className="messages-list">
              {messages.map((msg, idx) => {
                // Grouping logic can be added here (if same author as previous, hide avatar)
                const isConsecutive = idx > 0 && messages[idx - 1].author.id === msg.author.id;

                return (
                  <div key={msg.id} className={`message-item ${isConsecutive ? 'consecutive' : ''}`}>
                    {!isConsecutive && (
                      <img 
                        src={msg.author.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'} 
                        alt="avatar" 
                        className="avatar" 
                      />
                    )}
                    <div className="message-content">
                      {!isConsecutive && (
                        <div className="message-header">
                          <span className="author-name">{msg.author.displayName}</span>
                          <span className="timestamp">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      )}
                      <p className="text">{msg.content}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-wrapper">
              <form onSubmit={handleSend} className="chat-form">
                <input 
                  type="text" 
                  placeholder={`Conversar em #${channels.find(c => c.id === activeChannelId)?.name}`}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="chat-input"
                />
                <button type="submit" className="send-btn" disabled={!inputText.trim()}>
                  <Send size={20} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>Selecione ou crie um canal para começar.</p>
          </div>
        )}
      </div>
    </div>
  );
}

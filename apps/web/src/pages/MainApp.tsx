import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useChatStore, type ServerWithDetails } from '../stores/useChatStore';
import { useSocket } from '../hooks/useSocket';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { useChannelMessages } from '../hooks/useChannelMessages';
import { useDmMessages } from '../hooks/useDmMessages';
import { apiFetch } from '../lib/api';
import { ServerRail } from '../components/ServerRail';
import { Sidebar } from '../components/Sidebar';
import { ChatHeader } from '../components/ChatHeader';
import { SearchResultsOverlay } from '../components/SearchResultsOverlay';
import { CreateChannelModal } from '../components/CreateChannelModal';
import { CreateServerModal } from '../components/CreateServerModal';
import { JoinServerModal } from '../components/JoinServerModal';
import { ServerInviteModal } from '../components/ServerInviteModal';
import { SuperAdminModal } from '../components/SuperAdminModal';
import { EditProfileModal } from '../components/EditProfileModal';
import { LogoutModal } from '../components/LogoutModal';
import { MessageList } from '../components/MessageList';
import { ChatInput } from '../components/ChatInput';
import { VoiceScreen } from '../components/VoiceScreen';
import { MembersSidebar } from '../components/MembersSidebar';
import { useDmCall } from '../hooks/useDmCall';
import { IncomingCallModal } from '../components/IncomingCallModal';
import { DmCallingScreen } from '../components/DmCallingScreen';
import { WebRTCGrid } from '../components/WebRTCGrid';
import { Compass, AlertCircle, ShieldAlert, LogOut, Shield } from 'lucide-react';
import type { Channel, Message, User, Server } from '@discord-clone/shared';
import type { UploadedAttachment } from '../components/ChatInput';
import './MainApp.css';

/**
 * MainApp — layout and server/channel navigation orchestrator.
 * Handles access verification (invite requirement), server selection,
 * channels segregation, and moderation workflows.
 */
export default function MainApp() {
  const { token, logout } = useAuth();

  // ── Fine-grained store subscriptions ──────────────────────────────────────
  const viewMode = useChatStore((s) => s.viewMode);
  const setViewMode = useChatStore((s) => s.setViewMode);
  const servers = useChatStore((s) => s.servers);
  const setServers = useChatStore((s) => s.setServers);
  const activeServerId = useChatStore((s) => s.activeServerId);
  const setActiveServerId = useChatStore((s) => s.setActiveServerId);
  const activeServer = useChatStore((s) => s.activeServer);
  const setActiveServer = useChatStore((s) => s.setActiveServer);

  const channels = useChatStore((s) => s.channels);
  const setChannels = useChatStore((s) => s.setChannels);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const setActiveChannelId = useChatStore((s) => s.setActiveChannelId);

  const users = useChatStore((s) => s.users);
  const setUsers = useChatStore((s) => s.setUsers);
  const activeDmUserId = useChatStore((s) => s.activeDmUserId);
  const setActiveDmUserId = useChatStore((s) => s.setActiveDmUserId);

  const currentUser = useChatStore((s) => s.currentUser);
  const setCurrentUser = useChatStore((s) => s.setCurrentUser);
  const updateCurrentUser = useChatStore((s) => s.updateCurrentUser);
  const onlineUserIds = useChatStore((s) => s.onlineUserIds);
  const markMessageDeleted = useChatStore((s) => s.markMessageDeleted);

  const { socket, joinChannel, sendMessage, sendDm, sendTypingStart, sendTypingStop } = useSocket();
  const {
    activeDmCall,
    incomingCall,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  } = useDmCall(socket);

  // ── Access & Gatekeeper State ──────────────────────────────────────────────
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [gateInviteCode, setGateInviteCode] = useState('');
  const [gateLoading, setGateLoading] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

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

  // ── UI Modal states ────────────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [isCreateServerModalOpen, setIsCreateServerModalOpen] = useState(false);
  const [isJoinServerModalOpen, setIsJoinServerModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isSuperAdminModalOpen, setIsSuperAdminModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(true);
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

  // ── 1. Bootstrap: Fetch Current User Profile ───────────────────────────────
  useEffect(() => {
    if (!token) return;
    apiFetch<User>('/api/auth/me', token)
      .then((user) => setCurrentUser(user))
      .catch(console.error);
  }, [token, setCurrentUser]);

  // ── 2. Access Gatekeeper & Pending Invite Processing ──────────────────────
  const checkAccessAndLoadServers = useCallback(async () => {
    if (!token) return;

    // Check for pending invite in sessionStorage
    const pendingInvite = sessionStorage.getItem('pending_invite_code');
    if (pendingInvite) {
      try {
        const clean = pendingInvite.trim();
        const joined = await apiFetch<{ server: Server }>(`/api/servers/join/${encodeURIComponent(clean)}`, token, {
          method: 'POST',
        });
        sessionStorage.removeItem('pending_invite_code');
        if (joined?.server) {
          setActiveServerId(joined.server.id);
        }
      } catch {
        // Invite might be invalid or expired; continue to check access
      }
    }

    try {
      const status = await apiFetch<{ hasAccess: boolean }>('/api/servers/access-status', token);
      setHasAccess(status.hasAccess);

      if (status.hasAccess) {
        const fetchedServers = await apiFetch<Server[]>('/api/servers', token);
        setServers(fetchedServers);
      }
    } catch {
      setHasAccess(false);
    }
  }, [token, setActiveServerId, setServers]);

  useEffect(() => {
    checkAccessAndLoadServers();
  }, [checkAccessAndLoadServers]);

  // ── 3. Load Active Server Details when selected ────────────────────────────
  const loadActiveServer = useCallback(async () => {
    if (!token || !activeServerId) {
      setActiveServer(null);
      return;
    }
    try {
      const serverDetails = await apiFetch<ServerWithDetails>(`/api/servers/${activeServerId}`, token);
      setActiveServer(serverDetails);
    } catch {
      setActiveServer(null);
    }
  }, [token, activeServerId, setActiveServer]);

  useEffect(() => {
    loadActiveServer();
  }, [loadActiveServer]);

  // ── 4. Load Channels (Filtered by Server if active) ────────────────────────
  useEffect(() => {
    if (!token || hasAccess === false) return;
    setChannelsError(null);

    const path = activeServerId
      ? `/api/channels?serverId=${encodeURIComponent(activeServerId)}`
      : '/api/channels';

    apiFetch<Channel[]>(path, token)
      .then((data) => {
        setChannels(data);
        const firstText = data.find((c) => c.type !== 'VOICE');
        if (firstText) {
          setActiveChannelId(firstText.id);
        } else if (data.length > 0) {
          setActiveChannelId(data[0].id);
        } else {
          setActiveChannelId('');
        }
      })
      .catch(() => setChannelsError('Não foi possível carregar os canais. Verifique a ligação e tente novamente.'));
  }, [token, activeServerId, channelsRetryKey, hasAccess, setChannels, setActiveChannelId]);

  // ── 5. Load Users (for DMs and Member resolution across channels) ──────────
  useEffect(() => {
    if (!token || hasAccess === false) return;
    apiFetch<{ users: User[]; nextCursor: string | null }>('/api/users', token)
      .then(({ users: fetchedUsers }) => setUsers(fetchedUsers))
      .catch(console.error);
  }, [token, hasAccess, setUsers]);

  // ── Derived Permissions ────────────────────────────────────────────────────
  const isSuperAdmin =
    currentUser?.role === 'SUPERADMIN' ||
    currentUser?.email?.toLowerCase() === 'joaoprf2001@gmail.com';

  // For server channels: ONLY a local server admin (ADMIN or OWNER of that server) can alter/manage channels.
  const isLocalServerAdmin =
    activeServer?.currentUserRole === 'ADMIN' ||
    activeServer?.currentUserRole === 'OWNER';

  // Local server admin manages server channels; SuperAdmin manages global channels
  const canManageChannel = Boolean(activeServerId ? isLocalServerAdmin : isSuperAdmin);

  // When a superadmin is observing a server they haven't been invited to join, they have no server member role
  const isNonMemberViewingServer = Boolean(activeServerId && !activeServer?.currentUserRole);

  // ── Derived active items ───────────────────────────────────────────────────
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
    ? (isNonMemberViewingServer
        ? 'Apenas membros convidados deste servidor podem enviar mensagens'
        : `Conversar em #${activeChannel?.name ?? ''}`)
    : `Enviar mensagem para @${activeDmUser?.displayName ?? ''}`;

  const hasActiveConversation =
    (viewMode === 'channels' && !!activeChannelId && !!activeChannel) ||
    (viewMode === 'dms' && !!activeDmUserId && !!activeDmUser);

  // ── Send handlers ─────────────────────────────────────────────────────────
  const handleSend = (content: string | null, attachment: UploadedAttachment | null) => {
    if (viewMode === 'channels' && isNonMemberViewingServer) return;
    const attachments = attachment ? [attachment] : undefined;
    if (viewMode === 'channels' && activeChannelId) sendMessage(activeChannelId, content, attachments);
    else if (viewMode === 'dms' && activeDmUserId) sendDm(activeDmUserId, content, attachments);
  };

  // ── Channel CRUD ──────────────────────────────────────────────────────────
  const handleSaveChannel = async (name: string, description: string, type: 'TEXT' | 'VOICE' = 'TEXT') => {
    if (!token || !canManageChannel) return;
    if (!editingChannel) {
      const endpoint = activeServerId
        ? `/api/servers/${activeServerId}/channels`
        : '/api/channels';

      const newChannel = await apiFetch<Channel>(endpoint, token, {
        method: 'POST',
        body: JSON.stringify({ name, description, type }),
      });
      setChannels([...channels, newChannel]);
      if (type === 'TEXT') setActiveChannelId(newChannel.id);
    } else {
      const endpoint = activeServerId
        ? `/api/servers/${activeServerId}/channels/${editingChannel.id}`
        : `/api/channels/${editingChannel.id}`;

      const updated = await apiFetch<Channel>(endpoint, token, {
        method: 'PUT',
        body: JSON.stringify({ name, description }),
      });
      setChannels(channels.map((c) => (c.id === updated.id ? updated : c)));
      setEditingChannel(null);
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    if (!token || !canManageChannel) return;
    const endpoint = activeServerId
      ? `/api/servers/${activeServerId}/channels/${channelId}`
      : `/api/channels/${channelId}`;

    await apiFetch(endpoint, token, {
      method: 'DELETE',
    });

    const remaining = channels.filter((c) => c.id !== channelId);
    setChannels(remaining);

    if (editingChannel?.id === channelId) {
      setEditingChannel(null);
      setIsModalOpen(false);
    }

    if (activeChannelId === channelId) {
      const nextChannel = remaining.find((c) => c.type === 'TEXT') || remaining[0];
      setActiveChannelId(nextChannel ? nextChannel.id : '');
    }

    if (activeVoiceChannelId === channelId) {
      setActiveVoiceChannelId(null);
    }
  };

  const handleChannelClick = (channel: Channel) => {
    setActiveChannelId(channel.id);
    if (channel.type === 'VOICE') setActiveVoiceChannelId(null);
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!token || !activeChannelId) return;
    if (!window.confirm('Tem certeza que deseja excluir esta mensagem?')) return;
    try {
      markMessageDeleted(messageId);
      await apiFetch(`/api/channels/${activeChannelId}/messages/${messageId}`, token, {
        method: 'DELETE',
      });
    } catch (err: any) {
      console.error('Erro ao excluir mensagem:', err);
    }
  };

  // ── Server Navigation & Actions ────────────────────────────────────────────
  const handleSelectServer = (serverId: string | null) => {
    setActiveServerId(serverId);
    if (serverId) {
      setViewMode('channels');
    } else {
      setViewMode('dms');
    }
  };

  const handleServerCreated = (newServer: Server & { defaultChannelId?: string }) => {
    setServers([...servers, newServer]);
    setActiveServerId(newServer.id);
    setViewMode('channels');
    setIsCreateServerModalOpen(false);
  };

  const handleServerJoined = (server: Server) => {
    if (!servers.some((s) => s.id === server.id)) {
      setServers([...servers, server]);
    }
    setActiveServerId(server.id);
    setViewMode('channels');
    setHasAccess(true);
    setIsJoinServerModalOpen(false);
  };

  // ── Gatekeeper Submit Handler (when user has no invite) ───────────────────
  const handleGateJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = gateInviteCode.trim().replace(/^.*\/join\//, '');
    if (!cleanCode) {
      setGateError('Insira um código de convite válido.');
      return;
    }

    setGateLoading(true);
    setGateError(null);
    try {
      const result = await apiFetch<{ server: Server }>(`/api/servers/join/${encodeURIComponent(cleanCode)}`, token, {
        method: 'POST',
      });
      if (result?.server) {
        handleServerJoined(result.server);
      }
    } catch (err: any) {
      setGateError(err.message || 'Código de convite inválido ou expirado.');
    } finally {
      setGateLoading(false);
    }
  };

  // ── 6. Render Gatekeeper Screen if Access Denied (No Invite) ───────────────
  if (hasAccess === false) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100vh',
          width: '100%',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#1e1f22',
          color: '#f2f3f5',
          fontFamily: "'Inter', sans-serif",
          textAlign: 'left',
        }}
      >
        <div
          style={{
            padding: '36px',
            backgroundColor: '#2b2d31',
            borderRadius: '12px',
            width: '460px',
            maxWidth: '92%',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: 'rgba(237, 66, 69, 0.15)',
                color: '#ed4245',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ShieldAlert size={28} />
            </div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#f2f3f5' }}>
                Acesso Restrito por Convite
              </h2>
              <p style={{ fontSize: '13px', color: '#949ba4', margin: '3px 0 0' }}>
                O Levicord é uma plataforma fechada
              </p>
            </div>
          </div>

          <p style={{ fontSize: '14px', color: '#dbdee1', lineHeight: '1.5', marginBottom: '20px' }}>
            O seu login com o Google foi concluído com sucesso, mas o acesso é concedido apenas a utilizadores que pertençam a um servidor através de um <strong>link de convite válido</strong>.
          </p>

          {gateError && (
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(237, 66, 69, 0.12)',
                border: '1px solid rgba(237, 66, 69, 0.3)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px',
                color: '#ed4245',
                fontSize: '13px',
              }}
            >
              <AlertCircle size={16} />
              <span>{gateError}</span>
            </div>
          )}

          <form onSubmit={handleGateJoin}>
            <div style={{ marginBottom: '18px' }}>
              <label htmlFor="gate-code" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#b5bac1', marginBottom: '8px', textTransform: 'uppercase' }}>
                CÓDIGO DE CONVITE DO SERVIDOR
              </label>
              <input
                id="gate-code"
                type="text"
                placeholder="Ex: d4f89a1c ou link de convite"
                value={gateInviteCode}
                onChange={(e) => setGateInviteCode(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#1e1f22',
                  border: '1px solid #383a40',
                  borderRadius: '6px',
                  color: '#f2f3f5',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                required
              />
            </div>

            <button
              type="submit"
              disabled={gateLoading}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#5865f2',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: gateLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '12px',
              }}
            >
              <Compass size={18} />
              {gateLoading ? 'Validando convite...' : 'Validar Convite e Entrar'}
            </button>
          </form>

          <button
            type="button"
            onClick={logout}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: 'transparent',
              color: '#949ba4',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <LogOut size={16} />
            Sair da Conta Google ({currentUser?.email})
          </button>
        </div>
      </div>
    );
  }

  // ── 7. Render Full Application Workspace ───────────────────────────────────
  return (
    <div className="app-container">
      {/* ── Server Rail (Guild list & quick actions) ───────────────────── */}
      <ServerRail
        servers={servers}
        activeServerId={activeServerId}
        onSelectServer={handleSelectServer}
        onOpenCreateServer={() => setIsCreateServerModalOpen(true)}
        onOpenJoinServer={() => setIsJoinServerModalOpen(true)}
        onOpenSuperAdmin={() => setIsSuperAdminModalOpen(true)}
        currentUser={currentUser}
        isSuperAdmin={isSuperAdmin}
      />

      {/* ── Sidebar Component (Channels & DMs) ─────────────────────────── */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        channels={channels}
        activeChannelId={activeChannelId}
        onSelectChannel={handleChannelClick}
        onOpenCreateChannel={() => {
          if (canManageChannel) setIsModalOpen(true);
        }}
        onEditChannel={(ch) => {
          if (canManageChannel) setEditingChannel(ch);
        }}
        createChannelBtnRef={createChannelBtnRef}
        channelsError={channelsError}
        onRetryChannels={() => setChannelsRetryKey((k) => k + 1)}
        users={users}
        activeDmUserId={activeDmUserId}
        onSelectDmUser={setActiveDmUserId}
        currentUser={currentUser}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onOpenLogout={() => setIsLogoutModalOpen(true)}
        activeServer={activeServer}
        onOpenInviteModal={() => setIsInviteModalOpen(true)}
        canCreateChannel={canManageChannel}
        onDeleteChannel={canManageChannel ? handleDeleteChannel : undefined}
      />

      {/* ── Main Chat / Content Area ───────────────────────────────────── */}
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
              isMembersSidebarOpen={isMembersOpen}
              onToggleMembersSidebar={() => setIsMembersOpen((o) => !o)}
              onStartCall={activeDmUser ? (isVideo) => startCall(activeDmUser, isVideo) : undefined}
              isInDmCall={activeDmCall?.targetUser.id === activeDmUserId}
              onEndDmCall={endCall}
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
                onJoin={() => {
                  if (isSuperAdmin && activeServerId) return;
                  setActiveVoiceChannelId(activeChannelId!);
                }}
                onDisconnect={() => setActiveVoiceChannelId(null)}
                isSuperAdmin={isSuperAdmin}
                isServerChannel={Boolean(activeServerId)}
              />
            ) : (
              <div className="chat-body-container">
                <div className="chat-messages-column">
                  {viewMode === 'dms' && activeDmCall?.targetUser.id === activeDmUserId && (
                    activeDmCall.status === 'calling' ? (
                      <DmCallingScreen
                        targetUser={activeDmCall.targetUser}
                        isVideo={activeDmCall.isVideo}
                        onCancel={endCall}
                      />
                    ) : (
                      <div
                        className="dm-call-webrtc-box"
                        style={{
                          width: '100%',
                          height: '460px',
                          minHeight: '360px',
                          position: 'relative',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                          background: '#111214',
                        }}
                      >
                        <WebRTCGrid
                          channelId={activeDmCall.roomId}
                          onDisconnect={endCall}
                        />
                      </div>
                    )
                  )}

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
                    onDeleteMessage={handleDeleteMessage}
                    currentUserId={currentUser?.id}
                    isSuperAdmin={isSuperAdmin}
                    isServerAdmin={isLocalServerAdmin}
                  />
                  {isNonMemberViewingServer && viewMode === 'channels' && (
                    <div
                      style={{
                        padding: '8px 16px',
                        backgroundColor: 'rgba(88, 101, 242, 0.1)',
                        borderTop: '1px solid rgba(88, 101, 242, 0.2)',
                        color: '#949ba4',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <Shield size={14} color="#5865f2" />
                      <span>
                        Modo de moderação: Você não é membro deste servidor. Para participar das conversas e enviar mensagens, é necessário ser convidado.
                      </span>
                    </div>
                  )}
                  <ChatInput
                    placeholder={chatPlaceholder}
                    disabled={viewMode === 'channels' && isNonMemberViewingServer}
                    onSend={handleSend}
                    onTypingStart={viewMode === 'channels' && activeChannelId && !isNonMemberViewingServer ? () => sendTypingStart(activeChannelId) : undefined}
                    onTypingStop={viewMode === 'channels' && activeChannelId && !isNonMemberViewingServer ? () => sendTypingStop(activeChannelId) : undefined}
                  />
                </div>

                {viewMode === 'channels' && (
                  <MembersSidebar
                    users={users}
                    currentUser={currentUser}
                    onlineUserIds={onlineUserIds}
                    isOpen={isMembersOpen}
                    onSelectUser={(userId) => {
                      setActiveServerId(null);
                      setViewMode('dms');
                      setActiveDmUserId(userId);
                    }}
                    serverId={activeServerId}
                    serverMembers={activeServer?.members}
                    currentUserRole={activeServer?.currentUserRole}
                    isSuperAdmin={isSuperAdmin}
                    onMemberActionSuccess={loadActiveServer}
                  />
                )}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <p>
              {viewMode === 'channels'
                ? (channels.length === 0
                    ? (activeServer ? 'Nenhum canal neste servidor. Crie um canal para começar.' : 'Nenhum canal disponível.')
                    : 'Selecione um canal.')
                : (users.length === 0 ? 'Nenhum utilizador disponível.' : 'Selecione um utilizador para iniciar uma conversa.')}
            </p>
          </div>
        )}
      </main>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <CreateChannelModal
        isOpen={(isModalOpen || editingChannel !== null) && canManageChannel}
        onClose={() => { setIsModalOpen(false); setEditingChannel(null); }}
        onSubmit={handleSaveChannel}
        onDelete={editingChannel && canManageChannel ? () => handleDeleteChannel(editingChannel.id) : undefined}
        initialName={editingChannel?.name}
        initialDescription={editingChannel?.description ?? ''}
        initialType={editingChannel?.type ?? 'TEXT'}
        title={editingChannel ? 'Editar Canal' : (activeServer ? `Criar Canal em ${activeServer.name}` : undefined)}
        submitLabel={editingChannel ? 'Salvar alterações' : undefined}
        triggerRef={createChannelBtnRef}
      />

      <CreateServerModal
        isOpen={isCreateServerModalOpen && isSuperAdmin}
        onClose={() => setIsCreateServerModalOpen(false)}
        onServerCreated={handleServerCreated}
      />

      <JoinServerModal
        isOpen={isJoinServerModalOpen}
        onClose={() => setIsJoinServerModalOpen(false)}
        onServerJoined={handleServerJoined}
      />

      <ServerInviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        serverId={activeServerId}
        serverName={activeServer?.name}
      />

      <SuperAdminModal
        isOpen={isSuperAdminModalOpen}
        onClose={() => setIsSuperAdminModalOpen(false)}
        currentUser={currentUser}
        token={token}
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

      {/* ── Incoming Call Modal (for receiving 1-on-1 DM calls) ───────────── */}
      {incomingCall && (
        <IncomingCallModal
          incomingCall={incomingCall}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      {/* ── Floating Active Call Bar (when navigating away during a DM call) ── */}
      {activeDmCall && activeDmCall.status === 'connected' && (viewMode !== 'dms' || activeDmUserId !== activeDmCall.targetUser.id) && (
        <div
          className="dm-active-call-floating-bar"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: 'rgba(17, 18, 20, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid #23a55a',
            borderRadius: '10px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          }}
        >
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#23a55a', display: 'inline-block' }} />
          <span style={{ color: '#f2f3f5', fontSize: '13px', fontWeight: 600 }}>
            Em chamada com @{activeDmCall.targetUser.displayName}
          </span>
          <button
            type="button"
            onClick={() => {
              setActiveServerId(null);
              setViewMode('dms');
              setActiveDmUserId(activeDmCall.targetUser.id);
            }}
            style={{
              background: '#5865f2',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={endCall}
            style={{
              background: '#da373c',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Desconectar
          </button>
        </div>
      )}
    </div>
  );
}

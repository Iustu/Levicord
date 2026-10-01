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
import { Compass, AlertCircle, ShieldAlert, LogOut } from 'lucide-react';
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

  const { socket, joinChannel, sendMessage, sendDm, sendTypingStart, sendTypingStop } = useSocket();

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

  // ── 5. Load Users for DMs ──────────────────────────────────────────────────
  useEffect(() => {
    if (!token || viewMode !== 'dms' || hasAccess === false) return;
    apiFetch<{ users: User[]; nextCursor: string | null }>('/api/users', token)
      .then(({ users: fetchedUsers }) => setUsers(fetchedUsers))
      .catch(console.error);
  }, [token, viewMode, hasAccess, setUsers]);

  // ── Derived Permissions ────────────────────────────────────────────────────
  const isSuperAdmin =
    currentUser?.role === 'SUPERADMIN' ||
    currentUser?.email?.toLowerCase() === 'joaoprf2001@gmail.com';

  const isServerAdmin =
    isSuperAdmin ||
    activeServer?.currentUserRole === 'ADMIN' ||
    activeServer?.currentUserRole === 'OWNER';

  const canCreateChannel = activeServerId ? isServerAdmin : isSuperAdmin || currentUser?.role === 'ADMIN';

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

  // ── Server Navigation & Actions ────────────────────────────────────────────
  const handleSelectServer = (serverId: string | null) => {
    setActiveServerId(serverId);
    setViewMode('channels');
  };

  const handleServerCreated = (newServer: Server & { defaultChannelId?: string }) => {
    setServers([...servers, newServer]);
    setActiveServerId(newServer.id);
    setIsCreateServerModalOpen(false);
  };

  const handleServerJoined = (server: Server) => {
    if (!servers.some((s) => s.id === server.id)) {
      setServers([...servers, server]);
    }
    setActiveServerId(server.id);
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
        activeServer={activeServer}
        onOpenInviteModal={() => setIsInviteModalOpen(true)}
        canCreateChannel={canCreateChannel}
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
              <div className="chat-body-container">
                <div className="chat-messages-column">
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
                </div>

                {viewMode === 'channels' && (
                  <MembersSidebar
                    users={users}
                    currentUser={currentUser}
                    onlineUserIds={onlineUserIds}
                    isOpen={isMembersOpen}
                    onSelectUser={(userId) => {
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
        isOpen={isModalOpen || editingChannel !== null}
        onClose={() => { setIsModalOpen(false); setEditingChannel(null); }}
        onSubmit={handleSaveChannel}
        initialName={editingChannel?.name}
        initialDescription={editingChannel?.description ?? ''}
        initialType={editingChannel?.type ?? 'TEXT'}
        title={editingChannel ? 'Editar Canal' : (activeServer ? `Criar Canal em ${activeServer.name}` : undefined)}
        submitLabel={editingChannel ? 'Salvar alterações' : undefined}
        triggerRef={createChannelBtnRef}
      />

      <CreateServerModal
        isOpen={isCreateServerModalOpen}
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
    </div>
  );
}

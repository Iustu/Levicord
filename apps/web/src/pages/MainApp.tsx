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
import { ConfirmModal } from '../components/ConfirmModal';
import { GatekeeperScreen } from '../components/GatekeeperScreen';
import { MessageList } from '../components/MessageList';
import { ChatInput } from '../components/ChatInput';
import { VoiceScreen } from '../components/VoiceScreen';
import { MembersSidebar } from '../components/MembersSidebar';
import { useDmCall } from '../hooks/useDmCall';
import { IncomingCallModal } from '../components/IncomingCallModal';
import { DmCallingScreen } from '../components/DmCallingScreen';
import { WebRTCGrid } from '../components/WebRTCGrid';
import { Shield, UserPlus, Check, X, Clock, PhoneOff } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import type { Channel, Message, User, Server, DmContact } from '@discord-clone/shared';
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
  const dmContacts = useChatStore((s) => s.dmContacts);
  const setDmContacts = useChatStore((s) => s.setDmContacts);
  const updateDmContact = useChatStore((s) => s.updateDmContact);
  const removeDmContact = useChatStore((s) => s.removeDmContact);
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
  const [deleteMessageTargetId, setDeleteMessageTargetId] = useState<string | null>(null);
  const [isDeleteServerModalOpen, setIsDeleteServerModalOpen] = useState(false);

  const [connectedVoice, setConnectedVoice] = useState<{
    channelId: string;
    channelName: string;
    serverId: string | null;
    serverName: string | null;
  } | null>(null);
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
    apiFetch<any>('/api/users', token)
      .then((data) => {
        const fetchedUsers = Array.isArray(data) ? data : data?.users || [];
        setUsers(fetchedUsers);
      })
      .catch(console.error);
  }, [token, hasAccess, setUsers]);

  // ── 5.1 Load DM Contacts (users with whom DM relationship/request exists) ──
  const loadDmContacts = useCallback(async () => {
    if (!token || hasAccess === false) return;
    try {
      const data = await apiFetch<DmContact[] | { contacts: DmContact[] }>('/api/dms/contacts', token);
      const list = Array.isArray(data) ? data : data?.contacts || [];
      setDmContacts(list);
    } catch (err) {
      console.error('Erro ao carregar contatos de DM:', err);
    }
  }, [token, hasAccess, setDmContacts]);

  useEffect(() => {
    loadDmContacts();
  }, [loadDmContacts]);

  useEffect(() => {
    if (viewMode === 'dms') {
      loadDmContacts();
    }
  }, [viewMode, loadDmContacts]);

  // ── Derived Permissions ────────────────────────────────────────────────────
  const isSuperAdmin = currentUser?.role === 'SUPERADMIN';

  // For server channels: ONLY a local server admin (ADMIN or OWNER of that server) can alter/manage channels.
  const isLocalServerAdmin =
    activeServer?.currentUserRole === 'ADMIN' ||
    activeServer?.currentUserRole === 'OWNER';

  // Local server admin manages server channels; SuperAdmin manages global channels
  const canManageChannel = Boolean(activeServerId ? isLocalServerAdmin : isSuperAdmin);

  // When a superadmin (or user) is observing a server they are not a member of (neither member nor creator)
  const isServerMember = Boolean(
    activeServer?.currentUserRole ||
    (activeServer?.ownerId && currentUser?.id && activeServer.ownerId === currentUser.id)
  );
  const isNonMemberViewingServer = Boolean(activeServerId && activeServer && !isServerMember);

  // Creator / Owner of server or SuperAdmin can delete the server
  const isServerOwner = Boolean(
    activeServer &&
    currentUser?.id &&
    (activeServer.ownerId === currentUser.id || activeServer.currentUserRole === 'OWNER')
  );
  const canDeleteServer = Boolean(activeServerId && (isServerOwner || isSuperAdmin));

  const handleDeleteServer = async (targetServerId?: string) => {
    const sId = targetServerId || activeServerId;
    if (!token || !sId) return;
    try {
      await apiFetch(`/api/servers/${sId}`, token, {
        method: 'DELETE',
      });
      setServers(servers.filter((s) => s.id !== sId));
      if (activeServerId === sId) {
        setActiveServerId(null);
        setActiveServer(null);
        setViewMode('dms');
      }
      setIsDeleteServerModalOpen(false);
    } catch (err: any) {
      console.error('Erro ao excluir servidor:', err);
      alert(err.message || 'Erro ao excluir servidor.');
    }
  };

  // ── Derived active items ───────────────────────────────────────────────────
  const safeChannels = Array.isArray(channels) ? channels : [];
  const safeDmContacts = Array.isArray(dmContacts) ? dmContacts : [];
  const safeUsers = Array.isArray(users) ? users : [];

  const activeChannel = safeChannels.find((c) => c.id === activeChannelId);
  const activeDmContact = safeDmContacts.find((c) => c.id === activeDmUserId);
  const activeDmUser =
    safeUsers.find((u) => u.id === activeDmUserId) ||
    (activeDmContact ? { id: activeDmContact.id, displayName: activeDmContact.displayName, avatarUrl: activeDmContact.avatarUrl } : null) ||
    (Array.isArray(activeServer?.members) ? (activeServer.members.find((m) => m.user?.id === activeDmUserId)?.user as any) : null) ||
    null;
  const isVoiceChannel = activeChannel?.type === 'VOICE';
  const isViewingConnectedVoice = Boolean(
    connectedVoice &&
    viewMode === 'channels' &&
    activeChannelId === connectedVoice.channelId
  );

  const handleJoinVoice = useCallback((channel: Channel) => {
    if (isNonMemberViewingServer) return;
    setConnectedVoice({
      channelId: channel.id,
      channelName: channel.name,
      serverId: activeServerId,
      serverName: activeServer?.name || null,
    });
  }, [isNonMemberViewingServer, activeServerId, activeServer?.name]);

  const handleDisconnectVoice = useCallback(() => {
    setConnectedVoice(null);
  }, []);

  const handleReturnToVoice = useCallback(() => {
    if (!connectedVoice) return;
    if (connectedVoice.serverId) {
      setActiveServerId(connectedVoice.serverId);
    }
    setViewMode('channels');
    setActiveChannelId(connectedVoice.channelId);
    setSidebarOpen(false);
  }, [connectedVoice, setActiveServerId, setViewMode, setActiveChannelId]);

  // ── DM Request Status Tracking & Management ───────────────────────────────
  const [activeDmStatus, setActiveDmStatus] = useState<{
    status: 'NONE' | 'PENDING' | 'ACCEPTED' | 'REJECTED';
    requestId?: string;
    isSender?: boolean;
    isReceiver?: boolean;
    loading?: boolean;
  } | null>(null);
  const [dmActionLoading, setDmActionLoading] = useState(false);

  useEffect(() => {
    if (!token || !activeDmUserId || viewMode !== 'dms') {
      setActiveDmStatus(null);
      return;
    }

    const existing = safeDmContacts.find((c) => c.id === activeDmUserId);
    if (existing) {
      setActiveDmStatus({
        status: existing.status,
        requestId: existing.requestId || existing.request?.id,
        isSender: existing.isSender,
        isReceiver: existing.isReceiver,
        loading: false,
      });
      return;
    }

    let cancelled = false;
    setActiveDmStatus({ status: 'NONE', loading: true });
    apiFetch<{
      status: 'NONE' | 'PENDING' | 'ACCEPTED' | 'REJECTED';
      request: any;
      isSender: boolean;
      isReceiver: boolean;
    }>(`/api/dms/requests/status/${encodeURIComponent(activeDmUserId)}`, token)
      .then((res) => {
        if (cancelled) return;
        setActiveDmStatus({
          status: res.status,
          requestId: res.request?.id,
          isSender: res.isSender,
          isReceiver: res.isReceiver,
          loading: false,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setActiveDmStatus({ status: 'NONE', loading: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, activeDmUserId, viewMode, dmContacts]);

  const currentDmStatus = activeDmStatus?.status || activeDmContact?.status || 'NONE';
  const isDmAccepted = viewMode !== 'dms' || currentDmStatus === 'ACCEPTED';
  const isDmIncomingPending =
    viewMode === 'dms' &&
    currentDmStatus === 'PENDING' &&
    Boolean(activeDmStatus?.isReceiver ?? activeDmContact?.isReceiver);
  const isDmOutgoingPending =
    viewMode === 'dms' &&
    currentDmStatus === 'PENDING' &&
    Boolean(activeDmStatus?.isSender ?? activeDmContact?.isSender);
  const isDmNoRequest =
    viewMode === 'dms' &&
    (currentDmStatus === 'NONE' || (!activeDmContact && !activeDmStatus?.status));
  const isDmRejected = viewMode === 'dms' && currentDmStatus === 'REJECTED';

  const handleSendDmRequest = async () => {
    if (!token || !activeDmUserId || dmActionLoading) return;
    setDmActionLoading(true);
    try {
      const res = await apiFetch<any>('/api/dms/requests', token, {
        method: 'POST',
        body: JSON.stringify({ targetUserId: activeDmUserId }),
      });
      if (socket) {
        socket.emit('send_dm_request', { targetUserId: activeDmUserId });
      }
      if (res?.status === 'ACCEPTED') {
        updateDmContact({
          id: activeDmUserId,
          displayName: activeDmUser?.displayName || 'Utilizador',
          avatarUrl: activeDmUser?.avatarUrl,
          status: 'ACCEPTED',
          requestId: res.id,
          isSender: true,
          isReceiver: false,
        });
      } else if (res) {
        updateDmContact({
          id: activeDmUserId,
          displayName: activeDmUser?.displayName || 'Utilizador',
          avatarUrl: activeDmUser?.avatarUrl,
          status: 'PENDING',
          requestId: res.id,
          isSender: true,
          isReceiver: false,
        });
      }
      await loadDmContacts();
    } catch (err: any) {
      console.error('Erro ao enviar solicitação de DM:', err);
    } finally {
      setDmActionLoading(false);
    }
  };

  const handleAcceptDmRequest = async (reqId?: string) => {
    const requestId = reqId || activeDmStatus?.requestId || activeDmContact?.requestId || activeDmContact?.request?.id;
    if (!token || !requestId || dmActionLoading) return;
    setDmActionLoading(true);
    try {
      await apiFetch<any>(`/api/dms/requests/${requestId}/accept`, token, {
        method: 'POST',
      });
      if (socket) {
        socket.emit('accept_dm_request', { requestId });
      }
      if (activeDmUserId) {
        updateDmContact({
          id: activeDmUserId,
          displayName: activeDmUser?.displayName || 'Utilizador',
          avatarUrl: activeDmUser?.avatarUrl,
          status: 'ACCEPTED',
          requestId,
          isSender: false,
          isReceiver: true,
        });
      }
      await loadDmContacts();
    } catch (err: any) {
      console.error('Erro ao aceitar solicitação:', err);
    } finally {
      setDmActionLoading(false);
    }
  };

  const handleRejectDmRequest = async (reqId?: string) => {
    const requestId = reqId || activeDmStatus?.requestId || activeDmContact?.requestId || activeDmContact?.request?.id;
    if (!token || !requestId || dmActionLoading) return;
    setDmActionLoading(true);
    try {
      await apiFetch<any>(`/api/dms/requests/${requestId}`, token, {
        method: 'DELETE',
      });
      if (socket) {
        socket.emit('reject_dm_request', { requestId });
      }
      if (activeDmUserId) {
        removeDmContact(activeDmUserId);
      }
      await loadDmContacts();
    } catch (err: any) {
      console.error('Erro ao recusar solicitação:', err);
    } finally {
      setDmActionLoading(false);
    }
  };

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
    (viewMode === 'dms' && !!activeDmUserId && (!!activeDmUser || !!activeDmContact));

  // ── Send handlers ─────────────────────────────────────────────────────────
  const handleSend = (content: string | null, attachment: UploadedAttachment | null) => {
    if (viewMode === 'channels' && isNonMemberViewingServer) return;
    if (viewMode === 'dms' && !isDmAccepted) return;
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

    if (connectedVoice?.channelId === channelId) {
      setConnectedVoice(null);
    }
  };

  const handleChannelClick = (channel: Channel) => {
    setActiveChannelId(channel.id);
  };

  const executeDeleteMessage = async (messageId: string) => {
    if (!token || !activeChannelId) return;
    try {
      markMessageDeleted(messageId);
      setDeleteMessageTargetId(null);
      await apiFetch(`/api/channels/${activeChannelId}/messages/${messageId}`, token, {
        method: 'DELETE',
      });
    } catch (err: any) {
      console.error('Erro ao excluir mensagem:', err);
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    setDeleteMessageTargetId(messageId);
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

  // ── 6. Render Loading Screen during Bootstrap (hasAccess === null) ─────────
  if (hasAccess === null) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          display: 'flex',
          height: '100vh',
          width: '100%',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#1e1f22',
          color: '#f2f3f5',
          fontFamily: "'Inter', sans-serif",
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(255, 255, 255, 0.1)',
            borderTopColor: '#5865F2',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        <p style={{ color: '#949ba4', fontSize: '14px', margin: 0 }}>Carregando Levicord...</p>
      </div>
    );
  }

  // ── 7. Render Gatekeeper Screen if Access Denied (No Invite) ───────────────
  if (hasAccess === false) {
    return (
      <GatekeeperScreen
        gateInviteCode={gateInviteCode}
        setGateInviteCode={setGateInviteCode}
        gateLoading={gateLoading}
        gateError={gateError}
        currentUserEmail={currentUser?.email}
        onJoin={handleGateJoin}
        onLogout={logout}
      />
    );
  }

  // ── 8. Render Full Application Workspace ───────────────────────────────────
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
        dmContacts={dmContacts}
        activeDmUserId={activeDmUserId}
        onSelectDmUser={setActiveDmUserId}
        currentUser={currentUser}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onOpenLogout={() => setIsLogoutModalOpen(true)}
        activeServer={activeServer}
        onOpenInviteModal={() => setIsInviteModalOpen(true)}
        canCreateChannel={canManageChannel}
        onDeleteChannel={canManageChannel ? handleDeleteChannel : undefined}
        canDeleteServer={canDeleteServer}
        onDeleteServer={() => setIsDeleteServerModalOpen(true)}
        connectedVoice={connectedVoice}
        onReturnToVoice={handleReturnToVoice}
        onDisconnectVoice={handleDisconnectVoice}
      />

      {/* ── Main Chat / Content Area ───────────────────────────────────── */}
      <main className="chat-area" id="main-content">
        {/* Camada WebRTC Persistente em Background ou Tela Cheia */}
        {connectedVoice && (
          <div
            className="persistent-webrtc-layer"
            style={{ display: isViewingConnectedVoice ? 'flex' : 'none' }}
          >
            <WebRTCGrid
              key={connectedVoice.channelId}
              channelId={connectedVoice.channelId}
              onDisconnect={handleDisconnectVoice}
            />
          </div>
        )}

        {/* Conteúdo Normal quando não estiver na tela de chamada ativa */}
        {!isViewingConnectedVoice && (
          <>
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
                  isMembersSidebarOpen={Boolean(activeServerId) && isMembersOpen}
                  onToggleMembersSidebar={activeServerId ? () => setIsMembersOpen((o) => !o) : undefined}
                  onStartCall={activeDmUser && isDmAccepted ? (isVideo) => startCall(activeDmUser, isVideo) : undefined}
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
                    isInCall={false}
                    connectedChannelName={connectedVoice?.channelName}
                    onJoin={() => handleJoinVoice(activeChannel!)}
                    onDisconnect={handleDisconnectVoice}
                    isSuperAdmin={isSuperAdmin}
                    isServerChannel={Boolean(activeServerId)}
                    isNonMember={isNonMemberViewingServer}
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

                  {viewMode === 'dms' && !isDmAccepted ? (
                    <div className="dm-invitation-container">
                      <div className="dm-invitation-card">
                        <div className="dm-invitation-avatar-wrapper">
                          <Avatar
                            src={activeDmUser?.avatarUrl}
                            name={activeDmUser?.displayName}
                            size={80}
                          />
                          {isDmIncomingPending && (
                            <span className="dm-invitation-badge pending" title="Convite pendente">
                              <Clock size={16} />
                            </span>
                          )}
                          {isDmOutgoingPending && (
                            <span className="dm-invitation-badge pending" title="Aguardando resposta">
                              <Clock size={16} />
                            </span>
                          )}
                          {isDmNoRequest && (
                            <span className="dm-invitation-badge info" title="Nova solicitação">
                              <UserPlus size={16} />
                            </span>
                          )}
                          {isDmRejected && (
                            <span className="dm-invitation-badge danger" title="Recusada">
                              <X size={16} />
                            </span>
                          )}
                        </div>

                        <h2 className="dm-invitation-title">
                          {isDmIncomingPending && 'Solicitação de Mensagem Direta'}
                          {isDmOutgoingPending && 'Solicitação Enviada'}
                          {isDmNoRequest && 'Iniciar Conversa Direta'}
                          {isDmRejected && 'Solicitação Não Concluída'}
                        </h2>

                        <div className="dm-invitation-user">
                          @{activeDmUser?.displayName}
                        </div>

                        <p className="dm-invitation-desc">
                          {activeDmStatus?.loading ? (
                            'Verificando status da conversa...'
                          ) : isDmIncomingPending ? (
                            `@${activeDmUser?.displayName} enviou-lhe um convite para conversar. Aceite o pedido para desbloquear as mensagens privadas e chamadas.`
                          ) : isDmOutgoingPending ? (
                            `Você enviou uma solicitação de conversa para @${activeDmUser?.displayName}. Aguarde que o destinatário aceite para iniciar a comunicação.`
                          ) : isDmRejected ? (
                            `A solicitação de conversa anterior foi recusada ou cancelada. Deseja enviar um novo convite para @${activeDmUser?.displayName}?`
                          ) : (
                            `Para conversar diretamente com @${activeDmUser?.displayName}, é necessário enviar uma solicitação. O destinatário precisará aceitar o convite para liberar as mensagens.`
                          )}
                        </p>

                        <div className="dm-invitation-actions">
                          {isDmIncomingPending && (
                            <>
                              <button
                                type="button"
                                className="dm-btn-accept"
                                onClick={() => handleAcceptDmRequest()}
                                disabled={dmActionLoading}
                              >
                                <Check size={18} />
                                <span>{dmActionLoading ? 'Processando...' : 'Aceitar Solicitação'}</span>
                              </button>
                              <button
                                type="button"
                                className="dm-btn-reject"
                                onClick={() => handleRejectDmRequest()}
                                disabled={dmActionLoading}
                              >
                                <X size={18} />
                                <span>Recusar</span>
                              </button>
                            </>
                          )}

                          {isDmOutgoingPending && (
                            <button
                              type="button"
                              className="dm-btn-cancel"
                              onClick={() => handleRejectDmRequest()}
                              disabled={dmActionLoading}
                            >
                              <X size={18} />
                              <span>{dmActionLoading ? 'Cancelando...' : 'Cancelar Solicitação'}</span>
                            </button>
                          )}

                          {(isDmNoRequest || isDmRejected) && (
                            <button
                              type="button"
                              className="dm-btn-send"
                              onClick={handleSendDmRequest}
                              disabled={dmActionLoading || activeDmStatus?.loading}
                            >
                              <UserPlus size={18} />
                              <span>{dmActionLoading ? 'Enviando...' : 'Enviar Solicitação de Conversa'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
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
                    </>
                  )}
                </div>

                {viewMode === 'channels' && Boolean(activeServerId) && (
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
                ? (safeChannels.length === 0
                    ? (activeServer ? 'Nenhum canal neste servidor. Crie um canal para começar.' : 'Nenhum canal disponível.')
                    : 'Selecione um canal.')
                : (safeDmContacts.length === 0 ? 'Nenhuma conversa direta. Acesse um servidor e selecione um membro para enviar uma solicitação.' : 'Selecione uma conversa para iniciar.')}
            </p>
          </div>
        )}
          </>
        )}

        {/* Floating Mini-Dock de voz quando navegando por texto/DMs */}
        {connectedVoice && !isViewingConnectedVoice && (
          <aside className="floating-voice-minidock" aria-label="Chamada de voz ativa em segundo plano">
            <div
              className="floating-voice-info"
              onClick={handleReturnToVoice}
              title="Voltar para a chamada de voz"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleReturnToVoice();
                }
              }}
            >
              <span className="floating-voice-status-dot" aria-hidden="true" />
              <div className="floating-voice-text-col">
                <span className="floating-voice-status-title">Voz Conectada</span>
                <span className="floating-voice-channel-name">
                  {connectedVoice.channelName}
                  {connectedVoice.serverName && (
                    <span className="floating-voice-server"> ({connectedVoice.serverName})</span>
                  )}
                </span>
              </div>
              <span className="floating-voice-return-hint">Voltar ↗</span>
            </div>
            <button
              type="button"
              className="floating-voice-disconnect-btn"
              onClick={handleDisconnectVoice}
              title="Desconectar da chamada"
              aria-label="Desconectar da chamada"
            >
              <PhoneOff size={16} />
            </button>
          </aside>
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
        onServerDeleted={handleDeleteServer}
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

      <ConfirmModal
        isOpen={Boolean(deleteMessageTargetId)}
        title="Excluir Mensagem"
        message="Tem certeza que deseja excluir esta mensagem? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        onClose={() => setDeleteMessageTargetId(null)}
        onConfirm={() => {
          if (deleteMessageTargetId) executeDeleteMessage(deleteMessageTargetId);
        }}
      />

      <ConfirmModal
        isOpen={isDeleteServerModalOpen}
        title="Excluir Servidor"
        message={`Tem certeza que deseja excluir o servidor "${activeServer?.name ?? ''}"? Todos os canais, mensagens e registros deste servidor serão permanentemente excluídos. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir Servidor"
        cancelLabel="Cancelar"
        danger
        onClose={() => setIsDeleteServerModalOpen(false)}
        onConfirm={() => handleDeleteServer()}
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

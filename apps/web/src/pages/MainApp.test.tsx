import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MainApp from './MainApp';
import * as apiModule from '../lib/api';
import * as useAuthModule from '../hooks/useAuth';
import * as useSocketModule from '../hooks/useSocket';
import { useChatStore } from '../stores/useChatStore';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE: 'http://localhost:3000',
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../hooks/useSocket', () => ({
  useSocket: vi.fn(),
}));

vi.mock('../hooks/useDmCall', () => ({
  useDmCall: () => ({
    activeDmCall: null,
    incomingCall: null,
    startCall: vi.fn(),
    acceptCall: vi.fn(),
    rejectCall: vi.fn(),
    endCall: vi.fn(),
  }),
}));

vi.mock('../hooks/useChannelMessages', () => ({
  useChannelMessages: () => ({
    messages: [],
    loading: false,
    hasMore: false,
    loadMore: vi.fn(),
  }),
}));

vi.mock('../hooks/useDmMessages', () => ({
  useDmMessages: () => ({
    messages: [],
    loading: false,
    hasMore: false,
    loadMore: vi.fn(),
  }),
}));

vi.mock('../hooks/useTypingIndicator', () => ({
  useTypingIndicator: () => [],
}));

describe('MainApp Component', () => {
  const mockLogout = vi.fn();

  const mockUser = {
    id: 'user-1',
    email: 'user1@test.com',
    displayName: 'User One',
    avatarUrl: null,
    role: 'USER' as const,
  };

  const mockServer = {
    id: 'srv-1',
    name: 'Servidor Principal',
    ownerId: 'user-1',
    defaultChannelId: 'chan-1',
    channels: [
      { id: 'chan-1', name: 'geral', type: 'TEXT' as const, isPrivate: false, serverId: 'srv-1' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();

    vi.mocked(useAuthModule.useAuth).mockReturnValue({
      token: 'jwt-token-123',
      isLoading: false,
      loginWithGoogle: vi.fn(),
      logout: mockLogout,
    });

    vi.mocked(useSocketModule.useSocket).mockReturnValue({
      socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn(), id: 'sock-1' } as any,
      joinChannel: vi.fn(),
      sendMessage: vi.fn(),
      sendDm: vi.fn(),
      sendTypingStart: vi.fn(),
      sendTypingStop: vi.fn(),
    });

    useChatStore.setState({
      viewMode: 'channels',
      servers: [mockServer],
      activeServerId: 'srv-1',
      activeServer: mockServer,
      channels: mockServer.channels,
      activeChannelId: 'chan-1',
      users: [],
      activeDmUserId: null,
      currentUser: mockUser,
      onlineUserIds: [],
      messages: [],
      dms: {},
      dmsOrder: [],
      activeDmCall: null,
    });
  });

  it('renders loading status while access verification is in progress', () => {
    // Keep access verification promise unresolved
    vi.mocked(apiModule.apiFetch).mockReturnValue(new Promise(() => {}));

    render(<MainApp />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Carregando Levicord...')).toBeInTheDocument();
  });

  it('renders GatekeeperScreen when user has no access (hasAccess === false)', async () => {
    vi.mocked(apiModule.apiFetch).mockImplementation((async (url: string) => {
      if (url === '/api/auth/me') return mockUser;
      if (url === '/api/servers/access-status') return { hasAccess: false };
      return [];
    }) as any);

    render(<MainApp />);

    await waitFor(() => {
      expect(screen.getByText(/Acesso Restrito por Convite/i)).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText(/Ex: d4f89a1c ou link de convite/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Validar Convite e Entrar/i })).toBeInTheDocument();
  });

  it('renders main layout (channels, headers, sidebar) when user has access', async () => {
    vi.mocked(apiModule.apiFetch).mockImplementation((async (url: string) => {
      if (url === '/api/auth/me') return mockUser;
      if (url === '/api/servers/access-status') return { hasAccess: true };
      if (url === '/api/servers') return [mockServer];
      if (url.startsWith('/api/servers/srv-1')) return mockServer;
      if (url.startsWith('/api/channels')) return mockServer.channels;
      if (url.startsWith('/api/users')) return [];
      return [];
    }) as any);

    render(<MainApp />);

    expect(await screen.findByText('Servidor Principal')).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /geral/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'geral' })).toBeInTheDocument();
    expect(screen.queryByText(/Acesso Restrito por Convite/i)).not.toBeInTheDocument();
  });
});

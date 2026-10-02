import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MembersSidebar } from './MembersSidebar';
import * as apiModule from '../lib/api';
import type { User, ServerMember } from '@discord-clone/shared';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE: 'http://localhost:3000',
}));

describe('MembersSidebar', () => {
  const currentUser: User = {
    id: 'user-me',
    displayName: 'Eu Próprio',
    email: 'me@example.com',
  };

  const users: User[] = [
    { id: 'user-1', displayName: 'Ana Silva' },
    { id: 'user-2', displayName: 'Bruno Costa' },
  ];

  const serverMembers: Array<ServerMember & { user?: User }> = [
    {
      id: 'sm-me',
      serverId: 'srv-1',
      userId: 'user-me',
      role: 'OWNER',
      canInvite: true,
      mutedUntil: null,
      createdAt: new Date().toISOString(),
      user: currentUser,
    },
    {
      id: 'sm-1',
      serverId: 'srv-1',
      userId: 'user-1',
      role: 'ADMIN',
      canInvite: true,
      mutedUntil: null,
      createdAt: new Date().toISOString(),
      user: users[0],
    },
    {
      id: 'sm-2',
      serverId: 'srv-1',
      userId: 'user-2',
      role: 'MEMBER',
      canInvite: false,
      mutedUntil: null,
      createdAt: new Date().toISOString(),
      user: users[1],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <MembersSidebar
        users={users}
        currentUser={currentUser}
        onlineUserIds={[]}
        isOpen={false}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders online and offline sections with correct counts and names', () => {
    render(
      <MembersSidebar
        users={users}
        currentUser={currentUser}
        onlineUserIds={['user-1']}
        isOpen={true}
      />
    );

    expect(screen.getByText('Disponível — 2')).toBeInTheDocument(); // currentUser + Ana Silva
    expect(screen.getByText('Offline — 1')).toBeInTheDocument(); // Bruno Costa
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Bruno Costa')).toBeInTheDocument();
    expect(screen.getByText('(você)')).toBeInTheDocument();
  });

  it('calls onSelectUser when a member is clicked in direct message mode', () => {
    const onSelectUser = vi.fn();
    render(
      <MembersSidebar
        users={users}
        currentUser={currentUser}
        onlineUserIds={['user-1']}
        isOpen={true}
        onSelectUser={onSelectUser}
      />
    );

    fireEvent.click(screen.getByText('Ana Silva'));
    expect(onSelectUser).toHaveBeenCalledWith('user-1');
  });

  it('renders server member badges for OWNER and ADMIN', () => {
    render(
      <MembersSidebar
        users={users}
        currentUser={currentUser}
        onlineUserIds={['user-me', 'user-1', 'user-2']}
        isOpen={true}
        serverId="srv-1"
        serverMembers={serverMembers}
        currentUserRole="OWNER"
      />
    );

    expect(screen.getByTitle('Dono do Servidor')).toBeInTheDocument();
    expect(screen.getByTitle('Administrador do Servidor')).toBeInTheDocument();
    expect(screen.getByText('Sem convite')).toBeInTheDocument();
  });

  it('allows owner to kick a member with confirmation dialog', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce({ success: true });
    const mockSuccess = vi.fn();

    render(
      <MembersSidebar
        users={users}
        currentUser={currentUser}
        onlineUserIds={['user-me', 'user-1', 'user-2']}
        isOpen={true}
        serverId="srv-1"
        serverMembers={serverMembers}
        currentUserRole="OWNER"
        onMemberActionSuccess={mockSuccess}
      />
    );

    // Click member row to open moderation popover
    fireEvent.click(screen.getByText('Bruno Costa'));

    expect(screen.getByText('Moderar Bruno Costa')).toBeInTheDocument();
    const kickActionBtn = screen.getByRole('button', { name: /Expulsar do Servidor/i });
    fireEvent.click(kickActionBtn);

    // ConfirmModal appears
    expect(screen.getByText('Expulsar Membro')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: 'Expulsar' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        '/api/servers/srv-1/members/user-2/kick',
        null,
        expect.objectContaining({ method: 'POST' })
      );
      expect(mockSuccess).toHaveBeenCalled();
    });
  });
});

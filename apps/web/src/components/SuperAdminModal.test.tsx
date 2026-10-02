import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SuperAdminModal } from './SuperAdminModal';
import * as apiModule from '../lib/api';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE: 'http://localhost:3000',
}));

describe('SuperAdminModal', () => {
  const mockOnClose = vi.fn();
  const rootCurrentUser = {
    id: 'user-root',
    email: 'joaoprf2001@gmail.com',
    displayName: 'João Root',
    avatarUrl: null,
    role: 'SUPERADMIN' as const,
    createdAt: new Date().toISOString(),
  };

  const initialSuperAdmins = [
    {
      id: 'user-root',
      email: 'joaoprf2001@gmail.com',
      displayName: 'João Root',
      avatarUrl: null,
      role: 'SUPERADMIN' as const,
      isRoot: true,
      promotedById: null,
    },
    {
      id: 'user-secondary',
      email: 'sec@test.com',
      displayName: 'Sec Admin',
      avatarUrl: null,
      role: 'SUPERADMIN' as const,
      isRoot: false,
      promotedById: 'user-root',
      promotedBy: { id: 'user-root', displayName: 'João Root', email: 'joaoprf2001@gmail.com' },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <SuperAdminModal
        isOpen={false}
        onClose={mockOnClose}
        currentUser={rootCurrentUser}
        token="token-123"
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('loads and renders superadmins list and root badge when isOpen is true', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(initialSuperAdmins);

    render(
      <SuperAdminModal
        isOpen={true}
        onClose={mockOnClose}
        currentUser={rootCurrentUser}
        token="token-123"
      />
    );

    expect(screen.getByText('Gestão Global de SuperAdmins')).toBeInTheDocument();
    expect(screen.getByText('Carregando lista...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('João Root').length).toBeGreaterThan(0);
      expect(screen.getByText('Sec Admin')).toBeInTheDocument();
    });

    expect(screen.getByText('Root (Irrevogável)')).toBeInTheDocument();
    expect(screen.getByText('Conta mestre do sistema')).toBeInTheDocument();
    expect(screen.getByText(/Promovido por:/)).toBeInTheDocument();
  });

  it('allows searching users to promote and promoting an eligible user', async () => {
    vi.mocked(apiModule.apiFetch)
      .mockResolvedValueOnce(initialSuperAdmins) // load initial list
      .mockResolvedValueOnce([
        {
          id: 'candidate-1',
          email: 'candidate@test.com',
          displayName: 'Candidate One',
          role: 'USER',
        },
      ]) // search users
      .mockResolvedValueOnce({ success: true }) // promote
      .mockResolvedValueOnce(initialSuperAdmins); // reload list

    render(
      <SuperAdminModal
        isOpen={true}
        onClose={mockOnClose}
        currentUser={rootCurrentUser}
        token="token-123"
      />
    );

    await waitFor(() => expect(screen.getAllByText('João Root').length).toBeGreaterThan(0));

    const searchInput = screen.getByPlaceholderText(/Buscar usuário por nome ou email/i);
    fireEvent.change(searchInput, { target: { value: 'candidate' } });

    await waitFor(() => {
      expect(screen.getByText('Candidate One')).toBeInTheDocument();
    });

    const promoteBtn = screen.getByRole('button', { name: 'Promover' });
    fireEvent.click(promoteBtn);

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        '/api/admin/superadmins',
        null,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ targetUserId: 'candidate-1' }),
        })
      );
    });
  });

  it('allows root superadmin to demote a non-root superadmin', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    vi.mocked(apiModule.apiFetch)
      .mockResolvedValueOnce(initialSuperAdmins) // load list
      .mockResolvedValueOnce({ success: true }) // demote
      .mockResolvedValueOnce([initialSuperAdmins[0]]); // reload list

    render(
      <SuperAdminModal
        isOpen={true}
        onClose={mockOnClose}
        currentUser={rootCurrentUser}
        token="token-123"
      />
    );

    await waitFor(() => expect(screen.getByText('Sec Admin')).toBeInTheDocument());

    const removeBtn = screen.getByRole('button', { name: /Remover/i });
    fireEvent.click(removeBtn);

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        '/api/admin/superadmins/user-secondary',
        null,
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  it('calls onClose when close button is clicked', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(initialSuperAdmins);

    render(
      <SuperAdminModal
        isOpen={true}
        onClose={mockOnClose}
        currentUser={rootCurrentUser}
        token="token-123"
      />
    );

    await waitFor(() => expect(screen.getAllByText('João Root').length).toBeGreaterThan(0));

    const closeBtn = screen.getByLabelText('Fechar');
    fireEvent.click(closeBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});

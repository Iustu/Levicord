import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditProfileModal } from './EditProfileModal';
import * as apiModule from '../lib/api';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE: 'http://localhost:3000',
}));

describe('EditProfileModal Component', () => {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  const mockUser = {
    id: 'u-1',
    email: 'user@test.com',
    displayName: 'Original Name',
    avatarUrl: null,
    role: 'USER' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <EditProfileModal
        isOpen={false}
        onClose={onClose}
        currentUser={mockUser}
        token="token-123"
        onSaved={onSaved}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('disables submit button and shows error if form submitted with short displayName', async () => {
    const { container } = render(
      <EditProfileModal
        isOpen={true}
        onClose={onClose}
        currentUser={mockUser}
        token="token-123"
        onSaved={onSaved}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Digite seu nome\.\.\./i), {
      target: { value: 'a' },
    });

    const submitBtn = screen.getByRole('button', { name: /Salvar Alterações/i });
    expect(submitBtn).toBeDisabled();

    fireEvent.submit(container.querySelector('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('O nome de exibição deve ter pelo menos 2 caracteres.');
    expect(apiModule.apiFetch).not.toHaveBeenCalled();
  });

  it('saves updated profile successfully', async () => {
    const updatedUser = { ...mockUser, displayName: 'Novo Nome' };
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(updatedUser);

    render(
      <EditProfileModal
        isOpen={true}
        onClose={onClose}
        currentUser={mockUser}
        token="token-123"
        onSaved={onSaved}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Digite seu nome\.\.\./i), {
      target: { value: 'Novo Nome' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Salvar Alterações/i }));

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        '/api/auth/profile',
        'token-123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ displayName: 'Novo Nome', avatarUrl: null }),
        })
      );
      expect(onSaved).toHaveBeenCalledWith(updatedUser);
      expect(onClose).toHaveBeenCalled();
    });
  });
});

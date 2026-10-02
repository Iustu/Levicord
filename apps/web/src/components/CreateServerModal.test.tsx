import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateServerModal } from './CreateServerModal';
import * as apiModule from '../lib/api';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE: 'http://localhost:3000',
}));

describe('CreateServerModal Component', () => {
  const onClose = vi.fn();
  const onServerCreated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <CreateServerModal isOpen={false} onClose={onClose} onServerCreated={onServerCreated} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('disables submit button and shows error if form submitted when name is empty', async () => {
    const { container } = render(
      <CreateServerModal isOpen={true} onClose={onClose} onServerCreated={onServerCreated} />
    );

    const submitBtn = screen.getByRole('button', { name: /Criar Servidor/i });
    expect(submitBtn).toBeDisabled();

    fireEvent.submit(container.querySelector('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('O nome do servidor é obrigatório.');
    expect(apiModule.apiFetch).not.toHaveBeenCalled();
  });

  it('submits server creation and calls onServerCreated and onClose on success', async () => {
    const mockCreatedServer = {
      id: 'srv-new',
      name: 'Comunidade Gamer',
      description: 'Jogos e papo',
      ownerId: 'user-1',
      defaultChannelId: 'chan-1',
    };
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(mockCreatedServer);

    render(
      <CreateServerModal isOpen={true} onClose={onClose} onServerCreated={onServerCreated} />
    );

    fireEvent.change(screen.getByPlaceholderText(/Ex: Levicord HQ/i), {
      target: { value: 'Comunidade Gamer' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Sobre o que é este servidor\?/i), {
      target: { value: 'Jogos e papo' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Criar Servidor/i }));

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith('/api/servers', null, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Comunidade Gamer',
          description: 'Jogos e papo',
          iconUrl: undefined,
        }),
      });
      expect(onServerCreated).toHaveBeenCalledWith(mockCreatedServer);
      expect(onClose).toHaveBeenCalled();
    });
  });
});

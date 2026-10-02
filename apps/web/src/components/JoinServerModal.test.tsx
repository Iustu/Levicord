import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JoinServerModal } from './JoinServerModal';
import * as apiModule from '../lib/api';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE: 'http://localhost:3000',
}));

describe('JoinServerModal Component', () => {
  const onClose = vi.fn();
  const onServerJoined = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <JoinServerModal isOpen={false} onClose={onClose} onServerJoined={onServerJoined} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('disables submit button and shows error if form submitted when code is empty', async () => {
    const { container } = render(
      <JoinServerModal isOpen={true} onClose={onClose} onServerJoined={onServerJoined} />
    );

    const submitBtn = screen.getByRole('button', { name: /Entrar no Servidor/i });
    expect(submitBtn).toBeDisabled();

    fireEvent.submit(container.querySelector('form')!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Insira um código de convite válido.');
    expect(apiModule.apiFetch).not.toHaveBeenCalled();
  });

  it('joins server successfully and invokes onServerJoined', async () => {
    const mockServer = { id: 'srv-1', name: 'Servidor Entrado', ownerId: 'u-1' };
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce({ server: mockServer });

    render(
      <JoinServerModal isOpen={true} onClose={onClose} onServerJoined={onServerJoined} />
    );

    fireEvent.change(screen.getByPlaceholderText(/Ex: a1b2c3d4/i), {
      target: { value: 'https://levicord.com/join/d4f89a1c' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Entrar no Servidor/i }));

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith('/api/servers/join/d4f89a1c', null, {
        method: 'POST',
      });
      expect(onServerJoined).toHaveBeenCalledWith(mockServer);
      expect(onClose).toHaveBeenCalled();
    });
  });
});

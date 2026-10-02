import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateChannelModal } from './CreateChannelModal';

describe('CreateChannelModal Component', () => {
  const onClose = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <CreateChannelModal isOpen={false} onClose={onClose} onSubmit={onSubmit} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('validates channel name minimum length', async () => {
    render(
      <CreateChannelModal isOpen={true} onClose={onClose} onSubmit={onSubmit} />
    );

    fireEvent.change(screen.getByPlaceholderText(/novo-canal/i), {
      target: { value: 'a' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^Criar Canal$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('O nome precisa ter pelo menos 2 caracteres.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid channel with selected type and description', async () => {
    render(
      <CreateChannelModal isOpen={true} onClose={onClose} onSubmit={onSubmit} />
    );

    fireEvent.change(screen.getByPlaceholderText(/novo-canal/i), {
      target: { value: 'bate-papo' },
    });
    fireEvent.change(screen.getByPlaceholderText(/De que se trata este canal\?/i), {
      target: { value: 'Conversas gerais' },
    });

    // Select VOICE type
    fireEvent.click(screen.getByText('Voz'));

    fireEvent.click(screen.getByRole('button', { name: /^Criar Canal$/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('bate-papo', 'Conversas gerais', 'VOICE');
    });
  });

  it('invokes onClose when clicking Cancelar', () => {
    render(
      <CreateChannelModal isOpen={true} onClose={onClose} onSubmit={onSubmit} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

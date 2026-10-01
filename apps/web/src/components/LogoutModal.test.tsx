import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LogoutModal } from './LogoutModal';

describe('LogoutModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <LogoutModal isOpen={false} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title and confirmation prompt when open', () => {
    render(<LogoutModal isOpen={true} onClose={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Encerrar Sessão')).toBeInTheDocument();
    expect(screen.getByText(/Tem a certeza de que pretende sair da sua conta\?/)).toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<LogoutModal isOpen={true} onClose={onClose} onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm and onClose when Sair button is clicked', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<LogoutModal isOpen={true} onClose={onClose} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key press', () => {
    const onClose = vi.fn();
    render(<LogoutModal isOpen={true} onClose={onClose} onConfirm={vi.fn()} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

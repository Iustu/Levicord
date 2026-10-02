import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmModal } from './ConfirmModal';

describe('ConfirmModal', () => {
  it('does not render when isOpen is false', () => {
    render(
      <ConfirmModal
        isOpen={false}
        title="Confirm action"
        message="Are you sure?"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders modal dialog when isOpen is true', () => {
    render(
      <ConfirmModal
        isOpen={true}
        title="Excluir Mensagem"
        message="Tem certeza que deseja excluir esta mensagem?"
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Excluir Mensagem')).toBeInTheDocument();
    expect(screen.getByText('Tem certeza que deseja excluir esta mensagem?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        title="Confirmar"
        message="Deseja continuar?"
        onClose={handleClose}
        onConfirm={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm and onClose when confirm button is clicked', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        title="Confirmar"
        message="Deseja continuar?"
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape key press', () => {
    const handleClose = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        title="Confirmar"
        message="Deseja continuar?"
        onClose={handleClose}
        onConfirm={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

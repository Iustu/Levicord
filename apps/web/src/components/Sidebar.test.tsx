import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import type { Channel, Server, User } from '@discord-clone/shared';

describe('Sidebar', () => {
  const currentUser: User = {
    id: 'user-me',
    displayName: 'Test User',
    email: 'test@example.com',
  };

  const sampleChannels: Channel[] = [
    { id: 'ch-1', name: 'geral', type: 'TEXT', order: 0, isPrivate: false },
    { id: 'ch-2', name: 'voz', type: 'VOICE', order: 1, isPrivate: false },
  ];

  const sampleServer: Server = {
    id: 'srv-1',
    name: 'Dev Community',
    ownerId: 'user-me',
    createdAt: new Date().toISOString(),
  };

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    viewMode: 'channels' as const,
    onViewModeChange: vi.fn(),
    channels: sampleChannels,
    activeChannelId: 'ch-1',
    onSelectChannel: vi.fn(),
    onOpenCreateChannel: vi.fn(),
    onEditChannel: vi.fn(),
    channelsError: null,
    onRetryChannels: vi.fn(),
    users: [],
    activeDmUserId: null,
    onSelectDmUser: vi.fn(),
    currentUser,
    onOpenProfile: vi.fn(),
    onOpenLogout: vi.fn(),
  };

  it('renders view toggle with Canais Globais and Mensagens Diretas when at Home (no activeServer)', () => {
    render(<Sidebar {...defaultProps} activeServer={null} />);

    expect(screen.getByText('Canais Globais')).toBeInTheDocument();
    expect(screen.getByText('Mensagens Diretas')).toBeInTheDocument();
    expect(screen.getByText('CANAIS GLOBAIS')).toBeInTheDocument();
  });

  it('does NOT render view toggle or Mensagens Diretas inside a server', () => {
    render(<Sidebar {...defaultProps} activeServer={sampleServer} />);

    expect(screen.queryByText('Mensagens Diretas')).not.toBeInTheDocument();
    expect(screen.queryByText('Canais Globais')).not.toBeInTheDocument();
    expect(screen.getByText('CANAIS DO SERVIDOR')).toBeInTheDocument();
    expect(screen.getByText('Dev Community')).toBeInTheDocument();
  });

  it('switches viewMode when view toggle button is clicked at Home', () => {
    const onViewModeChange = vi.fn();
    render(<Sidebar {...defaultProps} activeServer={null} onViewModeChange={onViewModeChange} />);

    fireEvent.click(screen.getByText('Mensagens Diretas'));
    expect(onViewModeChange).toHaveBeenCalledWith('dms');
  });

  it('renders delete channel button and triggers onDeleteChannel upon confirmation', () => {
    const onDeleteChannel = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <Sidebar
        {...defaultProps}
        canCreateChannel={true}
        onDeleteChannel={onDeleteChannel}
      />
    );

    const deleteBtn = screen.getByLabelText('Excluir canal geral');
    expect(deleteBtn).toBeInTheDocument();

    fireEvent.click(deleteBtn);
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('geral'));
    expect(onDeleteChannel).toHaveBeenCalledWith('ch-1');

    confirmSpy.mockRestore();
  });

  it('does not trigger onDeleteChannel if confirmation is rejected', () => {
    const onDeleteChannel = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <Sidebar
        {...defaultProps}
        canCreateChannel={true}
        onDeleteChannel={onDeleteChannel}
      />
    );

    const deleteBtn = screen.getByLabelText('Excluir canal voz');
    fireEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalled();
    expect(onDeleteChannel).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('does NOT render create channel button, edit button, or delete button when canCreateChannel is false', () => {
    const onDeleteChannel = vi.fn();
    render(
      <Sidebar
        {...defaultProps}
        canCreateChannel={false}
        onDeleteChannel={onDeleteChannel}
      />
    );

    expect(screen.queryByLabelText('Criar novo canal')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Editar canal geral')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Excluir canal geral')).not.toBeInTheDocument();
  });

  it('renders create channel button and edit/delete actions when canCreateChannel is true', () => {
    const onDeleteChannel = vi.fn();
    render(
      <Sidebar
        {...defaultProps}
        canCreateChannel={true}
        onDeleteChannel={onDeleteChannel}
      />
    );

    expect(screen.getByLabelText('Criar novo canal')).toBeInTheDocument();
    expect(screen.getByLabelText('Editar canal geral')).toBeInTheDocument();
    expect(screen.getByLabelText('Excluir canal geral')).toBeInTheDocument();
  });
});


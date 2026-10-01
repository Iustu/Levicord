import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { MessageList } from './MessageList';
import type { Message } from '@discord-clone/shared';

describe('MessageList Component', () => {
  const author1 = { id: 'u1', displayName: 'Carlos' };
  const author2 = { id: 'u2', displayName: 'Diana' };

  it('renders empty message prompt when message array is empty in channels mode', () => {
    render(
      <MessageList
        messages={[]}
        viewMode="channels"
        activeChannelName="anuncios"
        isLoading={false}
        isLoadingOlder={false}
        fetchError={null}
        nextCursor={null}
        onLoadOlder={vi.fn()}
        onRetry={vi.fn()}
        messagesEndRef={createRef()}
        messagesListRef={createRef()}
      />,
    );

    expect(screen.getByText('Bem-vindo ao #anuncios!')).toBeInTheDocument();
  });

  it('renders messages and date separators between different days', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        channelId: 'c1',
        content: 'Primeira mensagem no dia 1',
        createdAt: '2026-09-01T10:00:00.000Z',
        author: author1,
      },
      {
        id: 'msg-2',
        channelId: 'c1',
        content: 'Segunda mensagem no dia 2',
        createdAt: '2026-09-02T10:00:00.000Z',
        author: author2,
      },
    ];

    render(
      <MessageList
        messages={messages}
        viewMode="channels"
        activeChannelName="geral"
        isLoading={false}
        isLoadingOlder={false}
        fetchError={null}
        nextCursor={null}
        onLoadOlder={vi.fn()}
        onRetry={vi.fn()}
        messagesEndRef={createRef()}
        messagesListRef={createRef()}
      />,
    );

    expect(screen.getByText('Primeira mensagem no dia 1')).toBeInTheDocument();
    expect(screen.getByText('Segunda mensagem no dia 2')).toBeInTheDocument();
    const separators = screen.getAllByRole('separator');
    expect(separators.length).toBe(2);
  });

  it('allows reacting with emoji on message item', () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        channelId: 'c1',
        content: 'Mensagem com reações',
        createdAt: '2026-10-01T12:00:00.000Z',
        author: author1,
      },
    ];

    render(
      <MessageList
        messages={messages}
        viewMode="channels"
        activeChannelName="geral"
        isLoading={false}
        isLoadingOlder={false}
        fetchError={null}
        nextCursor={null}
        onLoadOlder={vi.fn()}
        onRetry={vi.fn()}
        messagesEndRef={createRef()}
        messagesListRef={createRef()}
      />,
    );

    const reactThumbBtn = screen.getByTitle('Reagir com 👍');
    fireEvent.click(reactThumbBtn);

    const reactionBadge = screen.getByTitle('Reagido com 👍');
    expect(reactionBadge).toBeInTheDocument();
    expect(reactionBadge).toHaveTextContent('👍1');
  });
});

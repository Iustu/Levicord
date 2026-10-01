import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchResultsOverlay } from './SearchResultsOverlay';
import type { Message } from '@discord-clone/shared';

describe('SearchResultsOverlay', () => {
  it('renders nothing when searchResults is null', () => {
    const { container } = render(
      <SearchResultsOverlay
        searchResults={null}
        searchQuery=""
        isSearching={false}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders searching indicator while loading', () => {
    render(
      <SearchResultsOverlay
        searchResults={[]}
        searchQuery="ola"
        isSearching={true}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Buscando...')).toBeInTheDocument();
  });

  it('renders empty message when no results found', () => {
    render(
      <SearchResultsOverlay
        searchResults={[]}
        searchQuery="inexistente"
        isSearching={false}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Nenhuma mensagem encontrada.')).toBeInTheDocument();
  });

  it('renders message list and triggers onClose when close button clicked', () => {
    const onClose = vi.fn();
    const mockMessages: Message[] = [
      {
        id: 'msg-1',
        content: 'Resultado encontrado',
        createdAt: '2026-10-01T12:00:00Z',
        channelId: 'ch-1',
        author: { id: 'u-1', displayName: 'Bob', avatarUrl: null },
      },
    ];

    render(
      <SearchResultsOverlay
        searchResults={mockMessages}
        searchQuery="encontrado"
        isSearching={false}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('1 resultado para "encontrado"')).toBeInTheDocument();
    expect(screen.getByText('Resultado encontrado')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

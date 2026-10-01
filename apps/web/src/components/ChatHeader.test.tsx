import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatHeader } from './ChatHeader';

describe('ChatHeader', () => {
  it('renders channel breadcrumbs, channel name and description in channel mode', () => {
    render(
      <ChatHeader
        viewMode="channels"
        isVoiceChannel={false}
        channelName="geral"
        channelDescription="Canal de bate-papo geral"
        onToggleSidebar={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        onClearSearch={vi.fn()}
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Canais');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('geral');
    expect(screen.getByText('Canal de bate-papo geral')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Buscar mensagens...')).toBeInTheDocument();
  });

  it('renders DM breadcrumbs and recipient name in dms mode', () => {
    render(
      <ChatHeader
        viewMode="dms"
        isVoiceChannel={false}
        dmDisplayName="Alice"
        onToggleSidebar={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        onClearSearch={vi.fn()}
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Mensagens Diretas');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Alice');
    expect(screen.queryByPlaceholderText('Buscar mensagens...')).not.toBeInTheDocument();
  });

  it('triggers onSearchChange when typing in the search input', () => {
    const onSearchChange = vi.fn();
    render(
      <ChatHeader
        viewMode="channels"
        isVoiceChannel={false}
        channelName="geral"
        onToggleSidebar={vi.fn()}
        searchQuery=""
        onSearchChange={onSearchChange}
        onClearSearch={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText('Buscar mensagens...');
    fireEvent.change(input, { target: { value: 'teste' } });
    expect(onSearchChange).toHaveBeenCalledWith('teste');
  });

  it('triggers onClearSearch when clear button is clicked', () => {
    const onClearSearch = vi.fn();
    render(
      <ChatHeader
        viewMode="channels"
        isVoiceChannel={false}
        channelName="geral"
        onToggleSidebar={vi.fn()}
        searchQuery="busca"
        onSearchChange={vi.fn()}
        onClearSearch={onClearSearch}
      />,
    );

    const clearBtn = screen.getByRole('button', { name: 'Limpar busca' });
    fireEvent.click(clearBtn);
    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });
});

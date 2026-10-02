import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ServerInviteModal } from './ServerInviteModal';
import * as apiModule from '../lib/api';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}));

describe('ServerInviteModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders direct invite link and invite code when invite is loaded', async () => {
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce({
      id: 'inv-1',
      code: 'testcode123',
      serverId: 'srv-1',
      createdById: 'usr-1',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    render(
      <ServerInviteModal
        isOpen={true}
        onClose={vi.fn()}
        serverId="srv-1"
        serverName="Comunidade Teste"
      />
    );

    expect(screen.getByText('Gerando convite...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('LINK DE CONVITE DIRETO')).toBeInTheDocument();
    });

    expect(screen.getByText('CÓDIGO DE CONVITE')).toBeInTheDocument();
    expect(screen.getByDisplayValue(`${window.location.origin}/join/testcode123`)).toBeInTheDocument();
    expect(screen.getByDisplayValue('testcode123')).toBeInTheDocument();
    expect(screen.getByText('Copiar Link')).toBeInTheDocument();
    expect(screen.getByText('Copiar Código')).toBeInTheDocument();
  });

  it('copies link when Copiar Link button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce({
      id: 'inv-1',
      code: 'testcode123',
      serverId: 'srv-1',
      createdById: 'usr-1',
    });

    render(
      <ServerInviteModal
        isOpen={true}
        onClose={vi.fn()}
        serverId="srv-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Copiar Link')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Copiar Link'));
    expect(writeTextMock).toHaveBeenCalledWith(`${window.location.origin}/join/testcode123`);
  });

  it('allows configuring maximum uses and regenerating the invite', async () => {
    vi.mocked(apiModule.apiFetch)
      .mockResolvedValueOnce({
        id: 'inv-1',
        code: 'default123',
        serverId: 'srv-1',
        createdById: 'usr-1',
        maxUses: null,
      })
      .mockResolvedValueOnce({
        id: 'inv-2',
        code: 'custom5uses',
        serverId: 'srv-1',
        createdById: 'usr-1',
        maxUses: 5,
      });

    render(
      <ServerInviteModal
        isOpen={true}
        onClose={vi.fn()}
        serverId="srv-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('CÓDIGO DE CONVITE')).toBeInTheDocument();
    });

    // Toggle settings
    const toggleBtn = screen.getByText('Configurar quantidade de usos e validade');
    fireEvent.click(toggleBtn);

    // Select max uses: 5
    const maxUsesSelect = screen.getByLabelText('NÚMERO MÁXIMO DE USOS');
    fireEvent.change(maxUsesSelect, { target: { value: '5' } });

    // Submit new invite generation
    const generateBtn = screen.getByText('Gerar Novo Convite');
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith(
        '/api/servers/srv-1/invites',
        null,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ maxUses: 5, expiresInHours: 24 }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('custom5uses')).toBeInTheDocument();
      expect(screen.getByText('🎯 Usos: Máx. 5')).toBeInTheDocument();
    });
  });
});

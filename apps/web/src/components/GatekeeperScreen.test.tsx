import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GatekeeperScreen } from './GatekeeperScreen';

describe('GatekeeperScreen', () => {
  it('renders title, input and action buttons', () => {
    render(
      <GatekeeperScreen
        gateInviteCode=""
        setGateInviteCode={vi.fn()}
        gateLoading={false}
        gateError={null}
        currentUserEmail="user@test.com"
        onJoin={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    expect(screen.getByText('Acesso Restrito por Convite')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex: d4f89a1c ou link de convite')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Validar Convite e Entrar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sair da Conta Google/i })).toBeInTheDocument();
  });

  it('displays gate error when provided', () => {
    render(
      <GatekeeperScreen
        gateInviteCode=""
        setGateInviteCode={vi.fn()}
        gateLoading={false}
        gateError="Código de convite expirado ou inválido"
        currentUserEmail="user@test.com"
        onJoin={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    expect(screen.getByText('Código de convite expirado ou inválido')).toBeInTheDocument();
  });

  it('shows loading indicator and disables submit button when gateLoading is true', () => {
    render(
      <GatekeeperScreen
        gateInviteCode="convite-1"
        setGateInviteCode={vi.fn()}
        gateLoading={true}
        gateError={null}
        currentUserEmail="user@test.com"
        onJoin={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Validando convite.../i });
    expect(submitBtn).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();
  });

  it('triggers onJoin on form submit and onLogout on logout button click', () => {
    const handleJoin = vi.fn((e) => e.preventDefault());
    const handleLogout = vi.fn();

    render(
      <GatekeeperScreen
        gateInviteCode="test-code"
        setGateInviteCode={vi.fn()}
        gateLoading={false}
        gateError={null}
        currentUserEmail="user@test.com"
        onJoin={handleJoin}
        onLogout={handleLogout}
      />
    );

    fireEvent.submit(screen.getByRole('button', { name: /Validar Convite e Entrar/i }));
    expect(handleJoin).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Sair da Conta Google/i }));
    expect(handleLogout).toHaveBeenCalledTimes(1);
  });
});

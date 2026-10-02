import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ServerRail } from './ServerRail';
import type { Server, User } from '@discord-clone/shared';

describe('ServerRail', () => {
  const regularUser: User = {
    id: 'user-regular',
    displayName: 'Regular User',
    email: 'regular@example.com',
    role: 'USER',
  };

  const adminUser: User = {
    id: 'user-admin',
    displayName: 'Admin User',
    email: 'admin@example.com',
    role: 'ADMIN',
  };

  const superAdminUser: User = {
    id: 'user-super',
    displayName: 'Super Admin User',
    email: 'super@example.com',
    role: 'SUPERADMIN',
  };

  const rootSuperAdminUser: User = {
    id: 'user-root',
    displayName: 'Root SuperAdmin',
    email: 'joaoprf2001@gmail.com',
    role: 'USER', // Even with role USER, email confers root superadmin
  };

  const sampleServers: Server[] = [
    {
      id: 'srv-1',
      name: 'Comunidade Alpha',
      ownerId: 'owner-1',
      createdAt: new Date().toISOString(),
    },
  ];

  const defaultProps = {
    servers: sampleServers,
    activeServerId: null,
    onSelectServer: vi.fn(),
    onOpenCreateServer: vi.fn(),
    onOpenJoinServer: vi.fn(),
    onOpenSuperAdmin: vi.fn(),
  };

  it('does NOT render the create server button for regular users', () => {
    render(
      <ServerRail
        {...defaultProps}
        currentUser={regularUser}
      />
    );

    expect(screen.queryByLabelText('Criar novo servidor')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Criar Novo Servidor (SuperAdmin)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Abrir painel de gestão de SuperAdmins')).not.toBeInTheDocument();
    // But join server should be accessible
    expect(screen.getByLabelText('Entrar em um servidor com código de convite')).toBeInTheDocument();
  });

  it('does NOT render the create server button for standard admin users (must be SUPERADMIN)', () => {
    render(
      <ServerRail
        {...defaultProps}
        currentUser={adminUser}
      />
    );

    expect(screen.queryByLabelText('Criar novo servidor')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Criar Novo Servidor (SuperAdmin)')).not.toBeInTheDocument();
  });

  it('does NOT render the create server button when isSuperAdmin is explicitly false', () => {
    render(
      <ServerRail
        {...defaultProps}
        currentUser={superAdminUser}
        isSuperAdmin={false}
      />
    );

    expect(screen.queryByLabelText('Criar novo servidor')).not.toBeInTheDocument();
  });

  it('renders create server button for users with role SUPERADMIN and triggers onOpenCreateServer', () => {
    const onOpenCreateServer = vi.fn();
    render(
      <ServerRail
        {...defaultProps}
        currentUser={superAdminUser}
        onOpenCreateServer={onOpenCreateServer}
      />
    );

    const createBtn = screen.getByLabelText('Criar novo servidor');
    expect(createBtn).toBeInTheDocument();

    fireEvent.click(createBtn);
    expect(onOpenCreateServer).toHaveBeenCalledTimes(1);

    expect(screen.getByLabelText('Abrir painel de gestão de SuperAdmins')).toBeInTheDocument();
  });

  it('renders create server button for root superadmin email joaoprf2001@gmail.com', () => {
    render(
      <ServerRail
        {...defaultProps}
        currentUser={rootSuperAdminUser}
      />
    );

    expect(screen.getByLabelText('Criar novo servidor')).toBeInTheDocument();
  });

  it('renders create server button when isSuperAdmin prop is true', () => {
    render(
      <ServerRail
        {...defaultProps}
        currentUser={regularUser}
        isSuperAdmin={true}
      />
    );

    expect(screen.getByLabelText('Criar novo servidor')).toBeInTheDocument();
  });
});

import React from 'react';
import { Plus, Compass, Shield, MessageSquare } from 'lucide-react';
import type { Server, User } from '@discord-clone/shared';
import './ServerRail.css';

interface ServerRailProps {
  servers: Server[];
  activeServerId: string | null;
  onSelectServer: (serverId: string | null) => void;
  onOpenCreateServer: () => void;
  onOpenJoinServer: () => void;
  onOpenSuperAdmin: () => void;
  currentUser: User | null;
}

export const ServerRail: React.FC<ServerRailProps> = ({
  servers,
  activeServerId,
  onSelectServer,
  onOpenCreateServer,
  onOpenJoinServer,
  onOpenSuperAdmin,
  currentUser,
}) => {
  const isSuperAdmin =
    currentUser?.role === 'SUPERADMIN' ||
    currentUser?.email?.toLowerCase() === 'joaoprf2001@gmail.com';

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 3)
      .toUpperCase();
  };

  return (
    <nav className="server-rail" aria-label="Servidores">
      {/* Home / Direct Messages & Global Channels */}
      <div className="server-rail-item-wrapper">
        <div
          className={`server-rail-pill ${activeServerId === null ? 'active' : ''}`}
        />
        <button
          type="button"
          className={`server-rail-btn home-btn ${activeServerId === null ? 'active' : ''}`}
          onClick={() => onSelectServer(null)}
          title="Mensagens Diretas & Canais Globais"
          aria-label="Início / Mensagens Diretas"
        >
          <MessageSquare size={24} />
        </button>
      </div>

      <div className="server-rail-separator" role="separator" />

      {/* Server List */}
      <div className="server-rail-list">
        {servers.map((server) => {
          const isActive = activeServerId === server.id;
          return (
            <div key={server.id} className="server-rail-item-wrapper">
              <div className={`server-rail-pill ${isActive ? 'active' : ''}`} />
              <button
                type="button"
                className={`server-rail-btn server-btn ${isActive ? 'active' : ''}`}
                onClick={() => onSelectServer(server.id)}
                title={server.name}
                aria-label={`Servidor ${server.name}`}
              >
                {server.iconUrl ? (
                  <img
                    src={server.iconUrl}
                    alt={server.name}
                    className="server-rail-icon-img"
                  />
                ) : (
                  <span className="server-rail-initials">{getInitials(server.name)}</span>
                )}
              </button>
            </div>
          );
        })}

        {/* Join Server by Invite */}
        <div className="server-rail-item-wrapper">
          <div className="server-rail-pill" />
          <button
            type="button"
            className="server-rail-btn action-btn join-btn"
            onClick={onOpenJoinServer}
            title="Entrar em um Servidor (Código de Convite)"
            aria-label="Entrar em um servidor com código de convite"
          >
            <Compass size={22} />
          </button>
        </div>

        {/* Create Server (SuperAdmin only) */}
        {isSuperAdmin && (
          <div className="server-rail-item-wrapper">
            <div className="server-rail-pill" />
            <button
              type="button"
              className="server-rail-btn action-btn add-btn"
              onClick={onOpenCreateServer}
              title="Criar Novo Servidor (SuperAdmin)"
              aria-label="Criar novo servidor"
            >
              <Plus size={22} />
            </button>
          </div>
        )}
      </div>

      {/* SuperAdmin Global Control Panel */}
      {isSuperAdmin && (
        <div className="server-rail-bottom">
          <div className="server-rail-item-wrapper">
            <div className="server-rail-pill" />
            <button
              type="button"
              className="server-rail-btn superadmin-btn"
              onClick={onOpenSuperAdmin}
              title="Painel de SuperAdmin (Gestão de Cargos Globais)"
              aria-label="Abrir painel de gestão de SuperAdmins"
            >
              <Shield size={22} />
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

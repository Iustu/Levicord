import React, { useState, useEffect, useCallback } from 'react';
import { X, Shield, Crown, UserPlus, UserMinus, Search, AlertCircle, CheckCircle, Server as ServerIcon, Trash2, Users, Hash } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Avatar } from './Avatar';
import type { User } from '@discord-clone/shared';
import './SuperAdminModal.css';

interface SuperAdminUser extends User {
  isRoot?: boolean;
  promotedById?: string | null;
  promotedBy?: { id: string; displayName: string; email: string } | null;
  createdAt?: string;
}

interface SuperAdminServer {
  id: string;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  createdAt: string;
  owner: { id: string; displayName: string; email: string };
  _count: { members: number; channels: number };
}

interface SuperAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  token: string | null;
  onServerDeleted?: (serverId: string) => void;
}

export const SuperAdminModal: React.FC<SuperAdminModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  token,
  onServerDeleted,
}) => {
  const [activeTab, setActiveTab] = useState<'superadmins' | 'servers'>('superadmins');
  const [superAdmins, setSuperAdmins] = useState<SuperAdminUser[]>([]);
  const [servers, setServers] = useState<SuperAdminServer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [serverSearchQuery, setServerSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isCurrentRoot = currentUser?.email?.toLowerCase() === 'joaoprf2001@gmail.com';

  const loadServers = useCallback(async () => {
    if (!token) return;
    setIsLoadingServers(true);
    setFeedback(null);
    try {
      const data = await apiFetch<SuperAdminServer[]>('/api/servers/admin/all', token);
      setServers(data || []);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao carregar servidores' });
    } finally {
      setIsLoadingServers(false);
    }
  }, [token]);

  const loadSuperAdmins = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const data = await apiFetch<SuperAdminUser[]>('/api/admin/superadmins', token);
      setSuperAdmins(data);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao carregar SuperAdmins' });
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'superadmins') {
        loadSuperAdmins();
      } else {
        loadServers();
      }
    }
  }, [isOpen, activeTab, loadSuperAdmins, loadServers]);

  const handleDeleteServer = async (server: SuperAdminServer) => {
    if (!token) return;
    const confirmMsg = `Tem certeza que deseja excluir permanentemente o servidor "${server.name}"? Todos os canais, mensagens e permissões deste servidor serão excluídos.`;
    if (!window.confirm(confirmMsg)) return;

    setFeedback(null);
    try {
      await apiFetch(`/api/servers/${server.id}`, token, {
        method: 'DELETE',
      });
      setFeedback({
        type: 'success',
        message: `Servidor "${server.name}" excluído com sucesso!`,
      });
      setServers((prev) => prev.filter((s) => s.id !== server.id));
      if (onServerDeleted) {
        onServerDeleted(server.id);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao excluir servidor' });
    }
  };

  const handleSearchUsers = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const data = await apiFetch<User[]>(`/api/admin/users?q=${encodeURIComponent(q.trim())}`);
      // Filter out users who are already SuperAdmin
      const existingIds = new Set(superAdmins.map((sa) => sa.id));
      setSearchResults(data.filter((u) => !existingIds.has(u.id) && u.role !== 'SUPERADMIN'));
    } catch (err: any) {
      // ignore
    } finally {
      setIsSearching(false);
    }
  };

  const handlePromote = async (targetUser: User) => {
    setFeedback(null);
    try {
      await apiFetch('/api/admin/superadmins', null, {
        method: 'POST',
        body: JSON.stringify({ targetUserId: targetUser.id }),
      });
      setFeedback({
        type: 'success',
        message: `${targetUser.displayName} foi promovido a SuperAdmin com sucesso!`,
      });
      setSearchQuery('');
      setSearchResults([]);
      loadSuperAdmins();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao promover usuário' });
    }
  };

  const handleDemote = async (target: SuperAdminUser) => {
    if (target.isRoot) {
      setFeedback({ type: 'error', message: 'A conta Root é irrevogável.' });
      return;
    }

    const confirmMsg = `Tem certeza que deseja remover o cargo de SuperAdmin de ${target.displayName}?`;
    if (!window.confirm(confirmMsg)) return;

    setFeedback(null);
    try {
      await apiFetch(`/api/admin/superadmins/${target.id}`, null, {
        method: 'DELETE',
      });
      setFeedback({
        type: 'success',
        message: `Cargo de SuperAdmin revogado de ${target.displayName}.`,
      });
      loadSuperAdmins();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Sem permissão para revogar este cargo.' });
    }
  };

  const filteredServers = servers.filter((s) => {
    if (!serverSearchQuery.trim()) return true;
    const q = serverSearchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.owner?.displayName.toLowerCase().includes(q) ||
      s.owner?.email.toLowerCase().includes(q)
    );
  });

  if (!isOpen) return null;

  return (
    <div className="superadmin-modal-overlay" onClick={onClose}>
      <div
        className="superadmin-modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="superadmin-modal-title"
      >
        <div className="superadmin-modal-header">
          <div className="superadmin-header-title-box">
            <Shield className="superadmin-shield-icon" size={24} />
            <div>
              <h2 id="superadmin-modal-title" className="superadmin-modal-title">
                Painel SuperAdmin
              </h2>
              <p className="superadmin-modal-subtitle">
                Gerencie permissões de SuperAdmin e todos os servidores da plataforma Levicord.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="superadmin-close-btn"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Navigation Tabs ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '8px', padding: '0 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            type="button"
            onClick={() => setActiveTab('superadmins')}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'superadmins' ? '2px solid #5865f2' : '2px solid transparent',
              color: activeTab === 'superadmins' ? '#f2f3f5' : '#949ba4',
              padding: '12px 16px',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Shield size={16} />
            <span>SuperAdmins ({superAdmins.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('servers');
              loadServers();
            }}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'servers' ? '2px solid #5865f2' : '2px solid transparent',
              color: activeTab === 'servers' ? '#f2f3f5' : '#949ba4',
              padding: '12px 16px',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <ServerIcon size={16} />
            <span>Servidores da Plataforma ({servers.length})</span>
          </button>
        </div>

        {feedback && (
          <div className={`superadmin-feedback ${feedback.type}`}>
            {feedback.type === 'success' ? (
              <CheckCircle size={18} />
            ) : (
              <AlertCircle size={18} />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        <div className="superadmin-modal-body">
          {activeTab === 'superadmins' ? (
            <>
              {/* Promote New SuperAdmin Section */}
              <div className="superadmin-promote-section">
                <label className="superadmin-section-label">
                  <UserPlus size={16} />
                  <span>Promover Novo SuperAdmin</span>
                </label>
                <div className="superadmin-search-box">
                  <Search size={18} className="search-icon" />
                  <input
                    type="text"
                    className="superadmin-search-input"
                    placeholder="Buscar usuário por nome ou email..."
                    value={searchQuery}
                    onChange={(e) => handleSearchUsers(e.target.value)}
                  />
                </div>

            {isSearching && (
              <div className="superadmin-loading-indicator">Buscando usuários...</div>
            )}

            {searchResults.length > 0 && (
              <div className="superadmin-search-results">
                {searchResults.map((user) => (
                  <div key={user.id} className="superadmin-user-result-row">
                    <div className="user-result-info">
                      <Avatar
                        src={user.avatarUrl}
                        name={user.displayName}
                        size={32}
                      />
                      <div>
                        <div className="user-result-name">{user.displayName}</div>
                        <div className="user-result-email">{user.email}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="promote-action-btn"
                      onClick={() => handlePromote(user)}
                    >
                      Promover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Current SuperAdmins List */}
          <div className="superadmin-list-section">
            <h3 className="superadmin-section-label">
              SuperAdmins Ativos ({superAdmins.length})
            </h3>

            {isLoading ? (
              <div className="superadmin-loading-indicator">Carregando lista...</div>
            ) : (
              <div className="superadmin-cards-list">
                {superAdmins.map((admin) => {
                  const canDemote =
                    !admin.isRoot &&
                    (isCurrentRoot ||
                      (admin.promotedById && admin.promotedById === currentUser?.id));

                  return (
                    <div
                      key={admin.id}
                      className={`superadmin-card ${admin.isRoot ? 'root-card' : ''}`}
                    >
                      <div className="superadmin-card-left">
                        <Avatar
                          src={admin.avatarUrl}
                          name={admin.displayName}
                          size={42}
                        />
                        <div className="superadmin-info">
                          <div className="superadmin-name-row">
                            <span className="superadmin-name">
                              {admin.displayName}
                            </span>
                            {admin.isRoot ? (
                              <span className="badge root-badge">
                                <Crown size={13} />
                                Root (Irrevogável)
                              </span>
                            ) : (
                              <span className="badge super-badge">
                                <Shield size={13} />
                                SuperAdmin
                              </span>
                            )}
                          </div>
                          <div className="superadmin-email">{admin.email}</div>
                          <div className="superadmin-lineage">
                            {admin.isRoot ? (
                              <span>Conta mestre do sistema</span>
                            ) : admin.promotedBy ? (
                              <span>
                                Promovido por: <strong>{admin.promotedBy.displayName}</strong>
                              </span>
                            ) : (
                              <span className="orphan-note">
                                SuperAdmin sem superior (apenas Root pode revogar)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="superadmin-card-right">
                        {!admin.isRoot && (
                          <button
                            type="button"
                            className={`demote-action-btn ${!canDemote ? 'disabled' : ''}`}
                            onClick={() => canDemote && handleDemote(admin)}
                            disabled={!canDemote}
                            title={
                              canDemote
                                ? 'Revogar cargo de SuperAdmin'
                                : 'Você só pode remover SuperAdmins que você próprio promoveu'
                            }
                          >
                            <UserMinus size={16} />
                            Remover
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="superadmin-servers-section" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="superadmin-search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="superadmin-search-input"
              placeholder="Buscar servidor por nome ou criador..."
              value={serverSearchQuery}
              onChange={(e) => setServerSearchQuery(e.target.value)}
            />
          </div>

          {isLoadingServers ? (
            <div className="superadmin-loading-indicator">Carregando servidores...</div>
          ) : (
            <div className="superadmin-cards-list">
              {filteredServers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#949ba4' }}>
                  Nenhum servidor encontrado.
                </div>
              ) : (
                filteredServers.map((server) => (
                  <div
                    key={server.id}
                    className="superadmin-card"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '12px',
                          background: '#5865f2',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '16px',
                          flexShrink: 0,
                        }}
                      >
                        {server.iconUrl ? (
                          <img
                            src={server.iconUrl}
                            alt={server.name}
                            style={{ width: '100%', height: '100%', borderRadius: '12px', objectFit: 'cover' }}
                          />
                        ) : (
                          server.name.substring(0, 2).toUpperCase()
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#f2f3f5', fontSize: '15px' }}>
                          {server.name}
                        </div>
                        <div style={{ fontSize: '13px', color: '#949ba4', marginTop: '2px' }}>
                          Criador: <strong style={{ color: '#dbdee1' }}>{server.owner?.displayName}</strong> ({server.owner?.email})
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '12px', color: '#80848e' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Users size={13} /> {server._count?.members ?? 0} membros
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Hash size={13} /> {server._count?.channels ?? 0} canais
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="demote-action-btn"
                      onClick={() => handleDeleteServer(server)}
                      style={{
                        background: 'rgba(218, 55, 60, 0.15)',
                        color: '#fa777c',
                        border: '1px solid rgba(218, 55, 60, 0.3)',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                      title={`Excluir servidor ${server.name}`}
                    >
                      <Trash2 size={16} />
                      Excluir Servidor
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>

        <div className="superadmin-modal-footer">
          <button type="button" className="superadmin-modal-btn close-action" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

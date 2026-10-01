import React, { useState, useEffect, useCallback } from 'react';
import { X, Shield, Crown, UserPlus, UserMinus, Search, AlertCircle, CheckCircle } from 'lucide-react';
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

interface SuperAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  token: string | null;
}

export const SuperAdminModal: React.FC<SuperAdminModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [superAdmins, setSuperAdmins] = useState<SuperAdminUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isCurrentRoot = currentUser?.email?.toLowerCase() === 'joaoprf2001@gmail.com';

  const loadSuperAdmins = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const data = await apiFetch<SuperAdminUser[]>('/api/admin/superadmins');
      setSuperAdmins(data);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao carregar SuperAdmins' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSuperAdmins();
    }
  }, [isOpen, loadSuperAdmins]);

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
                Gestão Global de SuperAdmins
              </h2>
              <p className="superadmin-modal-subtitle">
                SuperAdmins possuem escopo global para criar servidores e gerenciar a plataforma.
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

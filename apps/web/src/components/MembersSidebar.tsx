import React, { useState, useEffect } from 'react';
import type { User, ServerMember, ServerMemberRole } from '@discord-clone/shared';
import { Avatar } from './Avatar';
import { Shield, Crown, VolumeX, Volume2, UserMinus, Ban, MailX, MailCheck, MoreVertical, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { ConfirmModal } from './ConfirmModal';
import './MembersSidebar.css';

export interface MembersSidebarProps {
  users: User[];
  currentUser: User | null;
  onlineUserIds: string[];
  isOpen: boolean;
  onSelectUser?: (userId: string) => void;
  serverId?: string | null;
  serverMembers?: Array<ServerMember & { user?: User }>;
  currentUserRole?: ServerMemberRole | null;
  isSuperAdmin?: boolean;
  onMemberActionSuccess?: () => void;
}

export const MembersSidebar: React.FC<MembersSidebarProps> = ({
  users: _users,
  currentUser,
  onlineUserIds,
  isOpen,
  onSelectUser,
  serverId,
  serverMembers,
  currentUserRole,
  isSuperAdmin = false,
  onMemberActionSuccess,
}) => {
  const [selectedMember, setSelectedMember] = useState<(ServerMember & { user?: User }) | null>(null);
  const [muteMinutes, setMuteMinutes] = useState(15);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [kickTargetId, setKickTargetId] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedMember(null);
      }
    };
    if (selectedMember) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedMember]);

  // Canais globais não possuem aba de membros disponível e não devem expor usuários da plataforma
  if (!isOpen || !serverId) return null;

  const isUserOnline = (id: string) => {
    if (currentUser && id === currentUser.id) return true;
    return onlineUserIds.includes(id);
  };


  const canModerate = isSuperAdmin || currentUserRole === 'ADMIN' || currentUserRole === 'OWNER';

  // ── Moderation Actions ──────────────────────────────────────────────────────
  const handleMute = async (targetUserId: string, minutes: number) => {
    if (!serverId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiFetch(`/api/servers/${serverId}/members/${targetUserId}/mute`, null, {
        method: 'POST',
        body: JSON.stringify({ durationMinutes: minutes }),
      });
      setSelectedMember(null);
      onMemberActionSuccess?.();
    } catch (err: any) {
      setActionError(err.message || 'Erro ao mutar membro');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnmute = async (targetUserId: string) => {
    if (!serverId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiFetch(`/api/servers/${serverId}/members/${targetUserId}/unmute`, null, {
        method: 'POST',
      });
      setSelectedMember(null);
      onMemberActionSuccess?.();
    } catch (err: any) {
      setActionError(err.message || 'Erro ao desmutar membro');
    } finally {
      setActionLoading(false);
    }
  };

  const executeKick = async (targetUserId: string) => {
    if (!serverId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiFetch(`/api/servers/${serverId}/members/${targetUserId}/kick`, null, {
        method: 'POST',
      });
      setSelectedMember(null);
      setKickTargetId(null);
      onMemberActionSuccess?.();
    } catch (err: any) {
      setActionError(err.message || 'Erro ao expulsar membro');
    } finally {
      setActionLoading(false);
    }
  };

  const handleKick = (targetUserId: string) => {
    setKickTargetId(targetUserId);
  };

  const handleBan = async (targetUserId: string) => {
    if (!serverId) return;
    const reason = window.prompt('Motivo do banimento (opcional):') ?? undefined;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiFetch(`/api/servers/${serverId}/members/${targetUserId}/ban`, null, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setSelectedMember(null);
      onMemberActionSuccess?.();
    } catch (err: any) {
      setActionError(err.message || 'Erro ao banir membro');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: 'ADMIN' | 'MEMBER') => {
    if (!serverId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiFetch(`/api/servers/${serverId}/members/${targetUserId}/role`, null, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });
      setSelectedMember(null);
      onMemberActionSuccess?.();
    } catch (err: any) {
      setActionError(err.message || 'Erro ao alterar cargo');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleInvite = async (targetUserId: string, canInvite: boolean) => {
    if (!serverId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiFetch(`/api/servers/${serverId}/members/${targetUserId}/invite-permission`, null, {
        method: 'PUT',
        body: JSON.stringify({ canInvite }),
      });
      setSelectedMember(null);
      onMemberActionSuccess?.();
    } catch (err: any) {
      setActionError(err.message || 'Erro ao alterar permissão de convite');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Render Server Members View (if server is active) ────────────────────────
  if (serverId) {
    const list = serverMembers || [];
    const owners = list.filter((m) => m.role === 'OWNER');
    const admins = list.filter((m) => m.role === 'ADMIN');
    const regularMembers = list.filter((m) => m.role !== 'OWNER' && m.role !== 'ADMIN');

    const renderMemberList = (list: Array<ServerMember & { user?: User }>) => (
      list.map((m) => {
        const u = m.user;
        if (!u) return null;
        const isSelf = currentUser?.id === u.id;
        const online = isUserOnline(u.id);
        const isMuted = m.mutedUntil && new Date(m.mutedUntil).getTime() > Date.now();
        const canModerateThisMember = canModerate && !isSelf && m.role !== 'OWNER';

        return (
          <div key={m.id} className="member-item-container" style={{ position: 'relative' }}>
            <button
              className={`member-item ${online ? 'is-online' : ''}`}
              onClick={() => {
                if (canModerateThisMember) {
                  setSelectedMember(selectedMember?.id === m.id ? null : m);
                  setActionError(null);
                } else {
                  onSelectUser?.(u.id);
                }
              }}
              title={`${u.displayName} (${online ? 'Disponível' : 'Offline'})`}
            >
              <div className="member-avatar-wrapper">
                <Avatar src={u.avatarUrl} name={u.displayName} size={32} />
                <span className={`member-status-dot ${online ? 'online' : 'offline'}`} aria-hidden="true" />
              </div>
              <div className="member-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="member-name">{u.displayName}</span>
                  {m.role === 'OWNER' && <span title="Dono do Servidor" style={{ display: 'inline-flex' }}><Crown size={14} color="#f0b232" /></span>}
                  {m.role === 'ADMIN' && <span title="Administrador do Servidor" style={{ display: 'inline-flex' }}><Shield size={14} color="#5865f2" /></span>}
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                  {isSelf && <span className="member-you-badge">(você)</span>}
                  {isMuted && <span style={{ fontSize: '11px', color: '#ed4245', display: 'flex', alignItems: 'center', gap: '2px' }}><VolumeX size={11} /> Mutado</span>}
                  {m.canInvite === false && <span style={{ fontSize: '11px', color: '#949ba4', display: 'flex', alignItems: 'center', gap: '2px' }}><MailX size={11} /> Sem convite</span>}
                </div>
              </div>
              {canModerateThisMember && (
                <MoreVertical size={16} color="#949ba4" style={{ marginLeft: 'auto', flexShrink: 0 }} />
              )}
            </button>

            {/* Moderation Popover / Actions */}
            {selectedMember?.id === m.id && (
              <div className="moderation-dropdown" role="dialog" aria-label={`Moderar ${u.displayName}`}>
                <div className="moderation-dropdown-header">
                  <span className="moderation-dropdown-title">Moderar {u.displayName}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedMember(null)}
                    className="moderation-close-btn"
                    aria-label="Fechar painel de moderação"
                  >
                    <X size={16} />
                  </button>
                </div>

                {actionError && (
                  <div style={{ fontSize: '11px', color: '#ed4245', marginBottom: '8px' }}>
                    {actionError}
                  </div>
                )}

                <div className="moderation-action-list">
                  {isMuted ? (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleUnmute(u.id)}
                      className="moderation-action-btn unmute-btn"
                    >
                      <Volume2 size={14} /> Desmutar Membro
                    </button>
                  ) : (
                    <div className="moderation-mute-row">
                      <select
                        value={muteMinutes}
                        onChange={(e) => setMuteMinutes(Number(e.target.value))}
                        className="moderation-select"
                        aria-label="Duração do mute"
                      >
                        <option value={5}>5 min</option>
                        <option value={15}>15 min</option>
                        <option value={60}>1 hora</option>
                        <option value={1440}>24 horas</option>
                      </select>
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleMute(u.id, muteMinutes)}
                        className="moderation-mute-confirm-btn"
                      >
                        <VolumeX size={14} /> Mutar
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleKick(u.id)}
                    className="moderation-action-btn"
                  >
                    <UserMinus size={14} color="#f0b232" /> Expulsar do Servidor
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleBan(u.id)}
                    className="moderation-action-btn ban-btn"
                  >
                    <Ban size={14} /> Banir do Servidor
                  </button>

                  {m.role === 'ADMIN' ? (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleRoleChange(u.id, 'MEMBER')}
                      className="moderation-action-btn"
                    >
                      <Shield size={14} /> Rebaixar para Membro
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleRoleChange(u.id, 'ADMIN')}
                      className="moderation-action-btn"
                    >
                      <Shield size={14} color="#5865f2" /> Promover a Admin
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleToggleInvite(u.id, m.canInvite === false ? true : false)}
                    className="moderation-action-btn"
                  >
                    {m.canInvite === false ? (
                      <><MailCheck size={14} color="#23a55a" /> Liberar Convites</>
                    ) : (
                      <><MailX size={14} color="#ed4245" /> Proibir Convites</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })
    );

    return (
      <aside className="members-sidebar" aria-label="Membros do servidor">
        <div className="members-content">
          {list.length === 0 ? (
            <div style={{ padding: '16px', color: '#949ba4', fontSize: '13px', textAlign: 'center' }}>
              Nenhum membro encontrado.
            </div>
          ) : (
            <>
              {owners.length > 0 && (
                <div className="members-group">
                  <h4 className="members-group-title">Dono — {owners.length}</h4>
                  {renderMemberList(owners)}
                </div>
              )}

              {admins.length > 0 && (
                <div className="members-group">
                  <h4 className="members-group-title">Administradores — {admins.length}</h4>
                  {renderMemberList(admins)}
                </div>
              )}

              {regularMembers.length > 0 && (
                <div className="members-group">
                  <h4 className="members-group-title">Membros — {regularMembers.length}</h4>
                  {renderMemberList(regularMembers)}
                </div>
              )}
            </>
          )}
        </div>
        <ConfirmModal
          isOpen={Boolean(kickTargetId)}
          title="Expulsar Membro"
          message="Tem certeza que deseja expulsar este membro do servidor?"
          confirmLabel="Expulsar"
          cancelLabel="Cancelar"
          danger
          onClose={() => setKickTargetId(null)}
          onConfirm={() => {
            if (kickTargetId) executeKick(kickTargetId);
          }}
        />
      </aside>
    );
  }

  // Canais globais não devem ter aba de membros disponíveis e não expõem usuários da plataforma
  return null;
};

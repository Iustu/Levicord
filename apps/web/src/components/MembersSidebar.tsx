import React, { useState } from 'react';
import type { User, ServerMember, ServerMemberRole } from '@discord-clone/shared';
import { Avatar } from './Avatar';
import { Shield, Crown, VolumeX, Volume2, UserMinus, Ban, MailX, MailCheck, MoreVertical, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
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
  users,
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

  if (!isOpen) return null;

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

  const handleKick = async (targetUserId: string) => {
    if (!serverId) return;
    if (!window.confirm('Tem certeza que deseja expulsar este membro do servidor?')) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiFetch(`/api/servers/${serverId}/members/${targetUserId}/kick`, null, {
        method: 'POST',
      });
      setSelectedMember(null);
      onMemberActionSuccess?.();
    } catch (err: any) {
      setActionError(err.message || 'Erro ao expulsar membro');
    } finally {
      setActionLoading(false);
    }
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
        method: 'POST',
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
  if (serverMembers && serverMembers.length > 0) {
    const owners = serverMembers.filter((m) => m.role === 'OWNER');
    const admins = serverMembers.filter((m) => m.role === 'ADMIN');
    const regularMembers = serverMembers.filter((m) => m.role !== 'OWNER' && m.role !== 'ADMIN');

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
              <div
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '40px',
                  zIndex: 999,
                  backgroundColor: '#111214',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '12px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  width: '240px',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #2b2d31', paddingBottom: '6px' }}>
                  <strong style={{ fontSize: '13px', color: '#f2f3f5' }}>Moderar {u.displayName}</strong>
                  <button type="button" onClick={() => setSelectedMember(null)} style={{ background: 'none', border: 'none', color: '#949ba4', cursor: 'pointer' }}>
                    <X size={16} />
                  </button>
                </div>

                {actionError && (
                  <div style={{ fontSize: '11px', color: '#ed4245', marginBottom: '8px' }}>
                    {actionError}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {isMuted ? (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleUnmute(u.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', backgroundColor: '#2b2d31', color: '#23a55a', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                    >
                      <Volume2 size={14} /> Desmutar Membro
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <select
                        value={muteMinutes}
                        onChange={(e) => setMuteMinutes(Number(e.target.value))}
                        style={{ backgroundColor: '#2b2d31', color: '#dbdee1', border: '1px solid #383a40', borderRadius: '4px', padding: '4px', fontSize: '12px', flex: 1 }}
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
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 8px', borderRadius: '4px', backgroundColor: '#e5a50a', color: '#000000', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                      >
                        <VolumeX size={14} /> Mutar
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleKick(u.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', backgroundColor: '#2b2d31', color: '#f2f3f5', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                  >
                    <UserMinus size={14} color="#f0b232" /> Expulsar do Servidor
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleBan(u.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', backgroundColor: '#2b2d31', color: '#ed4245', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                  >
                    <Ban size={14} /> Banir do Servidor
                  </button>

                  {m.role === 'ADMIN' ? (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleRoleChange(u.id, 'MEMBER')}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', backgroundColor: '#2b2d31', color: '#949ba4', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                    >
                      <Shield size={14} /> Rebaixar para Membro
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleRoleChange(u.id, 'ADMIN')}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', backgroundColor: '#2b2d31', color: '#5865f2', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                    >
                      <Shield size={14} /> Promover a Admin
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleToggleInvite(u.id, m.canInvite === false ? true : false)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', backgroundColor: '#2b2d31', color: '#dbdee1', border: 'none', cursor: 'pointer', fontSize: '12px' }}
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
        </div>
      </aside>
    );
  }

  // ── Fallback: Regular Online / Offline List ──────────────────────────────────
  const allUsersMap = new Map<string, User>();
  if (currentUser) {
    allUsersMap.set(currentUser.id, currentUser);
  }
  for (const u of users) {
    if (!allUsersMap.has(u.id)) {
      allUsersMap.set(u.id, u);
    }
  }

  const allUsers = Array.from(allUsersMap.values());
  const onlineUsers = allUsers.filter((u) => isUserOnline(u.id));
  const offlineUsers = allUsers.filter((u) => !isUserOnline(u.id));

  onlineUsers.sort((a, b) => a.displayName.localeCompare(b.displayName));
  offlineUsers.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <aside className="members-sidebar" aria-label="Membros do canal">
      <div className="members-content">
        {onlineUsers.length > 0 && (
          <div className="members-group">
            <h4 className="members-group-title">
              Disponível — {onlineUsers.length}
            </h4>
            {onlineUsers.map((user) => {
              const isSelf = currentUser?.id === user.id;
              return (
                <button
                  key={user.id}
                  className="member-item is-online"
                  onClick={() => onSelectUser?.(user.id)}
                  title={`${user.displayName} (Disponível)`}
                >
                  <div className="member-avatar-wrapper">
                    <Avatar src={user.avatarUrl} name={user.displayName} size={32} />
                    <span className="member-status-dot online" aria-hidden="true" />
                  </div>
                  <div className="member-info">
                    <span className="member-name">
                      {user.displayName}
                      {isSelf && <span className="member-you-badge">(você)</span>}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {offlineUsers.length > 0 && (
          <div className="members-group">
            <h4 className="members-group-title">
              Offline — {offlineUsers.length}
            </h4>
            {offlineUsers.map((user) => {
              return (
                <button
                  key={user.id}
                  className="member-item"
                  onClick={() => onSelectUser?.(user.id)}
                  title={`${user.displayName} (Offline)`}
                >
                  <div className="member-avatar-wrapper">
                    <Avatar src={user.avatarUrl} name={user.displayName} size={32} />
                    <span className="member-status-dot offline" aria-hidden="true" />
                  </div>
                  <div className="member-info">
                    <span className="member-name">{user.displayName}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};

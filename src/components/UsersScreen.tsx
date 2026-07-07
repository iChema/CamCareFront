/**
 * UsersScreen — lista de usuarios + modal de creación/edición.
 *
 * Extraído de main.tsx. Los locks del admin #1 (isFirstAdmin, editingUserId === 1)
 * se preservan literalmente. El estado del modal (email/password/role/active)
 * vive en App para no duplicar fuentes de verdad; este componente recibe los
 * valores y callbacks.
 */
import { Plus, X } from "lucide-react";
import type { UserPublic } from "../types";
import { Panel, SectionTitle } from "./ui";

type Props = {
  isAdmin: boolean;
  busy: string;
  users: UserPublic[];
  showUserModal: boolean;
  editingUserId: number | null;
  userModalEmail: string;
  userModalPassword: string;
  userModalRole: string;
  userModalActive: boolean;
  currentUserId: number;
  onAddUser: () => void;
  onEditUser: (user: UserPublic) => void;
  onCloseModal: () => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onActiveChange: (value: boolean) => void;
  onSaveUser: () => void;
  onDeleteUser: (userId: number) => void;
};

export function UsersScreen({
  isAdmin,
  busy,
  users,
  showUserModal,
  editingUserId,
  userModalEmail,
  userModalPassword,
  userModalRole,
  userModalActive,
  currentUserId,
  onAddUser,
  onEditUser,
  onCloseModal,
  onEmailChange,
  onPasswordChange,
  onRoleChange,
  onActiveChange,
  onSaveUser,
  onDeleteUser,
}: Props) {
  if (!isAdmin) {
    return (
      <section className="panel my-4 rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
        <div className="empty">
          <p>No autorizado.</p>
        </div>
      </section>
    );
  }
  return (
    <>
      <Panel id="users">
        <SectionTitle title="Usuarios y perfiles" meta={`${users.length} usuarios`} />
        <div className="actions">
          <button className="secondary" onClick={onAddUser}>
            <Plus size={14} />
            Agregar usuario
          </button>
        </div>
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isFirstAdmin = user.id === 1;
                return (
                  <tr
                    key={`user-${user.id}`}
                    className={isFirstAdmin ? "locked-row" : ""}
                    onClick={() => {
                      if (isFirstAdmin) return;
                      onEditUser(user);
                    }}
                  >
                    <td>{user.id}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>{user.active ? "activo" : "inactivo"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {showUserModal && (
        <div className="modal-backdrop" role="presentation" onClick={onCloseModal}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-label="Usuario" onClick={(event) => event.stopPropagation()}>
            <div className="section-title mb-3 flex items-center justify-between gap-4">
              <h2>{editingUserId === null ? "Agregar usuario" : `Editar usuario #${editingUserId}`}</h2>
              <button className="secondary" onClick={onCloseModal}>
                <X size={14} />
                Cerrar
              </button>
            </div>
            <div className="form-grid settings-grid">
              <label>
                Email
                <input value={userModalEmail} onChange={(event) => onEmailChange(event.target.value)} />
              </label>
              <label>
                Password {editingUserId !== null && <small>(opcional)</small>}
                <input
                  type="password"
                  value={userModalPassword}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  disabled={editingUserId === 1}
                />
              </label>
              <label>
                Rol
                <select
                  value={userModalRole}
                  onChange={(event) => onRoleChange(event.target.value)}
                  disabled={editingUserId === 1}
                >
                  <option value="viewer">viewer</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label>
                Activo
                <select
                  value={userModalActive ? "yes" : "no"}
                  onChange={(event) => onActiveChange(event.target.value === "yes")}
                  disabled={editingUserId === 1}
                >
                  <option value="yes">Sí</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>
            <div className="actions">
              <button className="secondary" disabled={busy === "user-modal" || editingUserId === 1} onClick={onSaveUser}>
                Guardar
              </button>
              {editingUserId !== null && (
                <button
                  className="danger"
                  disabled={busy === `user-del-${editingUserId}` || editingUserId === currentUserId || editingUserId === 1}
                  onClick={() => onDeleteUser(editingUserId)}
                >
                  Eliminar
                </button>
              )}
            </div>
            {editingUserId === 1 && <div className="message">El primer admin no se puede editar.</div>}
          </div>
        </div>
      )}
    </>
  );
}
/**
 * main.tsx — entry point de CamCare frontend.
 *
 * P3 frontend: el componente App() fue reducido delegando estado y lógica a:
 *   - hooks/useAuth   → sesión, usuarios, telegram targets
 *   - hooks/useHealth → /api/health
 *   - hooks/useCameras→ cámaras, streaming, scan, PTZ, defaults, derivados
 * Y el JSX presentacional a los componentes en src/components/.
 *
 * App() conserva únicamente:
 *   - Composición de los tres hooks
 *   - Estado de UI puramente local (screen, sidebar, modals, formulario user)
 *   - Handlers de usuarios y telegram (usan api directo + busy/message del hook)
 *   - El árbol JSX que cablea props a los componentes
 *
 * Comportamiento idéntico al original. Sin cambios funcionales.
 */
import { StrictMode, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { Plus, RefreshCw, X } from "lucide-react";
import { api } from "./api";
import type { Camera, TelegramTarget, UserPublic } from "./types";
import { TelegramTargetsPage } from "./components/TelegramTargetsPage";
import { CameraCard } from "./components/CameraCard";
import { CameraForm } from "./components/CameraForm";
import { DashboardScreen } from "./components/DashboardScreen";
import { HealthBar } from "./components/HealthBar";
import { LoginScreen } from "./components/LoginScreen";
import { ScanScreen } from "./components/ScanScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { Sidebar } from "./components/Sidebar";
import { StreamTile } from "./components/StreamTile";
import { UsersScreen } from "./components/UsersScreen";
import { useAuth } from "./hooks/useAuth";
import { useCameras } from "./hooks/useCameras";
import { useHealth } from "./hooks/useHealth";
import "./tailwind.css";
import "./styles.css";
import { isLoginErrorMessage } from "./appTypes";

type ScreenName = "dashboard" | "scan" | "settings" | "users" | "telegram";

function App() {
  // --- Composición de hooks extraídos (P3) ---
  const auth = useAuth();
  const health = useHealth();
  const cameras = useCameras({
    authToken: auth.authToken,
    currentUser: auth.currentUser,
    refreshHealth: health.refreshHealth,
  });

  // --- Estado de UI puramente local (no vive en los hooks) ---
  const [showAddCameraModal, setShowAddCameraModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userModalEmail, setUserModalEmail] = useState("");
  const [userModalPassword, setUserModalPassword] = useState("");
  const [userModalRole, setUserModalRole] = useState("viewer");
  const [userModalActive, setUserModalActive] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [screen, setScreen] = useState<ScreenName>("dashboard");

  // --- Handlers de usuarios (usan api directo + busy/message del hook) ---
  const openCreateUserModal = useCallback(() => {
    setEditingUserId(null);
    setUserModalEmail("");
    setUserModalPassword("");
    setUserModalRole("viewer");
    setUserModalActive(true);
    setShowUserModal(true);
  }, []);

  const openEditUserModal = useCallback((user: UserPublic) => {
    setEditingUserId(user.id);
    setUserModalEmail(user.email);
    setUserModalPassword("");
    setUserModalRole(user.role);
    setUserModalActive(user.active);
    setShowUserModal(true);
  }, []);

  const saveUserModal = useCallback(async () => {
    cameras.setBusy("user-modal");
    try {
      if (editingUserId === null) {
        await api.createUser({
          email: userModalEmail.trim(),
          password: userModalPassword,
          role: userModalRole,
          active: userModalActive,
        });
        cameras.setMessage("Usuario creado");
      } else {
        const patch: { email?: string; password?: string; role?: string; active?: boolean } = {
          email: userModalEmail.trim(),
          role: userModalRole,
          active: userModalActive,
        };
        if (userModalPassword.trim()) patch.password = userModalPassword;
        await api.updateUser(editingUserId, patch);
        cameras.setMessage("Usuario actualizado");
      }
      await auth.refreshUsers();
      setShowUserModal(false);
    } catch (err) {
      cameras.setMessage(err instanceof Error ? err.message : "No se pudo guardar usuario");
    } finally {
      cameras.setBusy("");
    }
  }, [auth, cameras, editingUserId, userModalEmail, userModalPassword, userModalRole, userModalActive]);

  const deleteUserRow = useCallback(
    async (userId: number) => {
      cameras.setBusy(`user-del-${userId}`);
      try {
        await api.deleteUser(userId);
        await auth.refreshUsers();
        cameras.setMessage("Usuario eliminado");
      } catch (err) {
        cameras.setMessage(err instanceof Error ? err.message : "No se pudo eliminar usuario");
      } finally {
        cameras.setBusy("");
      }
    },
    [auth, cameras],
  );

  // --- Handlers de destinos Telegram (usan api directo + busy/message) ---
  const createTelegramTargetRow = useCallback(
    async (payload: { name: string; chat_id: string; active: boolean }) => {
      if (!payload.name.trim() || !payload.chat_id.trim()) {
        cameras.setMessage("Nombre y chat_id son obligatorios");
        return;
      }
      cameras.setBusy("tg-create");
      try {
        await api.createTelegramTarget({
          name: payload.name.trim(),
          chat_id: payload.chat_id.trim(),
          active: payload.active,
        });
        await auth.refreshTelegramTargets();
        cameras.setMessage("Destino Telegram agregado");
      } catch (err) {
        cameras.setMessage(err instanceof Error ? err.message : "No se pudo agregar destino Telegram");
      } finally {
        cameras.setBusy("");
      }
    },
    [auth, cameras],
  );

  const updateTelegramTargetRow = useCallback(
    async (target: TelegramTarget, patch: Partial<TelegramTarget>) => {
      cameras.setBusy(`tg-${target.id}`);
      try {
        await api.updateTelegramTarget(target.id, {
          name: patch.name,
          chat_id: patch.chat_id,
          active: patch.active,
        });
        await auth.refreshTelegramTargets();
        cameras.setMessage(`Destino ${target.name} actualizado`);
      } catch (err) {
        cameras.setMessage(err instanceof Error ? err.message : "No se pudo actualizar destino Telegram");
      } finally {
        cameras.setBusy("");
      }
    },
    [auth, cameras],
  );

  const deleteTelegramTargetRow = useCallback(
    async (target: TelegramTarget) => {
      cameras.setBusy(`tg-del-${target.id}`);
      try {
        await api.deleteTelegramTarget(target.id);
        await auth.refreshTelegramTargets();
        cameras.setMessage(`Destino ${target.name} eliminado`);
      } catch (err) {
        cameras.setMessage(err instanceof Error ? err.message : "No se pudo eliminar destino Telegram");
      } finally {
        cameras.setBusy("");
      }
    },
    [auth, cameras],
  );

  const openScreen = useCallback((next: ScreenName) => {
    setScreen(next);
    setSidebarOpen(false);
  }, []);

  // --- Login wrapper: pega el mensaje del hook en cameras.setMessage ---
  const handleLogin = useCallback(() => {
    void auth.login(async () => {
      await cameras.refresh();
    }).then((result) => {
      if (result) cameras.setMessage(result);
    });
  }, [auth, cameras]);

  // --- Render ---
  if (!auth.authToken || !auth.currentUser) {
    return (
      <LoginScreen
        loginEmail={auth.loginEmail}
        loginPassword={auth.loginPassword}
        showLoginPassword={auth.showLoginPassword}
        authBusy={auth.authBusy}
        message={cameras.message}
        isLoginError={isLoginErrorMessage}
        onEmailChange={auth.setLoginEmail}
        onPasswordChange={auth.setLoginPassword}
        onToggleShowPassword={auth.toggleShowPassword}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <main className={`app-shell min-h-screen ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        sidebarCollapsed={sidebarCollapsed}
        sidebarOpen={sidebarOpen}
        screen={screen}
        isAdmin={auth.isAdmin}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
        onToggleOpen={() => setSidebarOpen((current) => !current)}
        onOpenScreen={openScreen}
      />

      <section className="content w-full px-4 pb-4 pt-14 md:px-7 md:pt-7">
        <header className="mb-4 grid grid-cols-1 gap-4 md:flex md:items-start md:justify-between">
          <div>
            <h1>Todas tus cámaras, una vista local.</h1>
            <p>DVR + cámaras por apps chinas, reunidas cuando expongan stream LAN.</p>
          </div>
          <div className="header-actions flex flex-wrap items-center justify-end gap-2">
            <span
              className="pill ok user-chip"
              title={`${auth.currentUser.email} · ${auth.currentUser.role}`}
            >
              <span className="user-chip__email">{auth.currentUser.email}</span>
              <span className="user-chip__role">· {auth.currentUser.role}</span>
            </span>
            {auth.isAdmin && (
              <button className="secondary" onClick={() => setShowAddCameraModal(true)}>
                <Plus size={16} />
                Alta manual
              </button>
            )}
            <button className="secondary" onClick={() => void cameras.refreshAndReloadStreams()}>
              <RefreshCw size={16} />
              Refrescar
            </button>
            <button className="danger" onClick={() => void auth.logout()}>
              Salir
            </button>
          </div>
        </header>

        <HealthBar health={health.health} />

        <section className="stats my-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
            <span>Total</span>
            <strong>{cameras.cameras.length}</strong>
          </div>
          <div className="rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
            <span>Dashboard</span>
            <strong>{cameras.visibleCount}</strong>
          </div>
          <div className="rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
            <span>Online</span>
            <strong>{cameras.onlineCount}</strong>
          </div>
          <div className="rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
            <span>IA personas</span>
            <strong>{cameras.aiCount}</strong>
          </div>
          <div className="rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
            <span>Backend</span>
            <strong>{health.health?.ok ? "OK" : "OFF"}</strong>
          </div>
        </section>

        {cameras.message && <div className="message">{cameras.message}</div>}

        {screen === "dashboard" ? (
          <DashboardScreen
            cameras={cameras.cameras}
            dashboardCameras={cameras.dashboardCameras}
            dashboardCamerasForStreaming={cameras.dashboardCamerasForStreaming}
            dashboardFilter={cameras.dashboardFilter}
            dashboardSort={cameras.dashboardSort}
            isPublicZrokHost={cameras.isPublicZrokHost}
            onFilterChange={cameras.setDashboardFilter}
            onSortChange={cameras.setDashboardSort}
            renderCameraCard={(camera) => (
              <CameraCard
                key={camera.id}
                camera={camera}
                isAdmin={auth.isAdmin}
                busy={cameras.busy}
                orderSlots={cameras.orderSlots}
                ptzVisible={cameras.ptzVisible}
                ptzSpeed={cameras.ptzSpeed}
                ptzPreset={cameras.ptzPreset}
                onTogglePtzVisible={(cameraId) =>
                  cameras.setPtzVisible((prev) => ({ ...prev, [cameraId]: !prev[cameraId] }))
                }
                onSetPtzSpeed={(cameraId, speed) =>
                  cameras.setPtzSpeed((prev) => ({ ...prev, [cameraId]: speed }))
                }
                onSetPtzPreset={(cameraId, slot) =>
                  cameras.setPtzPreset((prev) => ({ ...prev, [cameraId]: slot }))
                }
                onUpdateCameraConfig={cameras.updateCameraConfig}
                onPtz={cameras.ptz}
                onPreset={cameras.preset}
                onProbe={cameras.probe}
                onRemove={cameras.remove}
                streamTile={
                  <StreamTile
                    camera={camera}
                    liveTicket={cameras.liveTicket}
                    authToken={auth.authToken}
                    streamEnabled={cameras.activeStreamingIds.has(camera.id)}
                    onEnableStream={cameras.enableStream}
                    onDisableStream={cameras.disableStream}
                    reloadToken={cameras.failedStreamIds[camera.id] ? cameras.streamReloadToken : undefined}
                    startDelayMs={Math.min(4000, ((camera.dashboard_order || camera.id) % 20) * 250)}
                    onStreamFailedChange={cameras.handleStreamFailedChange}
                    fullscreenCameraId={cameras.fullscreenCameraId}
                    onFullscreenCameraChange={cameras.setFullscreenCameraId}
                  />
                }
              />
            )}
          />
        ) : screen === "scan" ? (
          <ScanScreen
            isAdmin={auth.isAdmin}
            busy={cameras.busy}
            scanResults={cameras.scanResults}
            subnet={cameras.subnet}
            deep={cameras.deep}
            onSubnetChange={cameras.setSubnet}
            onDeepChange={cameras.setDeep}
            onRunScan={() => void cameras.runScan()}
            onSelectHost={cameras.setSelectedHost}
          />
        ) : screen === "users" ? (
          <UsersScreen
            isAdmin={auth.isAdmin}
            busy={cameras.busy}
            users={auth.users}
            showUserModal={showUserModal}
            editingUserId={editingUserId}
            userModalEmail={userModalEmail}
            userModalPassword={userModalPassword}
            userModalRole={userModalRole}
            userModalActive={userModalActive}
            currentUserId={auth.currentUser.id}
            onAddUser={openCreateUserModal}
            onEditUser={openEditUserModal}
            onCloseModal={() => setShowUserModal(false)}
            onEmailChange={setUserModalEmail}
            onPasswordChange={setUserModalPassword}
            onRoleChange={setUserModalRole}
            onActiveChange={setUserModalActive}
            onSaveUser={() => void saveUserModal()}
            onDeleteUser={deleteUserRow}
          />
        ) : screen === "telegram" ? (
          auth.isAdmin ? (
            <TelegramTargetsPage
              telegramTargets={auth.telegramTargets}
              busy={cameras.busy}
              onCreate={createTelegramTargetRow}
              onUpdate={updateTelegramTargetRow}
              onDelete={deleteTelegramTargetRow}
            />
          ) : (
            <section className="panel my-4 rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
              <div className="empty">
                <p>No autorizado.</p>
              </div>
            </section>
          )
        ) : (
          <SettingsScreen
            isAdmin={auth.isAdmin}
            busy={cameras.busy}
            cameras={cameras.cameras}
            defaults={cameras.defaults}
            defaultsProviderScope={cameras.defaultsProviderScope}
            providerOptions={cameras.providerOptions}
            onDefaultsChange={cameras.setDefaults}
            onProviderScopeChange={cameras.setDefaultsProviderScope}
            onApplyDefaultsToAll={() => void cameras.applyDefaultsToAll()}
            onUpdateCameraConfig={cameras.updateCameraConfig}
          />
        )}
        {auth.isAdmin && showAddCameraModal && (
          <div className="modal-backdrop" role="presentation" onClick={() => setShowAddCameraModal(false)}>
            <div
              className="modal-card"
              role="dialog"
              aria-modal="true"
              aria-label="Alta manual"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="section-title mb-3 flex items-center justify-between gap-4">
                <h2>Alta manual</h2>
                <button className="secondary" onClick={() => setShowAddCameraModal(false)}>
                  <X size={14} />
                  Cerrar
                </button>
              </div>
              <CameraForm
                initialHost={cameras.selectedHost}
                defaults={cameras.defaults}
                onCreate={cameras.createCamera}
              />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
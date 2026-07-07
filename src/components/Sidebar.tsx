/**
 * Sidebar — barra lateral de navegación del componente App.
 *
 * Extraído de main.tsx. Recibe el estado de colapso/apertura y el screen
 * activo como props; el toggle y openScreen viven en App.
 */
import { Camera as CameraIcon, Bot, Menu, PanelLeftClose, PanelLeftOpen, Radar, Settings, ShieldCheck, Video } from "lucide-react";

export type ScreenName = "dashboard" | "scan" | "settings" | "users" | "telegram";

type Props = {
  sidebarCollapsed: boolean;
  sidebarOpen: boolean;
  screen: ScreenName;
  isAdmin: boolean;
  onToggleCollapsed: () => void;
  onToggleOpen: () => void;
  onOpenScreen: (next: ScreenName) => void;
};

export function Sidebar({
  sidebarCollapsed,
  sidebarOpen,
  screen,
  isAdmin,
  onToggleCollapsed,
  onToggleOpen,
  onOpenScreen,
}: Props) {
  return (
    <>
      <button
        className="sidebar-mobile-toggle fixed left-2.5 top-2.5 z-[70] inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-400/25 bg-slate-950/85 text-slate-200 md:hidden"
        onClick={onToggleOpen}
      >
        <Menu size={18} />
      </button>
      <aside className={`sidebar ${sidebarOpen ? "open" : ""} border-r border-slate-400/20 bg-slate-950/80 backdrop-blur-xl`}>
        <button
          className="sidebar-toggle ml-auto mb-2.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-400/25 bg-slate-900/70 text-slate-200"
          onClick={onToggleCollapsed}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <div className="brand">
          <CameraIcon size={26} />
          <div className={sidebarCollapsed ? "hide-labels" : ""}>
            <strong>CamCare</strong>
            <span>LAN camera hub</span>
          </div>
        </div>
        <nav>
          <button className={screen === "dashboard" ? "active" : ""} onClick={() => onOpenScreen("dashboard")}>
            <Video size={17} /> Dashboard
          </button>
          {isAdmin && (
            <button className={screen === "scan" ? "active" : ""} onClick={() => onOpenScreen("scan")}>
              <Radar size={17} /> Scan LAN
            </button>
          )}
          {isAdmin && (
            <button className={screen === "users" ? "active" : ""} onClick={() => onOpenScreen("users")}>
              <ShieldCheck size={17} /> Usuarios
            </button>
          )}
          {isAdmin && (
            <button className={screen === "telegram" ? "active" : ""} onClick={() => onOpenScreen("telegram")}>
              <Bot size={17} /> Telegram
            </button>
          )}
          {isAdmin && (
            <button className={screen === "settings" ? "active" : ""} onClick={() => onOpenScreen("settings")}>
              <Settings size={17} /> Configuración
            </button>
          )}
        </nav>
      </aside>
    </>
  );
}
/**
 * Tipos y constantes compartidas entre App (main.tsx) y los screen components
 * extraídos (LoginScreen, Sidebar, DashboardScreen, ScanScreen, UsersScreen,
 * SettingsScreen).
 *
 * Extraídos de main.tsx para que los componentes de pantalla puedan importar
 * los mismos tipos sin duplicar definiciones. NO contiene lógica de UI.
 */
import type { Camera, CameraProtocol } from "./types";

export type CameraFormPayload = {
  name: string;
  location: string;
  provider: string;
  host: string;
  port: number;
  protocol: CameraProtocol;
  username: string;
  password: string;
  rtsp_path: string;
  snapshot_url: string;
  dvr_channel: number | null;
  video_filter: string;
  use_substream: boolean;
  dashboard_visible: boolean;
  dashboard_order: number;
  ai_person_detection: boolean;
  ai_model: string;
  ai_conf_threshold: number;
  ai_fps_limit: number;
  ai_zone_json: string;
  ai_min_presence_sec: number;
  notes: string;
};

export const emptyCamera: CameraFormPayload = {
  name: "",
  location: "",
  provider: "",
  host: "",
  port: 554,
  protocol: "rtsp" as const,
  username: "",
  password: "",
  rtsp_path: "/Streaming/Channels/101",
  snapshot_url: "",
  dvr_channel: null,
  video_filter: "",
  use_substream: false,
  dashboard_visible: true,
  dashboard_order: 0,
  ai_person_detection: false,
  ai_model: "hog",
  ai_conf_threshold: 0.3,
  ai_fps_limit: 3,
  ai_zone_json: "",
  ai_min_presence_sec: 2,
  notes: "",
};

export type GlobalDefaults = Pick<
  Camera,
  | "dashboard_visible"
  | "dashboard_order"
  | "ai_person_detection"
  | "ai_model"
  | "ai_conf_threshold"
  | "ai_fps_limit"
  | "ai_zone_json"
  | "ai_min_presence_sec"
  | "video_filter"
>;

export type DashboardFilter = "visible" | "all" | "hidden";
export type DashboardSort = "custom" | "name" | "status" | "provider" | "ip" | "ai";

export type ScreenName = "dashboard" | "scan" | "settings" | "users" | "telegram";

export function parseDefaultsSafe(): GlobalDefaults {
  const fallback: GlobalDefaults = {
    dashboard_visible: true,
    dashboard_order: 0,
    ai_person_detection: false,
    ai_model: "hog",
    ai_conf_threshold: 0.3,
    ai_fps_limit: 3,
    ai_zone_json: "",
    ai_min_presence_sec: 2,
    video_filter: "",
  };
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("camcare_defaults_v1") : null;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<GlobalDefaults>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

export function isLoginErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("invalid") ||
    lower.includes("error") ||
    lower.includes("fail") ||
    lower.includes("credencial") ||
    lower.includes("401") ||
    lower.includes("403")
  );
}
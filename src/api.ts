import type {
  Camera,
  Health,
  LoginResponse,
  ProbeResult,
  PtzDirection,
  PtzPresetAction,
  PtzResult,
  ScanResult,
  SterenBridgeStatus,
  TuyaWebrtcSession,
  TelegramTarget,
  UserPublic,
} from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5050";
let authToken = "";

export function setApiToken(token: string) {
  authToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  base: API_BASE,
  login: (email: string, password: string) =>
    request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<UserPublic>("/api/auth/me"),
  logout: () =>
    request<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
    }),
  users: () => request<UserPublic[]>("/api/users"),
  createUser: (payload: { email: string; password: string; role: string; active: boolean }) =>
    request<UserPublic>("/api/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateUser: (id: number, payload: { email?: string; password?: string; role?: string; active?: boolean }) =>
    request<UserPublic>(`/api/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteUser: (id: number) =>
    request<{ ok: boolean }>(`/api/users/${id}`, {
      method: "DELETE",
    }),
  telegramTargets: () => request<TelegramTarget[]>("/api/telegram-targets"),
  createTelegramTarget: (payload: { name: string; chat_id: string; active: boolean }) =>
    request<TelegramTarget>("/api/telegram-targets", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTelegramTarget: (id: number, payload: { name?: string; chat_id?: string; active?: boolean }) =>
    request<TelegramTarget>(`/api/telegram-targets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteTelegramTarget: (id: number) =>
    request<{ ok: boolean }>(`/api/telegram-targets/${id}`, {
      method: "DELETE",
    }),
  health: () => request<Health>("/api/health"),
  scan: (subnet: string, deep: boolean) =>
    request<ScanResult[]>("/api/scan/start", {
      method: "POST",
      body: JSON.stringify({ subnet, deep }),
    }),
  cameras: () => request<Camera[]>("/api/cameras"),
  createCamera: (
    payload: Omit<
      Camera,
      | "id"
      | "status"
      | "last_error"
      | "created_at"
      | "updated_at"
      | "video_filter"
      | "dashboard_visible"
      | "dashboard_order"
      | "ai_person_detection"
      | "ai_model"
      | "ai_conf_threshold"
      | "ai_fps_limit"
      | "ai_zone_json"
      | "ai_min_presence_sec"
    > & {
      video_filter?: string;
      dashboard_visible?: boolean;
      dashboard_order?: number;
      ai_person_detection?: boolean;
      ai_model?: string;
      ai_conf_threshold?: number;
      ai_fps_limit?: number;
      ai_zone_json?: string;
      ai_min_presence_sec?: number;
    },
  ) =>
    request<Camera>("/api/cameras", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCamera: (id: number, payload: Partial<Camera>) =>
    request<Camera>(`/api/cameras/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCamera: (id: number) =>
    request<{ ok: boolean }>(`/api/cameras/${id}`, {
      method: "DELETE",
    }),
  probeCamera: (id: number) =>
    request<ProbeResult>(`/api/cameras/${id}/probe`, {
      method: "POST",
    }),
  ptzCamera: (id: number, direction: PtzDirection, speed = 4) =>
    request<PtzResult>(`/api/cameras/${id}/ptz`, {
      method: "POST",
      body: JSON.stringify({ direction, speed }),
    }),
  ptzPreset: (id: number, action: PtzPresetAction, slot: number) =>
    request<PtzResult>(`/api/cameras/${id}/ptz/preset`, {
      method: "POST",
      body: JSON.stringify({ action, slot }),
    }),
  sterenBridgeStatus: () => request<SterenBridgeStatus>("/api/steren-bridge/status"),
  sterenBridgeStart: (fps: number) =>
    request<SterenBridgeStatus>("/api/steren-bridge/start", {
      method: "POST",
      body: JSON.stringify({ fps }),
    }),
  sterenBridgeStop: () =>
    request<SterenBridgeStatus>("/api/steren-bridge/stop", {
      method: "POST",
    }),
  sterenBridgeConfig: (fps: number) =>
    request<SterenBridgeStatus>("/api/steren-bridge/config", {
      method: "POST",
      body: JSON.stringify({ fps }),
    }),
  sterenWebrtcSession: () => request<TuyaWebrtcSession>("/api/tuya/steren/webrtc-session"),
  streamUrl: (id: number) => `${API_BASE}/api/cameras/${id}/stream.m3u8`,
};

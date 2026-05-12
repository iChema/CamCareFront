export type CameraStatus = "unknown" | "online" | "offline" | "app_only" | "error";
export type CameraProtocol = "rtsp" | "mjpeg" | "snapshot" | "cloud" | "unknown";

export interface Camera {
  id: number;
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
  dashboard_visible: boolean;
  dashboard_order: number;
  ai_person_detection: boolean;
  ai_model: string;
  ai_conf_threshold: number;
  ai_fps_limit: number;
  ai_zone_json: string;
  ai_min_presence_sec: number;
  notes: string;
  status: CameraStatus;
  last_error: string;
  created_at: string;
  updated_at: string;
}

export interface ScanResult {
  host: string;
  ports: number[];
  source: string;
  score: number;
  labels: string[];
  details: Record<string, unknown>;
}

export interface Health {
  ok: boolean;
  ffmpeg: boolean;
  ffprobe: boolean;
  nmap: boolean;
  arp_scan: boolean;
}

export interface ProbeResult {
  ok: boolean;
  url: string;
  redacted_url: string;
  message: string;
  command_available: boolean;
}

export type PtzDirection = "up" | "down" | "left" | "right" | "zoom_in" | "zoom_out";
export type PtzPresetAction = "set" | "goto";

export interface PtzResult {
  ok: boolean;
  message: string;
  attempts: Record<string, unknown>[];
}

export interface TuyaIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
  ttl?: number;
}

export interface TuyaWebrtcSession {
  clientTraceId: string;
  mqtt: {
    result: {
      msid: string;
      password: string;
    };
    success: boolean;
  };
  config: {
    result: {
      auth: string;
      id: string;
      motoId: string;
      p2pConfig: {
        ices: TuyaIceServer[];
        motoId: string;
      };
      protocolVersion: string;
      supportsWebrtc: boolean;
      supportsPtz: boolean;
      videoClarity: number;
    };
    success: boolean;
  };
}

export interface SterenBridgeStatus {
  running: boolean;
  fps: number;
  max: number;
  warning_above: number;
  error?: string;
}

export interface UserPublic {
  id: number;
  email: string;
  role: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginResponse {
  token: string;
  user: UserPublic;
}

export interface TelegramTarget {
  id: number;
  name: string;
  chat_id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

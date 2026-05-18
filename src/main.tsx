import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import Hls from "hls.js";
import {
  Activity,
  Camera as CameraIcon,
  Bot,
  ExternalLink,
  Eye,
  EyeOff,
  Maximize2,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Radar,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  Video,
  Wifi,
  X,
} from "lucide-react";
import { api } from "./api";
import { setApiToken } from "./api";
import type { Camera, CameraProtocol, Health, PtzDirection, ScanResult, TelegramTarget, UserPublic } from "./types";
import { TelegramTargetsPage } from "./components/TelegramTargetsPage";
import { Panel, SectionTitle } from "./components/ui";
import { CameraCard } from "./components/CameraCard";
import "./tailwind.css";
import "./styles.css";

type CameraFormPayload = {
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

const emptyCamera: CameraFormPayload = {
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

type GlobalDefaults = Pick<
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

type DashboardFilter = "visible" | "all" | "hidden";
type DashboardSort = "custom" | "name" | "status" | "provider" | "ip" | "ai";
const CAMERA_PROVIDER_OPTIONS = ["ICSee", "O-KAM", "DVR", "Esee Cloud", "Steren", "CamCare Bridge", "Otro"] as const;

function isLikelyLocalAccess() {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  return false;
}

function HlsVideo({
  sourceUrl,
  fallbackUrl,
  authToken,
  className,
  onError,
  onHealthy,
  reloadToken,
  profile = "low",
  startDelayMs = 0,
}: {
  sourceUrl: string;
  fallbackUrl?: string;
  authToken?: string;
  className?: string;
  onError: (message: string) => void;
  onHealthy?: () => void;
  reloadToken?: number;
  profile?: "low" | "high";
  startDelayMs?: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    let hls: Hls | null = null;
    let retryTimer: number | null = null;
    let stallTimer: number | null = null;
    let retries = 0;
    let cancelled = false;
    let activeUrl = sourceUrl;
    let switchedToFallback = false;
    let lastVideoTime = 0;
    let lastAdvanceAt = Date.now();
    const scheduleRetry = () => {
      if (cancelled) return;
      if (retryTimer) return;
      retries += 1;
      const backoff = [1500, 3000, 5000, 8000, 12000];
      const waitMs = backoff[Math.min(retries - 1, backoff.length - 1)];
      onError(`Reconectando stream… intento ${retries}`);
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void start();
      }, waitMs);
    };

    const onTimeUpdate = () => {
      const t = video.currentTime;
      if (t > lastVideoTime + 0.01) {
        const hadStall = retries > 0;
        lastVideoTime = t;
        lastAdvanceAt = Date.now();
        if (hadStall) {
          retries = 0;
          onHealthy?.();
        }
      }
    };

    const onVideoStalled = () => {
      if (cancelled) return;
      // iOS Safari emits transient waiting/suspend often; only reconnect on real freeze.
      const idleMs = Date.now() - lastAdvanceAt;
      if (idleMs < 12000) return;
      onError("Stream congelado, reconectando…");
      scheduleRetry();
    };

    const cleanupPlayer = () => {
      if (retryTimer) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (stallTimer) {
        window.clearInterval(stallTimer);
        stallTimer = null;
      }
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("stalled", onVideoStalled);
      hls?.destroy();
      hls = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    const tryPlay = () => {
      void video.play().catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("interrupted by a new load request")) return;
        scheduleRetry();
      });
    };

    const start = async () => {
      if (cancelled) return;
      cleanupPlayer();
      lastVideoTime = 0;
      lastAdvanceAt = Date.now();
      video.addEventListener("timeupdate", onTimeUpdate);
      video.addEventListener("stalled", onVideoStalled);
      stallTimer = window.setInterval(() => {
        if (cancelled || video.paused) return;
        const idleMs = Date.now() - lastAdvanceAt;
        if (video.readyState >= 2 && idleMs > 12000) {
          onError("Stream congelado, reconectando…");
          scheduleRetry();
        }
      }, 4000);
      const legacyFallbackUrl = fallbackUrl || "";
      const url = activeUrl;

      if (url.includes("/api/stream.mp4")) {
        video.src = url;
        tryPlay();
        onHealthy?.();
        video.onerror = () => {
          if (legacyFallbackUrl && !switchedToFallback) {
            switchedToFallback = true;
            activeUrl = legacyFallbackUrl;
            retries = 0;
            void start();
            return;
          }
          // Fallback to legacy HLS when MP4 live stream fails.
          if (legacyFallbackUrl && switchedToFallback) {
            video.src = legacyFallbackUrl;
            tryPlay();
          }
          scheduleRetry();
        };
        return;
      }

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        tryPlay();
        onHealthy?.();
        video.onerror = () => {
          if (legacyFallbackUrl && !switchedToFallback) {
            switchedToFallback = true;
            activeUrl = legacyFallbackUrl;
            retries = 0;
            void start();
            return;
          }
          onError("Error de stream");
          scheduleRetry();
        };
        return;
      }

      if (!Hls.isSupported()) {
        onError("HLS not supported in this browser");
        return;
      }

      hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 3,
        maxBufferLength: 6,
        backBufferLength: 10,
        manifestLoadingMaxRetry: 1,
        levelLoadingMaxRetry: 1,
        fragLoadingMaxRetry: 1,
        manifestLoadingRetryDelay: 1500,
        levelLoadingRetryDelay: 1500,
        fragLoadingRetryDelay: 1500,
        xhrSetup: (xhr) => {
          if (authToken) xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
        },
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        retries = 0;
        onHealthy?.();
        tryPlay();
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (legacyFallbackUrl && !switchedToFallback) {
          switchedToFallback = true;
          activeUrl = legacyFallbackUrl;
          retries = 0;
          void start();
          return;
        }
        onError(`Stream error (${data.type})`);
        scheduleRetry();
      });
    };

    const bootTimer = window.setTimeout(() => {
      void start();
    }, Math.max(0, startDelayMs));
    return () => {
      cancelled = true;
      window.clearTimeout(bootTimer);
      cleanupPlayer();
    };
  }, [sourceUrl, fallbackUrl, authToken, reloadToken, profile, startDelayMs]);

  return <video ref={videoRef} className={className} muted playsInline controls autoPlay />;
}

function StreamTile({
  camera,
  liveTicket,
  authToken,
  reloadToken,
  startDelayMs,
  onStreamFailedChange,
  fullscreenCameraId,
  onFullscreenCameraChange,
  streamEnabled = true,
  onEnableStream,
  onDisableStream,
}: {
  camera: Camera;
  liveTicket?: string;
  authToken?: string;
  reloadToken?: number;
  startDelayMs?: number;
  onStreamFailedChange?: (cameraId: number, failed: boolean) => void;
  fullscreenCameraId: number | null;
  onFullscreenCameraChange: (cameraId: number | null) => void;
  streamEnabled?: boolean;
  onEnableStream?: (cameraId: number) => void;
  onDisableStream?: (cameraId: number) => void;
}) {
  const bridgeBaseUrl = "http://127.0.0.1:5090";
  const playing = true;
  const [bridgePlaying, setBridgePlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState("");
  const [bridgeFps, setBridgeFps] = useState(12);
  const [bridgeWarningAbove, setBridgeWarningAbove] = useState(15);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const isSterenCloud =
    camera.protocol === "cloud" &&
    (/steren/i.test(camera.name) || /ismartlife/i.test(camera.host) || /protect-us/i.test(camera.snapshot_url));
  const cloudUrl =
    camera.snapshot_url || (/^https?:\/\//i.test(camera.host) ? camera.host : "");
  const pausedByAnotherFullscreen = fullscreenCameraId !== null && fullscreenCameraId !== camera.id;
  const streamToken = liveTicket || authToken || "";
  const lowUrl = api.streamUrl(camera.id, "low", streamToken);
  const highUrl = api.streamUrl(camera.id, "high", streamToken);
  const handleStreamError = useCallback((message: string) => {
    setError(message);
  }, []);
  const handleStreamHealthy = useCallback(() => {
    setError("");
  }, []);

  useEffect(() => {
    onStreamFailedChange?.(camera.id, Boolean(error));
  }, [camera.id, error, onStreamFailedChange]);

  function openFullscreen() {
    setFullscreen(true);
    onFullscreenCameraChange(camera.id);
  }

  function closeFullscreen() {
    setFullscreen(false);
    onFullscreenCameraChange(null);
  }

  useEffect(() => {
    if (!isSterenCloud) return;
    let cancelled = false;

    async function loadBridgeConfig() {
      try {
        const data = await api.sterenBridgeStatus();
        if (cancelled) return;
        if (typeof data.fps === "number") setBridgeFps(data.fps);
        if (typeof data.warning_above === "number") setBridgeWarningAbove(data.warning_above);
      } catch {
        // keep defaults if bridge config is not reachable
      }
    }

    void loadBridgeConfig();
    return () => {
      cancelled = true;
    };
  }, [isSterenCloud]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFullscreen();
    };
    document.body.classList.add("no-scroll");
    document.body.classList.add("hide-app-header");
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("no-scroll");
      document.body.classList.remove("hide-app-header");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreen]);

  async function startBridge() {
    setBridgeBusy(true);
    setError("");
    try {
      const data = await api.sterenBridgeStart(bridgeFps);
      setBridgeFps(data.fps);
      setBridgeWarningAbove(data.warning_above);
      if (data.error || !data.running) {
        setError(data.error ?? "Steren no entrego video");
        setBridgePlaying(false);
        return;
      }
      setBridgePlaying(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo arrancar bridge Steren");
    } finally {
      setBridgeBusy(false);
    }
  }

  async function stopBridge() {
    setBridgePlaying(false);
    closeFullscreen();
    setBridgeBusy(true);
    try {
      const data = await api.sterenBridgeStop();
      setBridgeFps(data.fps);
      setBridgeWarningAbove(data.warning_above);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo apagar bridge Steren");
    } finally {
      setBridgeBusy(false);
    }
  }

  async function updateBridgeFps(next: number) {
    setBridgeBusy(true);
    setBridgeFps(next);
    try {
      const data = await api.sterenBridgeConfig(next);
      setBridgeFps(data.fps);
      setBridgeWarningAbove(data.warning_above);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar FPS");
    } finally {
      setBridgeBusy(false);
    }
  }

  const fullscreenOverlay =
    fullscreen && (playing || bridgePlaying)
      ? createPortal(
          <div
            className={`internal-fullscreen ${camera.dvr_channel ? "dvr-stretch" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={`${camera.name} fullscreen`}
          >
            <div className="internal-fullscreen-topbar">
              <div>
                <strong>{camera.name}</strong>
                <span>{isSterenCloud ? `Bridge Steren · ${bridgeFps} FPS` : `${camera.host}:${camera.port}`}</span>
              </div>
              <div className="internal-fullscreen-actions">
                {isSterenCloud && (
                  <button className="danger" onClick={() => void stopBridge()}>
                    Detener
                  </button>
                )}
                <button className="secondary" onClick={closeFullscreen}>
                  <X size={16} />
                  Cerrar
                </button>
              </div>
            </div>
            <div className="internal-fullscreen-stage">
              {isSterenCloud ? (
                <img className="fullscreen-media" src={`${bridgeBaseUrl}/stream.mjpeg`} alt={camera.name} />
              ) : (
                <HlsVideo
                  sourceUrl={highUrl}
                  fallbackUrl={lowUrl}
                  className="fullscreen-media"
                  authToken={authToken}
                  onError={handleStreamError}
                  onHealthy={handleStreamHealthy}
                  reloadToken={reloadToken}
                  profile="high"
                />
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  if (!streamEnabled) {
    return (
      <div className="stream-tile">
        <button className="stream-placeholder" onClick={() => onEnableStream?.(camera.id)} title="Activar stream">
          <Eye size={24} />
          <span>Ver live</span>
        </button>
      </div>
    );
  }

  if (camera.protocol === "cloud") {
    if (isSterenCloud) {
      if (bridgePlaying) {
        return (
          <div className="stream-tile">
            <img className="bridge-stream" src={`${bridgeBaseUrl}/stream.mjpeg`} alt={camera.name} />
            <button
              className="fullscreen-open bridge-fullscreen"
              onClick={openFullscreen}
              title="Pantalla completa interna"
            >
              <Maximize2 size={16} />
            </button>
            <button className="stream-stop" onClick={() => void stopBridge()}>
              Detener
            </button>
            <div className="stream-status">Bridge oficial Steren · {bridgeFps} FPS</div>
            <div className="bridge-fps-control">
              <label htmlFor={`steren-fps-${camera.id}`}>FPS</label>
              <select
                id={`steren-fps-${camera.id}`}
                value={bridgeFps}
                disabled={bridgeBusy}
                onChange={(event) => void updateBridgeFps(Number(event.target.value))}
              >
                {[6, 8, 10, 12, 15, 18, 24].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            {bridgeFps > bridgeWarningAbove && (
              <div className="bridge-warning">FPS arriba de {bridgeWarningAbove} puede causar tirones y alto CPU.</div>
            )}
            {fullscreenOverlay}
          </div>
        );
      }

      return (
        <div className="stream-tile">
          <div className="cloud-actions">
            <button className="stream-placeholder" disabled={bridgeBusy} onClick={() => void startBridge()}>
              <Eye size={24} />
              <span>{bridgeBusy ? "Arrancando" : "Ver live"}</span>
            </button>
            <a className="cloud-open" href={camera.snapshot_url || `https://${camera.host}`} target="_blank">
              <ExternalLink size={16} />
              Cloud
            </a>
          </div>
          {error && <div className="tile-error overlay-error">{error}</div>}
        </div>
      );
    }

    return (
      <div className="stream-tile">
        {cloudUrl ? (
          <a className="stream-placeholder cloud-link" href={cloudUrl} target="_blank">
            <ExternalLink size={24} />
            <span>Abrir cloud</span>
          </a>
        ) : (
          <button className="stream-placeholder" disabled title={camera.notes || "Cámara disponible solo en app"}>
            <ExternalLink size={24} />
            <span>App-only</span>
          </button>
        )}
      </div>
    );
  }

  if (pausedByAnotherFullscreen) {
    return (
      <div className="stream-tile">
        <button className="stream-placeholder" disabled title="Pausado mientras otra cámara está en fullscreen">
          <Eye size={24} />
          <span>Pausado por fullscreen</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`stream-tile ${camera.dvr_channel ? "dvr-stretch" : ""}`}>
      {!fullscreen ? (
        <HlsVideo
          sourceUrl={lowUrl}
          fallbackUrl={highUrl}
          className="bridge-stream"
          authToken={authToken}
          onError={handleStreamError}
          onHealthy={handleStreamHealthy}
          reloadToken={reloadToken}
          profile="low"
          startDelayMs={startDelayMs}
        />
      ) : (
        <button className="stream-placeholder" disabled>
          <Eye size={24} />
          <span>Fullscreen activo</span>
        </button>
      )}
      <button className="fullscreen-open" onClick={openFullscreen} title="Pantalla completa interna">
        <Maximize2 size={16} />
      </button>
      <button className="stream-stop" onClick={() => onDisableStream?.(camera.id)} title="Apagar stream">
        Apagar
      </button>
      {error && <div className="tile-error">{error}</div>}
      {fullscreenOverlay}
    </div>
  );
}

function HealthBar({ health }: { health: Health | null }) {
  const items = [
    ["API", health?.ok],
    ["ffmpeg", health?.ffmpeg],
    ["ffprobe", health?.ffprobe],
    ["nmap", health?.nmap],
  ];
  return (
    <div className="healthbar">
      {items.map(([label, ok]) => (
        <span className={ok ? "pill ok" : "pill warn"} key={String(label)}>
          {String(label)} {ok ? "ok" : "missing"}
        </span>
      ))}
    </div>
  );
}

function CameraForm({
  initialHost,
  defaults,
  onCreate,
}: {
  initialHost: string;
  defaults: GlobalDefaults;
  onCreate: (payload: CameraFormPayload) => Promise<void>;
}) {
  const [form, setForm] = useState({
    ...emptyCamera,
    ...defaults,
    host: initialHost,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm((current) => ({ ...current, host: initialHost }));
  }, [initialHost]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      dashboard_visible: defaults.dashboard_visible,
      dashboard_order: defaults.dashboard_order,
      ai_person_detection: defaults.ai_person_detection,
      ai_model: defaults.ai_model,
      ai_conf_threshold: defaults.ai_conf_threshold,
      ai_fps_limit: defaults.ai_fps_limit,
      ai_zone_json: defaults.ai_zone_json,
      ai_min_presence_sec: defaults.ai_min_presence_sec,
      video_filter: defaults.video_filter,
    }));
  }, [defaults]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onCreate(form);
      setForm({ ...emptyCamera, ...defaults });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="camera-form" onSubmit={submit}>
      <div className="form-grid">
        <label>
          Nombre
          <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          Ubicación
          <input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
        </label>
        <label>
          Proveedor/App
          <select value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })}>
            <option value="">Seleccionar</option>
            {CAMERA_PROVIDER_OPTIONS.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
        <label>
          Protocolo
          <select
            value={form.protocol}
            onChange={(event) => setForm({ ...form, protocol: event.target.value as CameraProtocol })}
          >
            <option value="rtsp">RTSP</option>
            <option value="mjpeg">MJPEG</option>
            <option value="snapshot">Snapshot</option>
            <option value="cloud">Cloud/web</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label>
          Host/IP
          <input required value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} />
        </label>
        <label>
          Puerto
          <input
            type="number"
            min="1"
            max="65535"
            value={form.port}
            onChange={(event) => setForm({ ...form, port: Number(event.target.value) })}
          />
        </label>
        <label>
          Canal DVR
          <input
            type="number"
            min="1"
            value={form.dvr_channel ?? ""}
            onChange={(event) =>
              setForm({ ...form, dvr_channel: event.target.value ? Number(event.target.value) : null })
            }
          />
        </label>
        <label>
          Dashboard
          <select
            value={form.dashboard_visible ? "show" : "hide"}
            onChange={(event) => setForm({ ...form, dashboard_visible: event.target.value === "show" })}
          >
            <option value="show">Mostrar</option>
            <option value="hide">Ocultar</option>
          </select>
        </label>
        <label>
          Orden
          <select
            value={form.dashboard_order}
            onChange={(event) => setForm({ ...form, dashboard_order: Number(event.target.value) })}
          >
            <option value={0}>Auto</option>
            {Array.from({ length: 30 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          IA personas
          <select
            value={form.ai_person_detection ? "yes" : "no"}
            onChange={(event) => setForm({ ...form, ai_person_detection: event.target.value === "yes" })}
          >
            <option value="no">No usar</option>
            <option value="yes">Usar</option>
          </select>
        </label>
        <label>
          Filtro video
          <select value={form.video_filter} onChange={(event) => setForm({ ...form, video_filter: event.target.value })}>
            <option value="">Ninguno</option>
            <option value="crop_top_half">Top half</option>
            <option value="crop_bottom_half">Bottom half</option>
          </select>
        </label>
        <label>
          AI FPS
          <input
            type="number"
            min="1"
            max="15"
            value={form.ai_fps_limit}
            onChange={(event) => setForm({ ...form, ai_fps_limit: Number(event.target.value) || 3 })}
          />
        </label>
        <label>
          AI conf
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={form.ai_conf_threshold}
            onChange={(event) => setForm({ ...form, ai_conf_threshold: Number(event.target.value) || 0.3 })}
          />
        </label>
        <label>
          AI presencia (s)
          <input
            type="number"
            min="0"
            max="120"
            value={form.ai_min_presence_sec}
            onChange={(event) => setForm({ ...form, ai_min_presence_sec: Number(event.target.value) || 2 })}
          />
        </label>
        <label className="wide">
          RTSP path o URL completa
          <input
            value={form.rtsp_path}
            onChange={(event) => setForm({ ...form, rtsp_path: event.target.value })}
          />
        </label>
        <label className="wide">
          AI zone json
          <input
            value={form.ai_zone_json}
            onChange={(event) => setForm({ ...form, ai_zone_json: event.target.value })}
            placeholder='[{"x":0.2,"y":0.2},{"x":0.8,"y":0.2},{"x":0.8,"y":0.9},{"x":0.2,"y":0.9}]'
          />
        </label>
        <label>
          Usuario
          <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </label>
        <label className="wide">
          Notas
          <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>
      </div>
      <button className="primary" disabled={saving} type="submit">
        <Plus size={16} />
        {saving ? "Guardando" : "Agregar cámara"}
      </button>
    </form>
  );
}

function App() {
  const [authToken, setAuthToken] = useState<string>(() => window.localStorage.getItem("camcare_auth_token") ?? "");
  const [currentUser, setCurrentUser] = useState<UserPublic | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [telegramTargets, setTelegramTargets] = useState<TelegramTarget[]>([]);
  const [showAddCameraModal, setShowAddCameraModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userModalEmail, setUserModalEmail] = useState("");
  const [userModalPassword, setUserModalPassword] = useState("");
  const [userModalRole, setUserModalRole] = useState("viewer");
  const [userModalActive, setUserModalActive] = useState(true);
  const storedDefaults =
    typeof window !== "undefined" ? window.localStorage.getItem("camcare_defaults_v1") : null;
  const parsedDefaults = storedDefaults ? (JSON.parse(storedDefaults) as Partial<GlobalDefaults>) : {};
  const [defaults, setDefaults] = useState<GlobalDefaults>({
    dashboard_visible: parsedDefaults.dashboard_visible ?? true,
    dashboard_order: parsedDefaults.dashboard_order ?? 0,
    ai_person_detection: parsedDefaults.ai_person_detection ?? false,
    ai_model: parsedDefaults.ai_model ?? "hog",
    ai_conf_threshold: parsedDefaults.ai_conf_threshold ?? 0.3,
    ai_fps_limit: parsedDefaults.ai_fps_limit ?? 3,
    ai_zone_json: parsedDefaults.ai_zone_json ?? "",
    ai_min_presence_sec: parsedDefaults.ai_min_presence_sec ?? 2,
    video_filter: parsedDefaults.video_filter ?? "",
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [screen, setScreen] = useState<"dashboard" | "scan" | "settings" | "users" | "telegram">("dashboard");
  const [health, setHealth] = useState<Health | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [selectedHost, setSelectedHost] = useState("");
  const [subnet, setSubnet] = useState("192.168.3.0/24");
  const [deep, setDeep] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [streamReloadToken, setStreamReloadToken] = useState(0);
  const [failedStreamIds, setFailedStreamIds] = useState<Record<number, boolean>>({});
  const [manualStreamingIds, setManualStreamingIds] = useState<Set<number>>(new Set());
  const [fullscreenCameraId, setFullscreenCameraId] = useState<number | null>(null);
  const [liveTicket, setLiveTicket] = useState("");
  const [liveClientId] = useState(() => `web-${Math.random().toString(36).slice(2, 10)}`);
  const [ptzSpeed, setPtzSpeed] = useState<Record<number, number>>({});
  const [ptzPreset, setPtzPreset] = useState<Record<number, number>>({});
  const [ptzVisible, setPtzVisible] = useState<Record<number, boolean>>({});
  const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>("visible");
  const [dashboardSort, setDashboardSort] = useState<DashboardSort>("custom");
  const [defaultsProviderScope, setDefaultsProviderScope] = useState<string>("ALL");
  const isPublicZrokHost = typeof window !== "undefined" && window.location.hostname === "camcare.shares.zrok.io";
  const maxParallelCameras = isPublicZrokHost ? 4 : Number.POSITIVE_INFINITY;

  useEffect(() => {
    window.localStorage.setItem("camcare_defaults_v1", JSON.stringify(defaults));
  }, [defaults]);

  useEffect(() => {
    setApiToken(authToken);
    if (authToken) {
      window.localStorage.setItem("camcare_auth_token", authToken);
    } else {
      window.localStorage.removeItem("camcare_auth_token");
    }
  }, [authToken]);

  useEffect(() => {
    const validIds = new Set(cameras.map((camera) => camera.id));
    setManualStreamingIds((current) => {
      const next = new Set(Array.from(current).filter((id) => validIds.has(id)));
      if (next.size === current.size) return current;
      return next;
    });
  }, [cameras]);

  const onlineCount = useMemo(() => cameras.filter((camera) => camera.status === "online").length, [cameras]);
  const visibleCount = useMemo(() => cameras.filter((camera) => camera.dashboard_visible).length, [cameras]);
  const aiCount = useMemo(() => cameras.filter((camera) => camera.ai_person_detection).length, [cameras]);
  const orderSlots = useMemo(() => {
    const maxOrder = cameras.reduce((max, camera) => Math.max(max, camera.dashboard_order || 0, camera.id), cameras.length);
    return Array.from({ length: Math.max(maxOrder, 30) }, (_, index) => index + 1);
  }, [cameras]);
  const dashboardCameras = useMemo(() => {
    const filtered = cameras.filter((camera) => {
      if (dashboardFilter === "visible") return camera.dashboard_visible;
      if (dashboardFilter === "hidden") return !camera.dashboard_visible;
      return true;
    });
    const byCustomOrder = (a: Camera, b: Camera) => (a.dashboard_order || a.id) - (b.dashboard_order || b.id) || a.id - b.id;
    return [...filtered].sort((a, b) => {
      if (dashboardSort === "name") return a.name.localeCompare(b.name) || byCustomOrder(a, b);
      if (dashboardSort === "status") return a.status.localeCompare(b.status) || byCustomOrder(a, b);
      if (dashboardSort === "provider") {
        return (a.provider || a.location || a.host).localeCompare(b.provider || b.location || b.host) || byCustomOrder(a, b);
      }
      if (dashboardSort === "ip") return `${a.host}:${a.port}`.localeCompare(`${b.host}:${b.port}`) || byCustomOrder(a, b);
      if (dashboardSort === "ai") return Number(b.ai_person_detection) - Number(a.ai_person_detection) || byCustomOrder(a, b);
      return byCustomOrder(a, b);
    });
  }, [cameras, dashboardFilter, dashboardSort]);
  const dashboardCamerasForStreaming = useMemo(
    () => dashboardCameras.filter((camera) => manualStreamingIds.has(camera.id)),
    [dashboardCameras, manualStreamingIds],
  );
  const activeStreamingCameras = useMemo(
    () => dashboardCamerasForStreaming.slice(0, maxParallelCameras),
    [dashboardCamerasForStreaming, maxParallelCameras],
  );
  const providerOptions = useMemo(() => {
    const values = new Set<string>();
    for (const camera of cameras) {
      const provider = (camera.provider || "").trim();
      if (provider) values.add(provider);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [cameras]);
  const isAdmin = currentUser?.role === "admin";

  async function refresh() {
    const [nextHealth, nextCameras] = await Promise.all([api.health(), api.cameras()]);
    setHealth(nextHealth);
    setCameras(nextCameras);
  }

  async function refreshAndReloadStreams() {
    await refresh();
    const hasFailures = Object.values(failedStreamIds).some(Boolean);
    if (hasFailures) setStreamReloadToken(Date.now());
  }

  useEffect(() => {
    if (!authToken) return;
    void api
      .me()
      .then((user) => setCurrentUser(user))
      .then(() => refresh())
      .catch(() => {
        setCurrentUser(null);
        setAuthToken("");
      });
  }, [authToken]);

  const activeStreamingIds = useMemo(
    () => new Set(activeStreamingCameras.map((camera) => camera.id)),
    [activeStreamingCameras],
  );

  const visibleCameraIdsKey = useMemo(
    () =>
      activeStreamingCameras
        .map((camera) => camera.id)
        .sort((a, b) => a - b)
        .join(","),
    [activeStreamingCameras],
  );

  useEffect(() => {
    if (!authToken || !currentUser) return;
    const visibleIds = activeStreamingCameras.map((camera) => camera.id);
    if (visibleIds.length === 0) return;
    let cancelled = false;
    let heartbeatTimer: number | null = null;
    let retryTimer: number | null = null;
    let currentLiveTicket = "";
    let bootstrapping = false;

    function clearHeartbeat() {
      if (heartbeatTimer) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    }

    function scheduleRetry(ms = 2_000) {
      if (cancelled || retryTimer) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void bootstrapLiveTicket();
      }, ms);
    }

    async function bootstrapLiveTicket() {
      if (cancelled || bootstrapping) return;
      bootstrapping = true;
      clearHeartbeat();
      try {
        const ticket = await api.liveTicket({
          client_id: liveClientId,
          camera_ids: visibleIds,
          preferred_transport: "mse",
        });
        if (cancelled) return;
        currentLiveTicket = ticket.live_ticket;
        setLiveTicket(currentLiveTicket);
        heartbeatTimer = window.setInterval(async () => {
          if (!currentLiveTicket || cancelled) return;
          try {
            const hb = await api.liveHeartbeat(currentLiveTicket);
            currentLiveTicket = hb.live_ticket;
            if (!cancelled) setLiveTicket(currentLiveTicket);
          } catch {
            if (cancelled) return;
            setLiveTicket("");
            currentLiveTicket = "";
            clearHeartbeat();
            scheduleRetry(1_500);
          }
        }, 30_000);
      } catch {
        if (!cancelled) {
          setLiveTicket("");
          scheduleRetry(2_500);
        }
      } finally {
        bootstrapping = false;
      }
    }

    void bootstrapLiveTicket();
    return () => {
      cancelled = true;
      clearHeartbeat();
      if (retryTimer) window.clearTimeout(retryTimer);
      void api.closeLiveSession(liveClientId).catch(() => undefined);
    };
  }, [authToken, currentUser, liveClientId, visibleCameraIdsKey]);

  async function refreshUsers() {
    if (!currentUser || currentUser.role !== "admin") return;
    const list = await api.users();
    setUsers(list);
  }

  async function refreshTelegramTargets() {
    if (!currentUser || currentUser.role !== "admin") return;
    const rows = await api.telegramTargets();
    setTelegramTargets(rows);
  }

  useEffect(() => {
    void refreshUsers();
    void refreshTelegramTargets();
  }, [currentUser]);

  async function login() {
    setAuthBusy(true);
    setMessage("");
    try {
      const res = await api.login(loginEmail.trim(), loginPassword);
      setAuthToken(res.token);
      setCurrentUser(res.user);
      setLoginPassword("");
      await refresh();
      if (res.user.role === "admin") {
        await refreshUsers();
        await refreshTelegramTargets();
      }
      setMessage(`Sesión iniciada: ${res.user.email}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "login failed");
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // ignore logout transport errors
    }
    setCurrentUser(null);
    setUsers([]);
    setAuthToken("");
  }

  function enableStream(cameraId: number) {
    setManualStreamingIds((current) => {
      const next = new Set(current);
      next.add(cameraId);
      return next;
    });
  }

  function disableStream(cameraId: number) {
    setManualStreamingIds((current) => {
      const next = new Set(current);
      next.delete(cameraId);
      return next;
    });
  }

  async function runScan() {
    setBusy("scan");
    setMessage("");
    try {
      const results = await api.scan(subnet, deep);
      setScanResults(results);
      setMessage(`${results.length} candidatos detectados`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "scan failed");
    } finally {
      setBusy("");
    }
  }

  async function createCamera(payload: CameraFormPayload) {
    await api.createCamera(payload);
    await refresh();
    setMessage("Cámara guardada");
  }

  async function applyDefaultsToAll() {
    setBusy("defaults-all");
    setMessage("");
    try {
      const providerScope = defaultsProviderScope === "ALL" ? null : defaultsProviderScope.trim().toLowerCase();
      const targetCameras = providerScope
        ? cameras.filter((camera) => (camera.provider || "").trim().toLowerCase() === providerScope)
        : cameras;
      await Promise.all(
        targetCameras.map((camera) =>
          api.updateCamera(camera.id, {
            dashboard_visible: defaults.dashboard_visible,
            ai_person_detection: defaults.ai_person_detection,
            ai_model: defaults.ai_model,
            ai_conf_threshold: defaults.ai_conf_threshold,
            ai_fps_limit: defaults.ai_fps_limit,
            ai_zone_json: defaults.ai_zone_json,
            ai_min_presence_sec: defaults.ai_min_presence_sec,
            video_filter: defaults.video_filter,
          }),
        ),
      );
      await refresh();
      setMessage(
        providerScope
          ? `Defaults aplicados a ${defaultsProviderScope} (${targetCameras.length} cámaras)`
          : "Defaults aplicados a todas las cámaras",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudieron aplicar defaults");
    } finally {
      setBusy("");
    }
  }


  function openCreateUserModal() {
    setEditingUserId(null);
    setUserModalEmail("");
    setUserModalPassword("");
    setUserModalRole("viewer");
    setUserModalActive(true);
    setShowUserModal(true);
  }

  function openEditUserModal(user: UserPublic) {
    setEditingUserId(user.id);
    setUserModalEmail(user.email);
    setUserModalPassword("");
    setUserModalRole(user.role);
    setUserModalActive(user.active);
    setShowUserModal(true);
  }

  async function saveUserModal() {
    setBusy("user-modal");
    try {
      if (editingUserId === null) {
        await api.createUser({
          email: userModalEmail.trim(),
          password: userModalPassword,
          role: userModalRole,
          active: userModalActive,
        });
        setMessage("Usuario creado");
      } else {
        const patch: { email?: string; password?: string; role?: string; active?: boolean } = {
          email: userModalEmail.trim(),
          role: userModalRole,
          active: userModalActive,
        };
        if (userModalPassword.trim()) patch.password = userModalPassword;
        await api.updateUser(editingUserId, patch);
        setMessage("Usuario actualizado");
      }
      await refreshUsers();
      setShowUserModal(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo guardar usuario");
    } finally {
      setBusy("");
    }
  }

  async function deleteUserRow(userId: number) {
    setBusy(`user-del-${userId}`);
    try {
      await api.deleteUser(userId);
      await refreshUsers();
      setMessage("Usuario eliminado");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo eliminar usuario");
    } finally {
      setBusy("");
    }
  }

  async function createTelegramTargetRow(payload: { name: string; chat_id: string; active: boolean }) {
    if (!payload.name.trim() || !payload.chat_id.trim()) {
      setMessage("Nombre y chat_id son obligatorios");
      return;
    }
    setBusy("tg-create");
    try {
      await api.createTelegramTarget({
        name: payload.name.trim(),
        chat_id: payload.chat_id.trim(),
        active: payload.active,
      });
      await refreshTelegramTargets();
      setMessage("Destino Telegram agregado");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo agregar destino Telegram");
    } finally {
      setBusy("");
    }
  }

  async function updateTelegramTargetRow(target: TelegramTarget, patch: Partial<TelegramTarget>) {
    setBusy(`tg-${target.id}`);
    try {
      await api.updateTelegramTarget(target.id, {
        name: patch.name,
        chat_id: patch.chat_id,
        active: patch.active,
      });
      await refreshTelegramTargets();
      setMessage(`Destino ${target.name} actualizado`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo actualizar destino Telegram");
    } finally {
      setBusy("");
    }
  }

  async function deleteTelegramTargetRow(target: TelegramTarget) {
    setBusy(`tg-del-${target.id}`);
    try {
      await api.deleteTelegramTarget(target.id);
      await refreshTelegramTargets();
      setMessage(`Destino ${target.name} eliminado`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo eliminar destino Telegram");
    } finally {
      setBusy("");
    }
  }

  async function updateCameraConfig(camera: Camera, patch: Partial<Camera>) {
    setBusy(`config-${camera.id}`);
    try {
      await api.updateCamera(camera.id, patch);
      await refresh();
      setMessage(`${camera.name}: configuración actualizada`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "config failed");
    } finally {
      setBusy("");
    }
  }

  async function probe(camera: Camera) {
    setBusy(`probe-${camera.id}`);
    try {
      const result = await api.probeCamera(camera.id);
      setMessage(`${camera.name}: ${result.redacted_url} -> ${result.message}`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "probe failed");
    } finally {
      setBusy("");
    }
  }

  async function remove(camera: Camera) {
    await api.deleteCamera(camera.id);
    await refresh();
  }

  async function ptz(camera: Camera, direction: PtzDirection) {
    setBusy(`ptz-${camera.id}-${direction}`);
    try {
      const speed = ptzSpeed[camera.id] ?? 4;
      const result = await api.ptzCamera(camera.id, direction, speed);
      setMessage(`${camera.name}: ${result.message}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "ptz failed");
    } finally {
      setBusy("");
    }
  }

  async function preset(camera: Camera, action: "set" | "goto") {
    const slot = ptzPreset[camera.id] ?? 1;
    setBusy(`preset-${camera.id}-${action}`);
    try {
      const result = await api.ptzPreset(camera.id, action, slot);
      setMessage(`${camera.name}: ${result.message}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "preset failed");
    } finally {
      setBusy("");
    }
  }

  function openScreen(next: "dashboard" | "scan" | "settings" | "users" | "telegram") {
    setScreen(next);
    setSidebarOpen(false);
  }

  if (!authToken || !currentUser) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <h1>CamCare Login</h1>
          <p>Ingresa con tu cuenta para acceder a cámaras y configuración.</p>
          <label>
            Email
            <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                type={showLoginPassword ? "text" : "password"}
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowLoginPassword((current) => !current)}
                title={showLoginPassword ? "Ocultar password" : "Mostrar password"}
              >
                {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <button className="primary" disabled={authBusy} onClick={() => void login()}>
            {authBusy ? "Entrando..." : "Iniciar sesión"}
          </button>
          {message && <div className="message">{message}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className={`app-shell min-h-screen ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <button className="sidebar-mobile-toggle fixed left-2.5 top-2.5 z-[70] inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-400/25 bg-slate-950/85 text-slate-200 md:hidden" onClick={() => setSidebarOpen((current) => !current)}>
        <Menu size={18} />
      </button>
      <aside className={`sidebar ${sidebarOpen ? "open" : ""} border-r border-slate-400/20 bg-slate-950/80 backdrop-blur-xl`}>
        <button className="sidebar-toggle ml-auto mb-2.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-400/25 bg-slate-900/70 text-slate-200" onClick={() => setSidebarCollapsed((current) => !current)}>
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
          <button className={screen === "dashboard" ? "active" : ""} onClick={() => openScreen("dashboard")}>
            <Video size={17} /> Dashboard
          </button>
          {isAdmin && (
            <button className={screen === "scan" ? "active" : ""} onClick={() => openScreen("scan")}>
              <Radar size={17} /> Scan LAN
            </button>
          )}
          {isAdmin && (
            <button className={screen === "users" ? "active" : ""} onClick={() => openScreen("users")}>
              <ShieldCheck size={17} /> Usuarios
            </button>
          )}
          {isAdmin && (
            <button className={screen === "telegram" ? "active" : ""} onClick={() => openScreen("telegram")}>
              <Bot size={17} /> Telegram
            </button>
          )}
          {isAdmin && (
            <button className={screen === "settings" ? "active" : ""} onClick={() => openScreen("settings")}>
              <Settings size={17} /> Configuración
            </button>
          )}
        </nav>
      </aside>

      <section className="content w-full px-4 pb-4 pt-14 md:px-7 md:pt-7">
        <header className="mb-4 grid grid-cols-1 gap-4 md:flex md:items-start md:justify-between">
          <div>
            <h1>Todas tus cámaras, una vista local.</h1>
            <p>DVR + cámaras por apps chinas, reunidas cuando expongan stream LAN.</p>
          </div>
          <div className="header-actions flex flex-wrap items-center justify-end gap-2">
            <span className="pill ok">{currentUser.email} · {currentUser.role}</span>
            {isAdmin && (
              <button className="secondary" onClick={() => setShowAddCameraModal(true)}>
                <Plus size={16} />
                Alta manual
              </button>
            )}
            <button className="secondary" onClick={() => void refreshAndReloadStreams()}>
              <RefreshCw size={16} />
              Refrescar
            </button>
            <button className="danger" onClick={() => void logout()}>
              Salir
            </button>
          </div>
        </header>

        <HealthBar health={health} />

        <section className="stats my-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
            <span>Total</span>
            <strong>{cameras.length}</strong>
          </div>
          <div className="rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
            <span>Dashboard</span>
            <strong>{visibleCount}</strong>
          </div>
          <div className="rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
            <span>Online</span>
            <strong>{onlineCount}</strong>
          </div>
          <div className="rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
            <span>IA personas</span>
            <strong>{aiCount}</strong>
          </div>
          <div className="rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
            <span>Backend</span>
            <strong>{health?.ok ? "OK" : "OFF"}</strong>
          </div>
        </section>

        {message && <div className="message">{message}</div>}

        {screen === "dashboard" ? (
          <>
            <Panel id="cameras">
          <SectionTitle title="Cámaras" meta={`${dashboardCamerasForStreaming.length} en vivo${isPublicZrokHost ? " (límite público: 4)" : ""} · ${dashboardCameras.length} visibles · ${cameras.length} totales`} />
          <div className="dashboard-controls mb-3 flex flex-wrap items-end gap-3">
            <label>
              Mostrar
              <select value={dashboardFilter} onChange={(event) => setDashboardFilter(event.target.value as DashboardFilter)}>
                <option value="visible">Solo dashboard</option>
                <option value="all">Todas</option>
                <option value="hidden">Ocultas</option>
              </select>
            </label>
            <label>
              Ordenar por
              <select value={dashboardSort} onChange={(event) => setDashboardSort(event.target.value as DashboardSort)}>
                <option value="custom">Orden custom</option>
                <option value="name">Nombre</option>
                <option value="status">Estado</option>
                <option value="provider">Proveedor</option>
                <option value="ip">IP</option>
                <option value="ai">IA personas</option>
              </select>
            </label>
          </div>
          <div className="camera-grid grid grid-cols-1 gap-3 xl:grid-cols-3">
            {dashboardCameras.map((camera) => (
              <CameraCard
                key={camera.id}
                camera={camera}
                isAdmin={isAdmin}
                busy={busy}
                orderSlots={orderSlots}
                ptzVisible={ptzVisible}
                ptzSpeed={ptzSpeed}
                ptzPreset={ptzPreset}
                onTogglePtzVisible={(cameraId) => setPtzVisible((prev) => ({ ...prev, [cameraId]: !prev[cameraId] }))}
                onSetPtzSpeed={(cameraId, speed) => setPtzSpeed((prev) => ({ ...prev, [cameraId]: speed }))}
                onSetPtzPreset={(cameraId, slot) => setPtzPreset((prev) => ({ ...prev, [cameraId]: slot }))}
                onUpdateCameraConfig={updateCameraConfig}
                onPtz={ptz}
                onPreset={preset}
                onProbe={probe}
                onRemove={remove}
                streamTile={
                  <StreamTile
                    camera={camera}
                    liveTicket={liveTicket}
                    authToken={authToken}
                    streamEnabled={activeStreamingIds.has(camera.id)}
                    onEnableStream={enableStream}
                    onDisableStream={disableStream}
                    reloadToken={failedStreamIds[camera.id] ? streamReloadToken : undefined}
                    startDelayMs={Math.min(4000, ((camera.dashboard_order || camera.id) % 20) * 250)}
                    onStreamFailedChange={(cameraId, failed) =>
                      setFailedStreamIds((prev) => ({ ...prev, [cameraId]: failed }))
                    }
                    fullscreenCameraId={fullscreenCameraId}
                    onFullscreenCameraChange={setFullscreenCameraId}
                  />
                }
              />
            ))}
            {dashboardCameras.length === 0 && (
              <div className="empty">
                <Wifi size={30} />
                <p>Sin cámaras para este filtro. Cambia Mostrar o agrega otra cámara.</p>
              </div>
            )}
          </div>
            </Panel>

          </>
        ) : screen === "scan" ? (
          isAdmin ? (
            <section id="scan" className="panel split my-4 rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
              <div>
                <div className="section-title mb-3 flex items-center justify-between gap-4">
                  <h2>Scan LAN</h2>
                  <span>{scanResults.length} resultados</span>
                </div>
                <div className="scan-controls">
                  <input value={subnet} onChange={(event) => setSubnet(event.target.value)} />
                  <label className="checkbox">
                    <input checked={deep} onChange={(event) => setDeep(event.target.checked)} type="checkbox" />
                    Deep
                  </label>
                  <button className="primary" disabled={busy === "scan"} onClick={() => void runScan()}>
                    <Radar size={16} />
                    {busy === "scan" ? "Escaneando" : "Scan LAN"}
                  </button>
                </div>
                <div className="results">
                  {scanResults.map((result) => (
                    <button className="result-row" key={result.host} onClick={() => setSelectedHost(result.host)}>
                      <strong>{result.host}</strong>
                      <span>{result.ports.join(", ")}</span>
                      <small>{result.labels.join(" / ") || "device"}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="scan-help">
                <h3>Rutas rápidas DVR</h3>
                <code>/Streaming/Channels/101</code>
                <code>/Streaming/Channels/102</code>
                <code>/cam/realmonitor?channel=1&amp;subtype=0</code>
                <p>Para cámaras de app: activa RTSP/ONVIF en la app o admin web si existe.</p>
              </div>
            </section>
          ) : (
            <section className="panel my-4 rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
              <div className="empty">
                <p>No autorizado.</p>
              </div>
            </section>
          )
        ) : screen === "users" ? (
          isAdmin ? (
            <Panel id="users">
              <SectionTitle title="Usuarios y perfiles" meta={`${users.length} usuarios`} />
              <div className="actions">
                <button className="secondary" onClick={() => openCreateUserModal()}>
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
                            openEditUserModal(user);
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
          ) : (
            <section className="panel my-4 rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
              <div className="empty">
                <p>No autorizado.</p>
              </div>
            </section>
          )
        ) : screen === "telegram" ? (
          isAdmin ? (
            <TelegramTargetsPage
              telegramTargets={telegramTargets}
              busy={busy}
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
        ) : isAdmin ? (
          <Panel id="settings">
            <SectionTitle title="Configuración" meta={`${cameras.length} cámaras`} />
            <div className="settings-layout">
              <div className="settings-defaults">
                <h3>Defaults globales</h3>
                <div className="form-grid settings-grid">
                  <label>
                    Dashboard default
                    <select
                      value={defaults.dashboard_visible ? "show" : "hide"}
                      onChange={(event) =>
                        setDefaults((current) => ({ ...current, dashboard_visible: event.target.value === "show" }))
                      }
                    >
                      <option value="show">Mostrar</option>
                      <option value="hide">Ocultar</option>
                    </select>
                  </label>
                  <label>
                    Orden default
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      value={defaults.dashboard_order}
                      onChange={(event) =>
                        setDefaults((current) => ({ ...current, dashboard_order: Number(event.target.value) || 0 }))
                      }
                    />
                  </label>
                  <label>
                    IA personas default
                    <select
                      value={defaults.ai_person_detection ? "yes" : "no"}
                      onChange={(event) =>
                        setDefaults((current) => ({ ...current, ai_person_detection: event.target.value === "yes" }))
                      }
                    >
                      <option value="no">No</option>
                      <option value="yes">Sí</option>
                    </select>
                  </label>
                  <label>
                    Video filter default
                    <select
                      value={defaults.video_filter}
                      onChange={(event) => setDefaults((current) => ({ ...current, video_filter: event.target.value }))}
                    >
                      <option value="">Ninguno</option>
                      <option value="crop_top_half">Top half</option>
                      <option value="crop_bottom_half">Bottom half</option>
                    </select>
                  </label>
                  <label>
                    AI model default
                    <input
                      value={defaults.ai_model}
                      onChange={(event) => setDefaults((current) => ({ ...current, ai_model: event.target.value }))}
                    />
                  </label>
                  <label>
                    AI conf default
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={defaults.ai_conf_threshold}
                      onChange={(event) =>
                        setDefaults((current) => ({ ...current, ai_conf_threshold: Number(event.target.value) || 0.3 }))
                      }
                    />
                  </label>
                  <label>
                    AI fps default
                    <input
                      type="number"
                      min="1"
                      max="15"
                      value={defaults.ai_fps_limit}
                      onChange={(event) =>
                        setDefaults((current) => ({ ...current, ai_fps_limit: Number(event.target.value) || 3 }))
                      }
                    />
                  </label>
                  <label>
                    AI min presencia default (s)
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={defaults.ai_min_presence_sec}
                      onChange={(event) =>
                        setDefaults((current) => ({ ...current, ai_min_presence_sec: Number(event.target.value) || 2 }))
                      }
                    />
                  </label>
                  <label className="wide">
                    AI zone default (json)
                    <input
                      value={defaults.ai_zone_json}
                      onChange={(event) => setDefaults((current) => ({ ...current, ai_zone_json: event.target.value }))}
                    />
                  </label>
                  <label>
                    Aplicar sobre proveedor
                    <select value={defaultsProviderScope} onChange={(event) => setDefaultsProviderScope(event.target.value)}>
                      <option value="ALL">Todos</option>
                      {providerOptions.map((provider) => (
                        <option key={provider} value={provider}>
                          {provider}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="actions">
                  <button className="secondary" disabled={busy === "defaults-all"} onClick={() => void applyDefaultsToAll()}>
                    {defaultsProviderScope === "ALL"
                      ? "Aplicar defaults a todas"
                      : `Aplicar defaults a ${defaultsProviderScope}`}
                  </button>
                </div>
              </div>
              <div className="settings-cameras">
                <h3>Configuración individual por cámara</h3>
                <div className="settings-camera-list">
                  {cameras.map((camera) => (
                    <article className="camera-card settings-camera-card" key={`settings-${camera.id}`}>
                      <div className="camera-meta">
                        <div>
                          <h3>{camera.name}</h3>
                          <p>{camera.host}:{camera.port}</p>
                        </div>
                        <span className={`status ${camera.protocol === "cloud" ? "app_only" : camera.status}`}>
                          {camera.protocol === "cloud" ? "cloud" : camera.status}
                        </span>
                      </div>
                      <div className="form-grid settings-grid">
                        <label>Nombre<input value={camera.name} onChange={(event) => void updateCameraConfig(camera, { name: event.target.value })} /></label>
                        <label>Ubicación<input value={camera.location} onChange={(event) => void updateCameraConfig(camera, { location: event.target.value })} /></label>
                        <label>
                          Proveedor
                          <select value={camera.provider} onChange={(event) => void updateCameraConfig(camera, { provider: event.target.value })}>
                            <option value="">Seleccionar</option>
                            {CAMERA_PROVIDER_OPTIONS.map((provider) => (
                              <option key={provider} value={provider}>
                                {provider}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>Host<input value={camera.host} onChange={(event) => void updateCameraConfig(camera, { host: event.target.value })} /></label>
                        <label>Puerto<input type="number" min="1" max="65535" value={camera.port} onChange={(event) => void updateCameraConfig(camera, { port: Number(event.target.value) || camera.port })} /></label>
                        <label>Protocolo
                          <select value={camera.protocol} onChange={(event) => void updateCameraConfig(camera, { protocol: event.target.value as CameraProtocol })}>
                            <option value="rtsp">RTSP</option><option value="mjpeg">MJPEG</option><option value="snapshot">Snapshot</option><option value="cloud">Cloud</option><option value="unknown">Unknown</option>
                          </select>
                        </label>
                        <label>Usuario<input value={camera.username} onChange={(event) => void updateCameraConfig(camera, { username: event.target.value })} /></label>
                        <label>Password<input type="password" value={camera.password} onChange={(event) => void updateCameraConfig(camera, { password: event.target.value })} /></label>
                        <label>Filtro video
                          <select value={camera.video_filter} onChange={(event) => void updateCameraConfig(camera, { video_filter: event.target.value })}>
                            <option value="">Ninguno</option><option value="crop_top_half">Top half</option><option value="crop_bottom_half">Bottom half</option>
                          </select>
                        </label>
                        <label>Substream
                          <select value={camera.use_substream ? "yes" : "no"} onChange={(event) => void updateCameraConfig(camera, { use_substream: event.target.value === "yes" })}>
                            <option value="no">No</option><option value="yes">Sí</option>
                          </select>
                        </label>
                        <label>Dashboard
                          <select value={camera.dashboard_visible ? "show" : "hide"} onChange={(event) => void updateCameraConfig(camera, { dashboard_visible: event.target.value === "show" })}>
                            <option value="show">Mostrar</option><option value="hide">Ocultar</option>
                          </select>
                        </label>
                        <label>Orden<input type="number" min="0" max="10000" value={camera.dashboard_order} onChange={(event) => void updateCameraConfig(camera, { dashboard_order: Number(event.target.value) || 0 })} /></label>
                        <label>IA personas
                          <select value={camera.ai_person_detection ? "yes" : "no"} onChange={(event) => void updateCameraConfig(camera, { ai_person_detection: event.target.value === "yes" })}>
                            <option value="no">No</option><option value="yes">Sí</option>
                          </select>
                        </label>
                        <label>AI model<input value={camera.ai_model} onChange={(event) => void updateCameraConfig(camera, { ai_model: event.target.value })} /></label>
                        <label>AI conf<input type="number" min="0" max="1" step="0.05" value={camera.ai_conf_threshold} onChange={(event) => void updateCameraConfig(camera, { ai_conf_threshold: Number(event.target.value) || 0.3 })} /></label>
                        <label>AI fps<input type="number" min="1" max="15" value={camera.ai_fps_limit} onChange={(event) => void updateCameraConfig(camera, { ai_fps_limit: Number(event.target.value) || 3 })} /></label>
                        <label>AI min presencia<input type="number" min="0" max="120" value={camera.ai_min_presence_sec} onChange={(event) => void updateCameraConfig(camera, { ai_min_presence_sec: Number(event.target.value) || 2 })} /></label>
                        <label>Canal DVR<input type="number" min="1" max="128" value={camera.dvr_channel ?? ""} onChange={(event) => void updateCameraConfig(camera, { dvr_channel: event.target.value ? Number(event.target.value) : null })} /></label>
                        <label className="wide">RTSP path<input value={camera.rtsp_path} onChange={(event) => void updateCameraConfig(camera, { rtsp_path: event.target.value })} /></label>
                        <label className="wide">Snapshot URL<input value={camera.snapshot_url} onChange={(event) => void updateCameraConfig(camera, { snapshot_url: event.target.value })} /></label>
                        <label className="wide">AI zone json<input value={camera.ai_zone_json} onChange={(event) => void updateCameraConfig(camera, { ai_zone_json: event.target.value })} /></label>
                        <label className="wide">Notas<input value={camera.notes} onChange={(event) => void updateCameraConfig(camera, { notes: event.target.value })} /></label>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        ) : (
          <section className="panel my-4 rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
            <div className="empty">
              <p>No autorizado.</p>
            </div>
          </section>
        )}
        {isAdmin && showUserModal && (
          <div className="modal-backdrop" role="presentation" onClick={() => setShowUserModal(false)}>
            <div className="modal-card" role="dialog" aria-modal="true" aria-label="Usuario" onClick={(event) => event.stopPropagation()}>
              <div className="section-title mb-3 flex items-center justify-between gap-4">
                <h2>{editingUserId === null ? "Agregar usuario" : `Editar usuario #${editingUserId}`}</h2>
                <button className="secondary" onClick={() => setShowUserModal(false)}>
                  <X size={14} />
                  Cerrar
                </button>
              </div>
              <div className="form-grid settings-grid">
                <label>
                  Email
                  <input value={userModalEmail} onChange={(event) => setUserModalEmail(event.target.value)} />
                </label>
                <label>
                  Password {editingUserId !== null && <small>(opcional)</small>}
                  <input
                    type="password"
                    value={userModalPassword}
                    onChange={(event) => setUserModalPassword(event.target.value)}
                    disabled={editingUserId === 1}
                  />
                </label>
                <label>
                  Rol
                  <select
                    value={userModalRole}
                    onChange={(event) => setUserModalRole(event.target.value)}
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
                    onChange={(event) => setUserModalActive(event.target.value === "yes")}
                    disabled={editingUserId === 1}
                  >
                    <option value="yes">Sí</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>
              <div className="actions">
                <button className="secondary" disabled={busy === "user-modal" || editingUserId === 1} onClick={() => void saveUserModal()}>
                  Guardar
                </button>
                {editingUserId !== null && (
                  <button
                    className="danger"
                    disabled={busy === `user-del-${editingUserId}` || editingUserId === currentUser.id || editingUserId === 1}
                    onClick={() => void deleteUserRow(editingUserId)}
                  >
                    Eliminar
                  </button>
                )}
              </div>
              {editingUserId === 1 && <div className="message">El primer admin no se puede editar.</div>}
            </div>
          </div>
        )}
        {isAdmin && showAddCameraModal && (
          <div className="modal-backdrop" role="presentation" onClick={() => setShowAddCameraModal(false)}>
            <div className="modal-card" role="dialog" aria-modal="true" aria-label="Alta manual" onClick={(event) => event.stopPropagation()}>
              <div className="section-title mb-3 flex items-center justify-between gap-4">
                <h2>Alta manual</h2>
                <button className="secondary" onClick={() => setShowAddCameraModal(false)}>
                  <X size={14} />
                  Cerrar
                </button>
              </div>
              <CameraForm initialHost={selectedHost} defaults={defaults} onCreate={createCamera} />
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

/**
 * StreamTile — tile de stream de cámara con overlay UI y fullscreen interno.
 *
 * Extraído de main.tsx (P3 frontend). Sin cambios de comportamiento.
 * Envuelve HlsVideo y maneja:
 *  - Cámaras cloud (Steren bridge MJPEG + otras cloud app-only)
 *  - Fullscreen interno vía portal (con pausa de otros tiles)
 *  - Opt-in manual de streaming (Ver live / Apagar)
 *  - Reporte de fallos al padre vía onStreamFailedChange
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Eye, Maximize2, X } from "lucide-react";
import { api } from "../api";
import type { Camera } from "../types";
import { HlsVideo } from "./HlsVideo";

type Props = {
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
};

export function StreamTile({
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
}: Props) {
  const bridgeBaseUrl = "http://127.0.0.1:5090";
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
    fullscreen && bridgePlaying
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
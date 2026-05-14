import { Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bot, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import type { ReactNode } from "react";
import type { Camera, PtzDirection } from "../types";

type Props = {
  camera: Camera;
  isAdmin: boolean;
  busy: string;
  orderSlots: number[];
  ptzVisible: Record<number, boolean>;
  ptzSpeed: Record<number, number>;
  ptzPreset: Record<number, number>;
  onTogglePtzVisible: (cameraId: number) => void;
  onSetPtzSpeed: (cameraId: number, speed: number) => void;
  onSetPtzPreset: (cameraId: number, slot: number) => void;
  onUpdateCameraConfig: (camera: Camera, patch: Partial<Camera>) => Promise<void>;
  onPtz: (camera: Camera, direction: PtzDirection) => Promise<void>;
  onPreset: (camera: Camera, action: "set" | "goto") => Promise<void>;
  onProbe: (camera: Camera) => Promise<void>;
  onRemove: (camera: Camera) => Promise<void>;
  streamTile: ReactNode;
};

export function CameraCard({
  camera,
  isAdmin,
  busy,
  orderSlots,
  ptzVisible,
  ptzSpeed,
  ptzPreset,
  onTogglePtzVisible,
  onSetPtzSpeed,
  onSetPtzPreset,
  onUpdateCameraConfig,
  onPtz,
  onPreset,
  onProbe,
  onRemove,
  streamTile,
}: Props) {
  return (
    <article className="camera-card">
      {streamTile}
      <div className="camera-meta">
        <div>
          <h3>{camera.name}</h3>
          <p>{camera.location || camera.provider || camera.host}</p>
        </div>
        <span className={`status ${camera.protocol === "cloud" ? "app_only" : camera.status}`}>
          {camera.protocol === "cloud" ? "cloud" : camera.status}
        </span>
      </div>
      <div className="camera-detail">
        {isAdmin ? (
          <>
            <span>{camera.host}:{camera.port}</span>
            <span>{camera.protocol === "cloud" ? camera.snapshot_url : camera.rtsp_path}</span>
          </>
        ) : (
          <span>{camera.location || camera.provider || "Cámara"}</span>
        )}
      </div>
      {isAdmin && (
        <div className="camera-config">
          <label>
            Dashboard
            <select
              value={camera.dashboard_visible ? "show" : "hide"}
              disabled={busy === `config-${camera.id}`}
              onChange={(event) => void onUpdateCameraConfig(camera, { dashboard_visible: event.target.value === "show" })}
            >
              <option value="show">Mostrar</option>
              <option value="hide">Ocultar</option>
            </select>
          </label>
          <label>
            Orden
            <select
              value={camera.dashboard_order || camera.id}
              disabled={busy === `config-${camera.id}`}
              onChange={(event) => void onUpdateCameraConfig(camera, { dashboard_order: Number(event.target.value) })}
            >
              {orderSlots.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Substream
            <select
              value={camera.use_substream ? "yes" : "no"}
              disabled={busy === `config-${camera.id}`}
              onChange={(event) => void onUpdateCameraConfig(camera, { use_substream: event.target.value === "yes" })}
            >
              <option value="no">No</option>
              <option value="yes">Sí</option>
            </select>
          </label>
          <label>
            IA personas
            <select
              value={camera.ai_person_detection ? "yes" : "no"}
              disabled={busy === `config-${camera.id}`}
              onChange={(event) => void onUpdateCameraConfig(camera, { ai_person_detection: event.target.value === "yes" })}
            >
              <option value="no">No</option>
              <option value="yes">Sí</option>
            </select>
          </label>
          {camera.ai_person_detection && (
            <span className="ai-badge">
              <Bot size={14} />
              IA
            </span>
          )}
        </div>
      )}
      {isAdmin && camera.protocol !== "cloud" && (
        <>
          <div className="actions">
            <button className="secondary" onClick={() => onTogglePtzVisible(camera.id)}>
              {ptzVisible[camera.id] ? "Ocultar controles" : "Mostrar controles"}
            </button>
          </div>
          {ptzVisible[camera.id] && (
            <>
              <div className="ptz-grid">
                <button className="secondary ptz-btn" disabled={busy.startsWith(`ptz-${camera.id}-`)} onClick={() => void onPtz(camera, "up")} title="PTZ arriba"><ArrowUp size={15} /></button>
                <button className="secondary ptz-btn" disabled={busy.startsWith(`ptz-${camera.id}-`)} onClick={() => void onPtz(camera, "zoom_in")} title="Zoom +"><ZoomIn size={15} /></button>
                <button className="secondary ptz-btn" disabled={busy.startsWith(`ptz-${camera.id}-`)} onClick={() => void onPtz(camera, "left")} title="PTZ izquierda"><ArrowLeft size={15} /></button>
                <button className="secondary ptz-btn" disabled={busy.startsWith(`ptz-${camera.id}-`)} onClick={() => void onPtz(camera, "right")} title="PTZ derecha"><ArrowRight size={15} /></button>
                <button className="secondary ptz-btn" disabled={busy.startsWith(`ptz-${camera.id}-`)} onClick={() => void onPtz(camera, "down")} title="PTZ abajo"><ArrowDown size={15} /></button>
                <button className="secondary ptz-btn" disabled={busy.startsWith(`ptz-${camera.id}-`)} onClick={() => void onPtz(camera, "zoom_out")} title="Zoom -"><ZoomOut size={15} /></button>
              </div>
              <div className="ptz-config">
                <label>
                  Velocidad
                  <input type="number" min="1" max="8" value={ptzSpeed[camera.id] ?? 4} onChange={(event) => onSetPtzSpeed(camera.id, Number(event.target.value) || 4)} />
                </label>
                <label>
                  Preset
                  <input type="number" min="1" max="255" value={ptzPreset[camera.id] ?? 1} onChange={(event) => onSetPtzPreset(camera.id, Number(event.target.value) || 1)} />
                </label>
                <button className="secondary" disabled={busy.startsWith(`preset-${camera.id}-`)} onClick={() => void onPreset(camera, "set")} title="Guardar preset">Guardar</button>
                <button className="secondary" disabled={busy.startsWith(`preset-${camera.id}-`)} onClick={() => void onPreset(camera, "goto")} title="Ir a preset">Ir</button>
              </div>
            </>
          )}
        </>
      )}
      {isAdmin && camera.last_error && camera.protocol !== "cloud" && <div className="tile-error">{camera.last_error}</div>}
      {isAdmin && (
        <div className="actions">
          <button className="secondary" disabled={busy === `probe-${camera.id}`} onClick={() => void onProbe(camera)}>
            <Activity size={15} /> Probar
          </button>
          <button className="danger" onClick={() => void onRemove(camera)}>
            <Trash2 size={15} /> Borrar
          </button>
        </div>
      )}
    </article>
  );
}

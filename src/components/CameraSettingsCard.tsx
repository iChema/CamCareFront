/**
 * CameraSettingsCard — formulario de configuración individual por cámara.
 *
 * Extraído de main.tsx para:
 *  - Evitar ametrallar la API en cada tecla (debounce + botón Guardar).
 *  - Tener estado local de formulario (no pisa la API hasta commit).
 *  - Eliminar ~200 líneas de inputs inline duplicados.
 */
import { useEffect, useState } from "react";
import { Camera, CameraProtocol } from "../types";
import { CAMERA_PROVIDER_OPTIONS } from "../constants";

interface Props {
  camera: Camera;
  onSave: (camera: Camera, patch: Partial<Camera>) => Promise<void>;
}

export function CameraSettingsCard({ camera, onSave }: Props) {
  // Estado local del formulario — no toca la API hasta Guardar.
  const [form, setForm] = useState<Camera>(camera);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");

  // Si la cámara cambia externamente (refresh), resync solo si no hay edits pendientes.
  useEffect(() => {
    if (!dirty) setForm(camera);
  }, [camera, dirty]);

  function update<K extends keyof Camera>(key: K, value: Camera[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setError("");
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      // Enviar solo los campos que cambiaron.
      const patch: Partial<Camera> = {};
      (Object.keys(form) as (keyof Camera)[]).forEach((key) => {
        if (form[key] !== camera[key]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (patch as any)[key] = form[key];
        }
      });
      if (Object.keys(patch).length > 0) {
        await onSave(camera, patch);
      }
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="camera-card settings-camera-card">
      <div className="camera-meta">
        <div>
          <h3>{form.name}</h3>
          <p>{form.host}:{form.port}</p>
        </div>
        <span className={`status ${form.protocol === "cloud" ? "app_only" : form.status}`}>
          {form.protocol === "cloud" ? "cloud" : form.status}
        </span>
      </div>
      <div className="form-grid settings-grid">
        <label>Nombre<input value={form.name} onChange={(e) => update("name", e.target.value)} /></label>
        <label>Ubicación<input value={form.location} onChange={(e) => update("location", e.target.value)} /></label>
        <label>
          Proveedor
          <select value={form.provider} onChange={(e) => update("provider", e.target.value)}>
            <option value="">Seleccionar</option>
            {CAMERA_PROVIDER_OPTIONS.map((provider) => (
              <option key={provider} value={provider}>{provider}</option>
            ))}
          </select>
        </label>
        <label>Host<input value={form.host} onChange={(e) => update("host", e.target.value)} /></label>
        <label>Puerto<input type="number" min="1" max="65535" value={form.port} onChange={(e) => update("port", Number(e.target.value) || form.port)} /></label>
        <label>
          Protocolo
          <select value={form.protocol} onChange={(e) => update("protocol", e.target.value as CameraProtocol)}>
            <option value="rtsp">RTSP</option><option value="mjpeg">MJPEG</option><option value="snapshot">Snapshot</option><option value="cloud">Cloud</option><option value="unknown">Unknown</option>
          </select>
        </label>
        <label>Usuario<input value={form.username} onChange={(e) => update("username", e.target.value)} /></label>
        <label>Password<input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} /></label>
        <label>
          Filtro video
          <select value={form.video_filter} onChange={(e) => update("video_filter", e.target.value)}>
            <option value="">Ninguno</option><option value="crop_top_half">Top half</option><option value="crop_bottom_half">Bottom half</option>
          </select>
        </label>
        <label>
          Substream
          <select value={form.use_substream ? "yes" : "no"} onChange={(e) => update("use_substream", e.target.value === "yes")}>
            <option value="no">No</option><option value="yes">Sí</option>
          </select>
        </label>
        <label>
          Dashboard
          <select value={form.dashboard_visible ? "show" : "hide"} onChange={(e) => update("dashboard_visible", e.target.value === "show")}>
            <option value="show">Mostrar</option><option value="hide">Ocultar</option>
          </select>
        </label>
        <label>Orden<input type="number" min="0" max="10000" value={form.dashboard_order} onChange={(e) => update("dashboard_order", Number(e.target.value) || 0)} /></label>
        <label>
          IA personas
          <select value={form.ai_person_detection ? "yes" : "no"} onChange={(e) => update("ai_person_detection", e.target.value === "yes")}>
            <option value="no">No</option><option value="yes">Sí</option>
          </select>
        </label>
        <label>AI model<input value={form.ai_model} onChange={(e) => update("ai_model", e.target.value)} /></label>
        <label>AI conf<input type="number" min="0" max="1" step="0.05" value={form.ai_conf_threshold} onChange={(e) => update("ai_conf_threshold", Number(e.target.value) || 0.3)} /></label>
        <label>AI fps<input type="number" min="1" max="15" value={form.ai_fps_limit} onChange={(e) => update("ai_fps_limit", Number(e.target.value) || 3)} /></label>
        <label>AI min presencia<input type="number" min="0" max="120" value={form.ai_min_presence_sec} onChange={(e) => update("ai_min_presence_sec", Number(e.target.value) || 2)} /></label>
        <label>Canal DVR<input type="number" min="1" max="128" value={form.dvr_channel ?? ""} onChange={(e) => update("dvr_channel", e.target.value ? Number(e.target.value) : null)} /></label>
        <label className="wide">RTSP path<input value={form.rtsp_path} onChange={(e) => update("rtsp_path", e.target.value)} /></label>
        <label className="wide">Snapshot URL<input value={form.snapshot_url} onChange={(e) => update("snapshot_url", e.target.value)} /></label>
        <label className="wide">AI zone json<input value={form.ai_zone_json} onChange={(e) => update("ai_zone_json", e.target.value)} /></label>
        <label className="wide">Notas<input value={form.notes} onChange={(e) => update("notes", e.target.value)} /></label>
      </div>
      <div className="settings-card-actions">
        {error && <span className="settings-error">{error}</span>}
        <button
          className={dirty ? "primary" : "secondary"}
          disabled={!dirty || saving}
          onClick={() => void handleSave()}
        >
          {saving ? "Guardando…" : dirty ? "Guardar cambios" : "Sin cambios"}
        </button>
      </div>
    </article>
  );
}
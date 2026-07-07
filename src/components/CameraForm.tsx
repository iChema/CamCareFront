/**
 * CameraForm — formulario de alta manual de cámara.
 *
 * Extraído de main.tsx (P3 frontend). Sin cambios de comportamiento.
 * Recibe defaults globales y el host pre-seleccionado desde el escaneo.
 */
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { CAMERA_PROVIDER_OPTIONS } from "../constants";
import {
  type CameraFormPayload,
  type GlobalDefaults,
  emptyCamera,
} from "../appTypes";
import type { CameraProtocol } from "../types";

type Props = {
  initialHost: string;
  defaults: GlobalDefaults;
  onCreate: (payload: CameraFormPayload) => Promise<void>;
};

export function CameraForm({ initialHost, defaults, onCreate }: Props) {
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
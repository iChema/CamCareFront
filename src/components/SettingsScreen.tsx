/**
 * SettingsScreen — configuración global (defaults) + individual por cámara.
 *
 * Extraído de main.tsx. La sección individual usa CameraSettingsCard (ya
 * extraído). Aquí queda el contenedor con los defaults globales y el scope
 * por proveedor. El estado `defaults`/`defaultsProviderScope` vive en App;
 * este componente recibe los valores y los setters/callbacks.
 */
import type { Camera } from "../types";
import type { GlobalDefaults } from "../appTypes";
import { CameraSettingsCard } from "./CameraSettingsCard";
import { Panel, SectionTitle } from "./ui";

type Props = {
  isAdmin: boolean;
  busy: string;
  cameras: Camera[];
  defaults: GlobalDefaults;
  defaultsProviderScope: string;
  providerOptions: string[];
  onDefaultsChange: (updater: (current: GlobalDefaults) => GlobalDefaults) => void;
  onProviderScopeChange: (scope: string) => void;
  onApplyDefaultsToAll: () => void;
  onUpdateCameraConfig: (camera: Camera, patch: Partial<Camera>) => Promise<void>;
};

export function SettingsScreen({
  isAdmin,
  busy,
  cameras,
  defaults,
  defaultsProviderScope,
  providerOptions,
  onDefaultsChange,
  onProviderScopeChange,
  onApplyDefaultsToAll,
  onUpdateCameraConfig,
}: Props) {
  if (!isAdmin) {
    return (
      <section className="panel my-4 rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
        <div className="empty">
          <p>No autorizado.</p>
        </div>
      </section>
    );
  }
  return (
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
                  onDefaultsChange((current) => ({ ...current, dashboard_visible: event.target.value === "show" }))
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
                  onDefaultsChange((current) => ({ ...current, dashboard_order: Number(event.target.value) || 0 }))
                }
              />
            </label>
            <label>
              IA personas default
              <select
                value={defaults.ai_person_detection ? "yes" : "no"}
                onChange={(event) =>
                  onDefaultsChange((current) => ({ ...current, ai_person_detection: event.target.value === "yes" }))
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
                onChange={(event) => onDefaultsChange((current) => ({ ...current, video_filter: event.target.value }))}
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
                onChange={(event) => onDefaultsChange((current) => ({ ...current, ai_model: event.target.value }))}
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
                  onDefaultsChange((current) => ({ ...current, ai_conf_threshold: Number(event.target.value) || 0.3 }))
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
                  onDefaultsChange((current) => ({ ...current, ai_fps_limit: Number(event.target.value) || 3 }))
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
                  onDefaultsChange((current) => ({ ...current, ai_min_presence_sec: Number(event.target.value) || 2 }))
                }
              />
            </label>
            <label className="wide">
              AI zone default (json)
              <input
                value={defaults.ai_zone_json}
                onChange={(event) => onDefaultsChange((current) => ({ ...current, ai_zone_json: event.target.value }))}
              />
            </label>
            <label>
              Aplicar sobre proveedor
              <select value={defaultsProviderScope} onChange={(event) => onProviderScopeChange(event.target.value)}>
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
            <button className="secondary" disabled={busy === "defaults-all"} onClick={onApplyDefaultsToAll}>
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
              <CameraSettingsCard key={`settings-${camera.id}`} camera={camera} onSave={onUpdateCameraConfig} />
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
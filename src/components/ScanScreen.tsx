/**
 * ScanScreen — formulario de subnet + resultados del escaneo LAN.
 *
 * Extraído de main.tsx. Recibe subnet/deep/scanResults como props; la acción
 * runScan y el setSelectedHost viven en App. Incluye el wrapper "No autorizado"
 * para usuarios no admin.
 */
import { Radar } from "lucide-react";
import type { ScanResult } from "../types";

type Props = {
  isAdmin: boolean;
  busy: string;
  scanResults: ScanResult[];
  subnet: string;
  deep: boolean;
  onSubnetChange: (value: string) => void;
  onDeepChange: (value: boolean) => void;
  onRunScan: () => void;
  onSelectHost: (host: string) => void;
};

export function ScanScreen({
  isAdmin,
  busy,
  scanResults,
  subnet,
  deep,
  onSubnetChange,
  onDeepChange,
  onRunScan,
  onSelectHost,
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
    <section id="scan" className="panel split my-4 rounded-lg border border-slate-400/20 bg-slate-900/70 p-4 shadow-2xl">
      <div>
        <div className="section-title mb-3 flex items-center justify-between gap-4">
          <h2>Scan LAN</h2>
          <span>{scanResults.length} resultados</span>
        </div>
        <div className="scan-controls">
          <input value={subnet} onChange={(event) => onSubnetChange(event.target.value)} />
          <label className="checkbox">
            <input checked={deep} onChange={(event) => onDeepChange(event.target.checked)} type="checkbox" />
            Deep
          </label>
          <button className="primary" disabled={busy === "scan"} onClick={onRunScan}>
            <Radar size={16} />
            {busy === "scan" ? "Escaneando" : "Scan LAN"}
          </button>
        </div>
        <div className="results">
          {scanResults.map((result) => (
            <button className="result-row" key={result.host} onClick={() => onSelectHost(result.host)}>
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
  );
}
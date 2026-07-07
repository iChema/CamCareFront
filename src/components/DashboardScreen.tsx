/**
 * DashboardScreen — pantalla principal con grid de cámaras, filtros y sort.
 *
 * Extraído de main.tsx. La lógica de streaming/HLS/PTZ vive en App; este
 * componente recibe una función `renderCameraCard(camera)` que App implementa
 * y que devuelve el <CameraCard> con su <StreamTile> ya cableado. Así no se
 * toca HlsVideo/StreamTile/CameraCard ni la lógica de live ticket/heartbeat.
 */
import { Wifi } from "lucide-react";
import type { ReactNode } from "react";
import type { Camera } from "../types";
import type { DashboardFilter, DashboardSort } from "../appTypes";
import { Panel, SectionTitle } from "./ui";

type Props = {
  cameras: Camera[];
  dashboardCameras: Camera[];
  dashboardCamerasForStreaming: Camera[];
  dashboardFilter: DashboardFilter;
  dashboardSort: DashboardSort;
  isPublicZrokHost: boolean;
  onFilterChange: (filter: DashboardFilter) => void;
  onSortChange: (sort: DashboardSort) => void;
  /** App monta el <CameraCard> + <StreamTile> para una cámara del dashboard. */
  renderCameraCard: (camera: Camera) => ReactNode;
};

export function DashboardScreen({
  cameras,
  dashboardCameras,
  dashboardCamerasForStreaming,
  dashboardFilter,
  dashboardSort,
  isPublicZrokHost,
  onFilterChange,
  onSortChange,
  renderCameraCard,
}: Props) {
  return (
    <>
      <Panel id="cameras">
        <SectionTitle
          title="Cámaras"
          meta={`${dashboardCamerasForStreaming.length} en vivo${isPublicZrokHost ? " (límite público: 4)" : ""} · ${dashboardCameras.length} visibles · ${cameras.length} totales`}
        />
        <div className="dashboard-controls mb-3 flex flex-wrap items-end gap-3">
          <label>
            Mostrar
            <select value={dashboardFilter} onChange={(event) => onFilterChange(event.target.value as DashboardFilter)}>
              <option value="visible">Solo dashboard</option>
              <option value="all">Todas</option>
              <option value="hidden">Ocultas</option>
            </select>
          </label>
          <label>
            Ordenar por
            <select value={dashboardSort} onChange={(event) => onSortChange(event.target.value as DashboardSort)}>
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
          {dashboardCameras.map((camera) => renderCameraCard(camera))}
          {dashboardCameras.length === 0 && (
            <div className="empty">
              <Wifi size={30} />
              <p>Sin cámaras para este filtro. Cambia Mostrar o agrega otra cámara.</p>
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}
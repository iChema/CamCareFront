/**
 * HealthBar — barra de estado de herramientas del backend (ffmpeg, ffprobe, nmap).
 *
 * Extraído de main.tsx (P3 frontend). Sin cambios de comportamiento.
 */
import type { Health } from "../types";

export function HealthBar({ health }: { health: Health | null }) {
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
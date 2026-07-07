/**
 * useHealth — estado y polling de /api/health.
 *
 * Extraído de main.tsx (P3 frontend). Sin cambios de comportamiento.
 * Expone `health` y `refreshHealth`. El refresh unificado (health + cameras)
 * vive en App y llama a refreshHealth() + refreshCameras() en paralelo,
 * preservando el Promise.all original.
 */
import { useCallback, useState } from "react";
import { api } from "../api";
import type { Health } from "../types";

export type UseHealthReturn = {
  health: Health | null;
  setHealth: (health: Health | null) => void;
  refreshHealth: () => Promise<Health>;
};

export function useHealth(): UseHealthReturn {
  const [health, setHealth] = useState<Health | null>(null);

  const refreshHealth = useCallback(async () => {
    const next = await api.health();
    setHealth(next);
    return next;
  }, []);

  return {
    health,
    setHealth,
    refreshHealth,
  };
}
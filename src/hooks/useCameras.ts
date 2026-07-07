/**
 * useCameras — estado de cámaras, streaming, escaneo y handlers de acción.
 *
 * Extraído de main.tsx (P3 frontend). Sin cambios de comportamiento.
 * Centraliza todo el estado no relacionado con auth:
 *  - cameras, health(vía refreshHealth), scanResults
 *  - defaults globales (persistidos en localStorage)
 *  - streaming manual opt-in (manualStreamingIds), reload token, fallos
 *  - live ticket + heartbeat (bootstrap effect)
 *  - PTZ speed/preset/visible, dashboard filter/sort, provider scope
 *  - busy, message
 *  - handlers: refresh, runScan, createCamera, enable/disableStream,
 *    handleStreamFailedChange, probe, remove, ptz, preset,
 *    updateCameraConfig, applyDefaultsToAll
 *  - derivados (useMemo): contadores, dashboardCameras, providerOptions…
 *
 * Recibe authToken/currentUser de useAuth y refreshHealth de useHealth para
 * replicar exactamente los efectos originales (bootstrap live ticket, refresh
 * unificado health+cameras).
 */
import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Camera, PtzDirection, ScanResult, UserPublic } from "../types";
import {
  type CameraFormPayload,
  type DashboardFilter,
  type DashboardSort,
  type GlobalDefaults,
  parseDefaultsSafe,
} from "../appTypes";

type UseCamerasArgs = {
  authToken: string;
  currentUser: UserPublic | null;
  refreshHealth: () => Promise<unknown>;
};

export type UseCamerasReturn = {
  // raw state
  cameras: Camera[];
  scanResults: ScanResult[];
  selectedHost: string;
  subnet: string;
  deep: boolean;
  busy: string;
  message: string;
  streamReloadToken: number;
  failedStreamIds: Record<number, boolean>;
  manualStreamingIds: Set<number>;
  fullscreenCameraId: number | null;
  liveTicket: string;
  liveClientId: string;
  defaults: GlobalDefaults;
  dashboardFilter: DashboardFilter;
  dashboardSort: DashboardSort;
  defaultsProviderScope: string;
  ptzSpeed: Record<number, number>;
  ptzPreset: Record<number, number>;
  ptzVisible: Record<number, boolean>;
  isPublicZrokHost: boolean;
  maxParallelCameras: number;
  // setters for UI components
  setSelectedHost: (value: string) => void;
  setSubnet: (value: string) => void;
  setDeep: (value: boolean) => void;
  setBusy: (value: string) => void;
  setMessage: (value: string) => void;
  setDefaults: Dispatch<SetStateAction<GlobalDefaults>>;
  setFullscreenCameraId: (value: number | null) => void;
  setDashboardFilter: (value: DashboardFilter) => void;
  setDashboardSort: (value: DashboardSort) => void;
  setDefaultsProviderScope: (value: string) => void;
  setPtzVisible: (updater: (prev: Record<number, boolean>) => Record<number, boolean>) => void;
  setPtzSpeed: (updater: (prev: Record<number, number>) => Record<number, number>) => void;
  setPtzPreset: (updater: (prev: Record<number, number>) => Record<number, number>) => void;
  // derived
  onlineCount: number;
  visibleCount: number;
  aiCount: number;
  orderSlots: number[];
  dashboardCameras: Camera[];
  dashboardCamerasForStreaming: Camera[];
  activeStreamingCameras: Camera[];
  activeStreamingIds: Set<number>;
  providerOptions: string[];
  // actions
  refresh: () => Promise<void>;
  refreshAndReloadStreams: () => Promise<void>;
  runScan: () => Promise<void>;
  createCamera: (payload: CameraFormPayload) => Promise<void>;
  enableStream: (cameraId: number) => void;
  disableStream: (cameraId: number) => void;
  handleStreamFailedChange: (cameraId: number, failed: boolean) => void;
  probe: (camera: Camera) => Promise<void>;
  remove: (camera: Camera) => Promise<void>;
  ptz: (camera: Camera, direction: PtzDirection) => Promise<void>;
  preset: (camera: Camera, action: "set" | "goto") => Promise<void>;
  updateCameraConfig: (camera: Camera, patch: Partial<Camera>) => Promise<void>;
  applyDefaultsToAll: () => Promise<void>;
};

export function useCameras({ authToken, currentUser, refreshHealth }: UseCamerasArgs): UseCamerasReturn {
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
  const [defaults, setDefaults] = useState<GlobalDefaults>(parseDefaultsSafe);
  const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>("visible");
  const [dashboardSort, setDashboardSort] = useState<DashboardSort>("custom");
  const [defaultsProviderScope, setDefaultsProviderScope] = useState<string>("ALL");
  const isPublicZrokHost = typeof window !== "undefined" && window.location.hostname === "camcare.shares.zrok.io";
  const maxParallelCameras = isPublicZrokHost ? 4 : Number.POSITIVE_INFINITY;

  useEffect(() => {
    window.localStorage.setItem("camcare_defaults_v1", JSON.stringify(defaults));
  }, [defaults]);

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
    // NOTE: `manualStreamingIds` is empty by default and only grows when the
    // user clicks "Ver live" on a tile (see `enableStream` below). This means
    // the "X en vivo" counter starts at 0 on every fresh page load and climbs
    // as streams are opted into. It is NOT a bug — auto-streaming every
    // dashboard camera would saturate the LAN. If we ever want to surface
    // "selected/active" framing for the counter, the wording should change,
    // not the default.
    () => dashboardCameras.filter((camera) => manualStreamingIds.has(camera.id)),
    [dashboardCameras, manualStreamingIds],
  );
  const activeStreamingCameras = useMemo(
    () => dashboardCamerasForStreaming.slice(0, maxParallelCameras),
    [dashboardCamerasForStreaming, maxParallelCameras],
  );
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
  const providerOptions = useMemo(() => {
    const values = new Set<string>();
    for (const camera of cameras) {
      const provider = (camera.provider || "").trim();
      if (provider) values.add(provider);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [cameras]);

  const refresh = useCallback(async () => {
    const [_, nextCameras] = await Promise.all([refreshHealth(), api.cameras()]);
    setCameras(nextCameras);
  }, [refreshHealth]);

  const refreshAndReloadStreams = useCallback(async () => {
    await refresh();
    setFailedStreamIds((prev) => {
      const hasFailures = Object.values(prev).some(Boolean);
      if (hasFailures) setStreamReloadToken(Date.now());
      return prev;
    });
  }, [refresh]);

  // Bootstrap live ticket + heartbeat when there are active streams and an
  // authenticated session. Mirrors the original effect in main.tsx.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, currentUser, liveClientId, visibleCameraIdsKey]);

  const enableStream = useCallback((cameraId: number) => {
    setManualStreamingIds((current) => {
      const next = new Set(current);
      next.add(cameraId);
      return next;
    });
  }, []);

  const disableStream = useCallback((cameraId: number) => {
    setManualStreamingIds((current) => {
      const next = new Set(current);
      next.delete(cameraId);
      return next;
    });
  }, []);

  const handleStreamFailedChange = useCallback(
    (cameraId: number, failed: boolean) =>
      setFailedStreamIds((prev) => ({ ...prev, [cameraId]: failed })),
    [],
  );

  const runScan = useCallback(async () => {
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
  }, [subnet, deep]);

  const createCamera = useCallback(
    async (payload: CameraFormPayload) => {
      await api.createCamera(payload);
      await refresh();
      setMessage("Cámara guardada");
    },
    [refresh],
  );

  const applyDefaultsToAll = useCallback(async () => {
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
  }, [cameras, defaults, defaultsProviderScope, refresh]);

  const updateCameraConfig = useCallback(
    async (camera: Camera, patch: Partial<Camera>) => {
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
    },
    [refresh],
  );

  const probe = useCallback(
    async (camera: Camera) => {
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
    },
    [refresh],
  );

  const remove = useCallback(
    async (camera: Camera) => {
      await api.deleteCamera(camera.id);
      await refresh();
    },
    [refresh],
  );

  const ptz = useCallback(async (camera: Camera, direction: PtzDirection) => {
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
  }, [ptzSpeed]);

  const preset = useCallback(async (camera: Camera, action: "set" | "goto") => {
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
  }, [ptzPreset]);

  return {
    cameras,
    scanResults,
    selectedHost,
    subnet,
    deep,
    busy,
    message,
    streamReloadToken,
    failedStreamIds,
    manualStreamingIds,
    fullscreenCameraId,
    liveTicket,
    liveClientId,
    defaults,
    dashboardFilter,
    dashboardSort,
    defaultsProviderScope,
    ptzSpeed,
    ptzPreset,
    ptzVisible,
    isPublicZrokHost,
    maxParallelCameras,
    setSelectedHost,
    setSubnet,
    setDeep,
    setBusy,
    setMessage,
    setDefaults,
    setFullscreenCameraId,
    setDashboardFilter,
    setDashboardSort,
    setDefaultsProviderScope,
    setPtzVisible,
    setPtzSpeed,
    setPtzPreset,
    onlineCount,
    visibleCount,
    aiCount,
    orderSlots,
    dashboardCameras,
    dashboardCamerasForStreaming,
    activeStreamingCameras,
    activeStreamingIds,
    providerOptions,
    refresh,
    refreshAndReloadStreams,
    runScan,
    createCamera,
    enableStream,
    disableStream,
    handleStreamFailedChange,
    probe,
    remove,
    ptz,
    preset,
    updateCameraConfig,
    applyDefaultsToAll,
  };
}
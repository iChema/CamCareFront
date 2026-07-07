/**
 * HlsVideo — reproductor de stream HLS/MP4 con reconexión automática.
 *
 * Extraído de main.tsx (P3 frontend). Sin cambios de comportamiento.
 * Soporta HLS nativo (Safari), hls.js, y fallback MP4 legacy. Emite
 * `onError` / `onHealthy` para que el tile padre muestre el estado.
 */
import { useEffect, useRef } from "react";
import Hls from "hls.js";

type Props = {
  sourceUrl: string;
  fallbackUrl?: string;
  authToken?: string;
  className?: string;
  onError: (message: string) => void;
  onHealthy?: () => void;
  reloadToken?: number;
  profile?: "low" | "high";
  startDelayMs?: number;
};

export function HlsVideo({
  sourceUrl,
  fallbackUrl,
  authToken,
  className,
  onError,
  onHealthy,
  reloadToken,
  profile = "low",
  startDelayMs = 0,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    let hls: Hls | null = null;
    let retryTimer: number | null = null;
    let stallTimer: number | null = null;
    let retries = 0;
    let cancelled = false;
    let activeUrl = sourceUrl;
    let switchedToFallback = false;
    let lastVideoTime = 0;
    let lastAdvanceAt = Date.now();
    const scheduleRetry = () => {
      if (cancelled) return;
      if (retryTimer) return;
      retries += 1;
      const backoff = [1500, 3000, 5000, 8000, 12000];
      const waitMs = backoff[Math.min(retries - 1, backoff.length - 1)];
      onError(`Reconectando stream… intento ${retries}`);
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void start();
      }, waitMs);
    };

    const onTimeUpdate = () => {
      const t = video.currentTime;
      if (t > lastVideoTime + 0.01) {
        const hadStall = retries > 0;
        lastVideoTime = t;
        lastAdvanceAt = Date.now();
        if (hadStall) {
          retries = 0;
          onHealthy?.();
        }
      }
    };

    const onVideoStalled = () => {
      if (cancelled) return;
      // iOS Safari emits transient waiting/suspend often; only reconnect on real freeze.
      const idleMs = Date.now() - lastAdvanceAt;
      if (idleMs < 12000) return;
      onError("Stream congelado, reconectando…");
      scheduleRetry();
    };

    const cleanupPlayer = () => {
      if (retryTimer) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (stallTimer) {
        window.clearInterval(stallTimer);
        stallTimer = null;
      }
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("stalled", onVideoStalled);
      hls?.destroy();
      hls = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    const tryPlay = () => {
      void video.play().catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("interrupted by a new load request")) return;
        scheduleRetry();
      });
    };

    const start = async () => {
      if (cancelled) return;
      cleanupPlayer();
      lastVideoTime = 0;
      lastAdvanceAt = Date.now();
      video.addEventListener("timeupdate", onTimeUpdate);
      video.addEventListener("stalled", onVideoStalled);
      stallTimer = window.setInterval(() => {
        if (cancelled || video.paused) return;
        const idleMs = Date.now() - lastAdvanceAt;
        if (video.readyState >= 2 && idleMs > 12000) {
          onError("Stream congelado, reconectando…");
          scheduleRetry();
        }
      }, 4000);
      const legacyFallbackUrl = fallbackUrl || "";
      const url = activeUrl;

      if (url.includes("/api/stream.mp4")) {
        video.src = url;
        tryPlay();
        onHealthy?.();
        video.onerror = () => {
          if (legacyFallbackUrl && !switchedToFallback) {
            switchedToFallback = true;
            activeUrl = legacyFallbackUrl;
            retries = 0;
            void start();
            return;
          }
          // Fallback to legacy HLS when MP4 live stream fails.
          if (legacyFallbackUrl && switchedToFallback) {
            video.src = legacyFallbackUrl;
            tryPlay();
          }
          scheduleRetry();
        };
        return;
      }

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        tryPlay();
        onHealthy?.();
        video.onerror = () => {
          if (legacyFallbackUrl && !switchedToFallback) {
            switchedToFallback = true;
            activeUrl = legacyFallbackUrl;
            retries = 0;
            void start();
            return;
          }
          onError("Error de stream");
          scheduleRetry();
        };
        return;
      }

      if (!Hls.isSupported()) {
        onError("HLS not supported in this browser");
        return;
      }

      hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 3,
        maxBufferLength: 6,
        backBufferLength: 10,
        manifestLoadingMaxRetry: 1,
        levelLoadingMaxRetry: 1,
        fragLoadingMaxRetry: 1,
        manifestLoadingRetryDelay: 1500,
        levelLoadingRetryDelay: 1500,
        fragLoadingRetryDelay: 1500,
        xhrSetup: (xhr) => {
          if (authToken) xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
        },
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        retries = 0;
        onHealthy?.();
        tryPlay();
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (legacyFallbackUrl && !switchedToFallback) {
          switchedToFallback = true;
          activeUrl = legacyFallbackUrl;
          retries = 0;
          void start();
          return;
        }
        onError(`Stream error (${data.type})`);
        scheduleRetry();
      });
    };

    const bootTimer = window.setTimeout(() => {
      void start();
    }, Math.max(0, startDelayMs));
    return () => {
      cancelled = true;
      window.clearTimeout(bootTimer);
      cleanupPlayer();
    };
  }, [sourceUrl, fallbackUrl, authToken, reloadToken, profile, startDelayMs]);

  return <video ref={videoRef} className={className} muted playsInline controls autoPlay />;
}
# Auditoría brutal de `src/main.tsx` — CamCare Frontend

**Archivo:** `src/main.tsx` · **2037 líneas** · 77 KB · frontend completo en un solo archivo
**Fecha:** 2026-07-06 · **Veredicto:** vibecoded, funciona, pero técnicamente insostenible. Refactor urgente.

> No se modificó nada del código. Este es solo un reporte.

---

## 0. Mapa del archivo (componentes / funciones)

| # | Línea | Long | Qué es | Notas |
|---|------|------|--------|------|
| 1 | 102–112 | 11 | `isLoginErrorMessage(msg)` | Heurística por substring para pintar errores de login de rojo. |
| 2 | 114–122 | 9 | `isLikelyLocalAccess()` | **DEAD CODE** — definida, jamás llamada. |
| 3 | 124–331 | 208 | `HlsVideo` | Reproductor HLS/MP4 con retry, backoff, fallback, stall detection. |
| 4 | 333–654 | 322 | `StreamTile` | Tile de cámara: Steren bridge, cloud, fullscreen via portal, HLS. |
| 5 | 656–672 | 17 | `HealthBar` | Pills de salud del backend (API/ffmpeg/ffprobe/nmap). OK. |
| 6 | 674–891 | 218 | `CameraForm` | Formulario alta cámara, ~20 campos. |
| 7 | 893–2031 | **1139** | `App` | **EL MONSTRUO.** ~30 `useState`, 5 pantallas, 2 modales, ~15 handlers async. |
| 8 | 2033–2037 | 5 | render root | `createRoot(...).render(<StrictMode><App/></StrictMode>)`. |

**Total `App`: 56% del archivo.** Un solo componente sostiene auth, users, telegram, cámaras, streams, PTZ, defaults, scan, modales, y routing por `screen`.

---

## 1. Problemas críticos

### 1.1 🔴 Settings dispara un PATCH a la API **en cada tecla**
Líneas **1883–1934**. Los inputs de configuración por cámara llaman directamente:
```tsx
onChange={(event) => void updateCameraConfig(camera, { name: event.target.value })}
```
`updateCameraConfig` (1364) hace `api.updateCamera` + `refresh()` (que a su vez hace `Promise.all([api.health(), api.cameras()])`).

- Escribir "hola" = **4 PATCH + 4 GET /cameras + 4 GET /health** = 12 requests.
- Cada `refresh()` reemplaza el array `cameras` → **re-render masivo** de todo el dashboard.
- **Race condition:** los PATCH intermedios compiten; el último en resolverse gana, no necesariamente el último tecleado. El input puede "saltar" al valor que devuelve el refresh.

**Fix correcto:** debounce local + guardar con botón explícito (como ya hace `CameraForm`), o input no controlado con commit on blur.

### 1.2 🔴 `localStorage` + `JSON.parse` **en cada render** del body del componente
Líneas **912–925**:
```tsx
const storedDefaults = typeof window !== "undefined" ? window.localStorage.getItem(...) : null;
const parsedDefaults = storedDefaults ? (JSON.parse(storedDefaults) as Partial<GlobalDefaults>) : {};
const [defaults, setDefaults] = useState<GlobalDefaults>({ ...parsedDefaults ... });
```
Esto vive **en el cuerpo de `App`**, no en un lazy initializer. Cada re-render de `App` (y son muchos) vuelve a leer `localStorage` y parsear JSON, solo para que `useState` ignore el resultado (el inicial solo se usa en el primer render). **Waste** y, peor:

### 1.3 🔴 `JSON.parse` **sin try/catch** en arranque
Línea **914**. Si `camcare_defaults_v1` contiene JSON corrupto (escritura interrumpida, versión vieja con schema distinto), **la app entera crashea al montar** y no hay pantalla de error que la rescate. No hay boundary.

**Fix:** lazy initializer `useState(() => parseDefaultsSafe())` con `try/catch` que devuelva defaults sanos.

### 1.4 🟠 Token de stream **en la URL del query string**
`api.streamUrl(id, profile, token)` (api.ts:167) embebe el token en la URL. `HlsVideo` además lo manda como header `Authorization` vía `xhrSetup` (296). Doble autenticación, pero el token **viaja en la URL**, que se cachea en:
- access logs del proxy / go2rtc / nginx
- `referrer` si el stream carga recursos externos
- history del browser (aunque sea XHR, los `<img src=...mjpeg>` del Steren bridge sí exponen)

El JWT quedó in-memory tras el parche reciente — **pero en cuanto entra a una URL de stream, vuelve a ser persistente en logs**. Si el `liveTicket` es de corta vida está bien; si es el JWT, no.

### 1.5 🟠 Loop de re-renders latente vía `onStreamFailedChange`
- Línea **1614–1616**: handler inline `(cameraId, failed) => setFailedStreamIds((prev) => ({ ...prev, [cameraId]: failed }))` — **nueva función cada render de `App`**.
- Línea **382–384** (StreamTile): `useEffect` con `onStreamFailedChange` en deps → se ejecuta **cada vez que `App` re-renderiza**, no solo cuando cambia `error`.
- El effect llama al setter que crea un objeto nuevo → `failedStreamIds` cambia → `App` re-renderiza → nuevo handler → … 

Hoy no explota porque `Boolean(error)` suele ser estable, pero es una bomba: en cuanto haya un error transitorio, ciclará. **Falta `useCallback` en el padre o dep estable.**

### 1.6 🟠 `busy` es un **único string global** para todas las operaciones
`busy === "scan"`, `busy === "user-modal"`, `busy === \`probe-${camera.id}\``, `busy === \`ptz-${id}-${dir}\``… Un solo estado de "ocupado" para TODO el app.

- No soporta **operaciones concurrentes**: no puedes escanear Y editar usuario Y mover PTZ a la vez; la segunda pisa el `busy` de la primera y los botones se desbloquean mal.
- Cualquier acción nueva resetea `busy=""` en el `finally`, desbloqueando todo aunque la primera siga corriendo.

**Fix:** `Set<string>` de busy keys, o un `Record<string, boolean>`, o estados por-feature.

### 1.7 🟠 `message` único global — cualquier acción pisa el mensaje anterior
Un solo `useState("")` para todos los feedbacks. Si editas una cámara y enseguida mueves PTZ, el mensaje de "configuración actualizada" desaparece. No hay toasts ni cola.

### 1.8 🟠 `refresh()` re-pide `/health` en cada mutación de cámara
`updateCameraConfig`, `probe`, `remove`, `createCamera`, `applyDefaultsToAll` todos llaman `refresh()` → `Promise.all([api.health(), api.cameras()])`. Health rara vez cambia pero se pide en cada keystroke del settings (ver 1.1) → lluvia de `/health`.

### 1.9 🟡 Handlers pasados a hijos **sin `useCallback`**
`enableStream`, `disableStream`, `updateCameraConfig`, `ptz`, `preset`, `probe`, `remove`, `openScreen` se recrean cada render de `App` y se pasan a `CameraCard`/`StreamTile`. `CameraCard` (ya extraído) **no se puede `React.memo`** porque sus props cambian cada render. Misma bomba que 1.5.

### 1.10 🟡 Efecto `[currentUser]` con handlers no listados en deps
Líneas **1143–1146**: `useEffect(() => { refreshUsers(); refreshTelegramTargets(); }, [currentUser])`. Las funciones se recrean cada render (closures sobre `currentUser`); ESLint `exhaustive-deps` gritaría. Funciona porque `currentUser` es la única dep real, pero es frágil y silencioso.

---

## 2. Deuda técnica

### 2.1 `App` = 1139 líneas con 5 pantallas inline en ternarios anidados
Líneas **1560–1948**: `screen === "dashboard" ? (…) : screen === "scan" ? (…) : screen === "users" ? (…) : screen === "telegram" ? (…) : isAdmin ? (…)`. Anidación 3–4 niveles, JSX de cientos de líneas por rama. Inmanejable, in testeable, in diffable.

### 2.2 Settings per-cámara: ~200 líneas de inputs duplicados
Líneas **1868–1937**: por cada cámara, un bloque de ~20 inputs inline, todos con `onChange` que pega a la API (ver 1.1). Cada `CameraSettingsCard` debería ser un componente dedicado con estado local y commit explícito.

### 2.3 `CameraForm` (674–891) y Settings per-cámara (1882–1935) **duplican los mismos campos**
Nombre, Ubicación, Proveedor (con `CAMERA_PROVIDER_OPTIONS`), Protocolo, Host, Puerto, Dashboard, Orden, IA personas, AI model, AI conf, AI fps, AI presencia, RTSP path, AI zone json, Usuario, Password, Notas. **Dos veces, con pequeñas variaciones.** Un `CameraFields` compartido eliminaría ~150 líneas.

### 2.4 `emptyCamera` + `defaults` merge con **dos effects de sync**
Líneas **690–707**: un effect re-sync `host`, otro re-sync 9 campos de `defaults`. Reaccionar a cambios de props está bien, pero dos effects que tocan el mismo `form` pueden pisarse en el mismo commit. Mejor un solo effect o un key-reset.

### 2.5 Estilos **Tailwind inline + CSS classes custom mezclados**
Ej. línea 1465: `className="sidebar-mobile-toggle fixed left-2.5 top-2.5 z-[70] … md:hidden"` (Tailwind) junto a `className="app-shell"` / `className="sidebar"` (styles.css, 19 KB). Inconsistencia: mitad utilities, mitad BEM-ish. Difícil saber qué pinta qué. Además hay utilities arbitrarias `z-[70]`, `bg-slate-950/85` que sugieren tuning ad-hoc.

### 2.6 `isLoginErrorMessage` — heurística por substring
Líneas **102–112**: pinta rojo si el msg contiene `invalid|error|fail|credencial|401|403`. Cualquier mensaje informativo que contenga "error" se ve como error. El backend debería mandar un flag `isError` o un código.

### 2.7 Dead code / dead imports
- **Línea 6**: `Activity` importado de lucide-react — **no se usa** en `main.tsx` (sí en `CameraCard`, pero aquí sobra).
- **Líneas 114–122**: `isLikelyLocalAccess()` — definida, **nunca llamada**.
- **Línea 359**: `const playing = true;` — constante muerta; `playing || bridgePlaying` ≡ `bridgePlaying`. Solo confunde al lector.

### 2.8 `CameraCard` recibe `streamTile` como **elemento React ya construido**
Líneas **1604–1620**: el padre construye `<StreamTile …/>` y lo pasa como prop. Como es un elemento, `CameraCard` no puede evitar su re-render con memo — el prop cambia de identidad cada render del padre. Mejor pasar props y que `CameraCard` lo instancie, o usar `useMemo` en el elemento.

### 2.9 `onStreamFailedChange` / `onFullscreenCameraChange` / `onEnableStream` / `onDisableStream` — todos inline sin memo
Mismo patrón que 2.8: callbacks recreados cada render, hijos que no se pueden memoizar.

### 2.10 `video.onerror` se sobreescribe entre paths
En `HlsVideo`, el path MP4 (242) y el native-HLS (264) asignan `video.onerror`. El path hls.js (283+) no lo resetea. Si se cae del native al hls.js, `onerror` puede quedar stale. Menor, pero fuente de bugs oscuros.

### 2.11 `localStorage.removeItem("camcare_auth_token")` en cada cambio de token
Línea **960**: corre en **cada** cambio de `authToken` (incluido el mount con `""`). Es un shim de migración de la versión pre-parche. Funciona, pero conceptualmente debería ser un efecto one-shot de arranque, no colgando del ciclo del token.

---

## 3. Recomendaciones de refactor (priorizadas)

### P0 — Arreglar antes de tocar estructura (quick wins, alto valor)
1. **Debouncear + commit-on-blur los inputs del Settings** (1.1). Hoy ametralla la API y causa races. ~30 min.
2. **`parseDefaultsSafe()` con try/catch + lazy initializer** (1.2, 1.3). Evita crash en arranque y deja de parsear en cada render. ~15 min.
3. **`useCallback` para handlers que se pasan a hijos** (`onStreamFailedChange`, `enableStream`, `disableStream`, `updateCameraConfig`, `ptz`, `preset`, `probe`). Desactiva la bomba de re-renders (1.5, 1.9). ~30 min.
4. **Borrar dead code**: `Activity` import (2.7), `isLikelyLocalAccess` (2.7), `playing = true` (2.7). ~5 min.

### P1 — Extracción de componentes (rompe el monolito)
5. **`<LoginScreen />`** — sacar las líneas 1426–1461 a `components/LoginScreen.tsx`. Props: `onLogin`, `authBusy`, `message`. Limpia el early-return del `App`.
6. **`<Sidebar />`** — líneas 1465–1504. Props: `screen`, `onNavigate`, `isAdmin`, `collapsed`, `open`, setters.
7. **`<DashboardScreen />`** — líneas 1560–1632. Se lleva `dashboardCameras`, filtros, grid, `StreamTile`.
8. **`<ScanScreen />`** — líneas 1633–1676.
9. **`<UsersScreen />`** + **`<UserModal />`** — líneas 1677–1726 y 1949–2013.
10. **`<SettingsScreen />`** — líneas 1743–1948. **El más urgente** por 1.1 y 2.2.
11. **`<CameraSettingsCard />`** — un componente por cámara dentro de Settings, con estado local de formulario y botón Guardar. Elimina 2.2 y desactiva 1.1 de raíz.
12. **`<CameraFields />`** compartido entre `CameraForm` y `CameraSettingsCard` — elimina 2.3.

Tras P1, `App` queda como un router + provider de auth, ~150–200 líneas.

### P2 — Hooks extraídos
13. **`useAuth()`** — `authToken`, `currentUser`, `login`, `logout`, `setApiToken` migration. Hoy son 8 useState + 2 effects + 2 handlers dispersos en `App`.
14. **`useCameras()`** — `cameras`, `health`, `refresh`, `createCamera`, `updateCameraConfig`, `probe`, `remove`. Expone `busy` por-acción.
15. **`useLiveTicket(visibleCameraIds, authToken, clientId)`** — el effect 1060–1129 con bootstrap + heartbeat + retry. Lógica de protocolo, merece su hook y sus tests.
16. **`useStreamingIds()`** — `manualStreamingIds` + enable/disable + limpieza de IDs inválidos (963–970).
17. **`useLocalStorageDefaults()`** — `defaults` + persistencia + parseo seguro (reemplaza 1.2/1.3).
18. **`useBusy()`** — `Set<string>` con `start(key)`/`end(key)`/`isBusy(key)` (reemplaza 1.6).
19. **`useToast()`** — cola de mensajes con auto-dismiss (reemplaza 1.7).

### P3 — Limpieza
20. **Unificar estilos**: o todo Tailwind o todo CSS classes. Hoy es mezcla arbitraria.
21. **Reemplazar `isLoginErrorMessage` por flag del backend** (2.6).
22. **`React.memo` + `useCallback` en `CameraCard`/`StreamTile`** tras P1/P2.
23. **Error boundary** alrededor de `App` para que un crash de parseo no deje pantalla en blanco.
24. **Mover `bridgeBaseUrl = "http://127.0.0.1:5090"` a config/env** (línea 358). Hardcoded.

---

## 4. Cosas que NO se deben tocar (lógica frágil que funciona)

| Qué | Dónde | Por qué no tocar |
|-----|-------|------------------|
| **Retry/backoff/fallback/stall de `HlsVideo`** | 159–318 | Tunada a mano. Maneja MP4, native HLS (Safari), hls.js, fallback low↔high, stall de 12s, backoff escalonado. Tocar = romper streams en producción. |
| **Heartbeat del live ticket** | 1060–1129 | Protocolo con backend: bootstrap, 30s heartbeat, retry 1.5–2.5s, `closeLiveSession` en cleanup. Si se rompe, sesiones zombie en backend y streams que se caen. |
| **Semántica opt-in de `manualStreamingIds`** | 998–1007 | **NO es un bug** que el counter "X en vivo" empiece en 0. Está comentado explícitamente: auto-streaming saturaría la LAN. Respetar la decisión. |
| **`maxParallelCameras` = 4 en zrok público** | 949–950 | Límite para no saturar el túnel zrok público. Hardcoded pero intencional. |
| **JWT in-memory + `localStorage.removeItem` migration** | 894–961 | **Acabamos de parchar esto.** Funciona. El `removeItem` del stale token es migración necesaria de la versión pre-parche. Dejar (mover a one-shot en P3, no antes). |
| **Locks del admin #1** (`isFirstAdmin`, `editingUserId === 1`) | 1699, 1970, 1978, 1989, 2003, 2010 | Protege al admin root de auto-borrado/edit. Lógica distribuida pero correcta. Si se refactoriza `UsersScreen`, **reproducir todos los checks**. |
| **`startDelayMs` stagger** | 1613 | Escalona el arranque de streams (`Math.min(4000, (order % 20) * 250)`) para no saturar la LAN al cargar. Tunado. |
| **`cleanupPlayer` en `HlsVideo`** | 194–210 | Destruye Hls, limpia timers, quita listeners, `video.load()`. Si se toca, leaks de memoria y streams zombies. |
| **Detección de Steren cloud** (`isSterenCloud`) | 366–368 | Heurística por nombre/host/snapshot_url para activar el bridge MJPEG. Frágil pero funciona para los casos reales. No generalizar sin datos. |

---

## 5. Resumen ejecutivo

- **Funciona** porque la lógica de streaming está bien tunada y el backend aguanta el spam.
- **Es insostenible**: un componente de 1139 líneas con 30 useState, 5 pantallas inline, y handlers que disparan requests por tecla.
- **Riesgos reales hoy:** (a) settings ametralla la API y tiene races, (b) crash al arranque si localStorage corrupto, (c) bomba de re-renders latente vía callbacks no memoizados, (d) token en URLs de stream.
- **Lo urgente son 4 quick wins (P0)**: debounce settings, parse seguro, `useCallback`, borrar dead code. ~1h de trabajo, desactivan los riesgos activos sin tocar estructura.
- **Lo importante es P1**: sacar 6 componentes de pantalla + `CameraSettingsCard`. `App` baja de 1139 a ~180 líneas.
- **Lo que NO se toca**: toda la lógica de HLS/heartbeat/live ticket/stagger. Es lo único que sostiene el producto y está afinado a mano.
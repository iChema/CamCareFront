# CamCare Frontend

React + Vite frontend for CamCare dashboard/admin.

## Requirements

- Bun (recommended) or Node.js 20+

## Quick Start

1. Install deps:

```bash
bun install
```

2. Configure API base URL (optional):

Create `.env` with:

```bash
VITE_API_URL=http://127.0.0.1:5050
```

3. Run dev server:

```bash
bun run dev
```

Default URL:

- [http://127.0.0.1:5173](http://127.0.0.1:5173)

## Build

```bash
bun run build
```

## Enrutamiento (zrok)

Para exponer el frontend por internet se usa un túnel de `zrok` apuntando al servidor local de Vite.

1. Levanta frontend local:

```bash
bun run dev --host 127.0.0.1 --port 5173
```

2. Publica el puerto con `zrok`:

```bash
zrok share public http://127.0.0.1:5173 --name camcare
```

3. Usa la URL pública que imprime `zrok` para acceder al panel.

Nota: si aparece `shareConflict` para `camcare` (como en `zrok-camcare.log`), usa otro nombre (`--name camcare-front`) o cierra/libera el share anterior.

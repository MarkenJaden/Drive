# Fork Divergences & Architecture Invariants

This repository is a self-hosted fork of [commaai/connect](https://github.com/commaai/connect).
It includes custom self-hosting features, Two-Factor Authentication (2FA), Coolify deployment configurations, and token-saving AI graph tools.

When merging upstream updates (e.g. via `upstream-sync.yml` and the Gemini conflict resolver), **always preserve** the invariants described below.

---

## 1. Protected Files & Directories (Fork-Specific)

The following files and directories are unique to this fork and must never be deleted or reverted by upstream merges:
- `server/`: Companion API & Auth service (Node.js/Express) providing self-hosted JWT issuance, TOTP 2FA, device endpoints, signed upload & HLS streaming storage (`server/storage.js`, `server/media.js`), Athena WebSocket bridge + `forwardLogs`, and Ioniq telemetry endpoints.
- `server/server.test.js`: Integration tests for Companion API, storage signing, Athena concurrency, and Ioniq sync.
- `docker-compose.yml`: General multi-container Docker Compose configuration.
- `docker-compose.coolify.yml`: Coolify-optimized Docker Compose configuration with magic variables.
- `src/components/SelfHostedLogin.jsx`: Frontend component for self-hosted username/password login, TOTP prompt, and 2FA QR code setup.
- `src/api/ioniq.js`: Frontend client helpers for `/api/ioniq/...` and `/api/logs/...` endpoints.
- `src/components/IoniqPanel/`: Frontend dashboard panel for Hyundai Ioniq fuel consumption, Tank-to-Tank refuels, 14-ECU diagnostics, and flight recordings.
- `src/components/LogsPanel/`: Frontend dashboard panel for Athena swaglogs, bootlogs, and crashlogs.
- `FORK_DIVERGENCES.md`: This specification file.
- `.github/workflows/upstream-sync.yml`: The upstream synchronization workflow.
- `graphify-out/`: Knowledge graph and indexing cache.
- `.agents/`: Agent rules and workflows.

---

## 2. Invariants in Shared Files

### `src/components/anonymous.jsx`
- Must retain the `SelfHostedLogin` component prominently displayed on the landing page.
- Branding header should reflect "MarkenJaden Drive" / Self-hosted openpilot companion.
- Legacy OAuth buttons (Google, Apple, GitHub) are kept as an optional/collapsible section for backward compatibility.

### `src/api.js`
- `COMMA_URL_ROOT` must default to `'/'` (or `import.meta.env.VITE_COMMA_URL_ROOT || '/'`) so that API requests route through the same-origin Nginx reverse proxy to the companion backend.
- Do not hardcode `https://api.comma.ai/` as the only fallback.

### `nginx.conf`
- Must retain `client_max_body_size 512M;` and reverse proxy blocks for:
  - `/api/` -> `http://api:4000/api/`
  - `/v1/storage/` -> `http://api:4000/v1/storage/` (streaming `proxy_request_buffering off;` and `proxy_buffering off;`)
  - `/v1/` -> `http://api:4000/v1/`
  - `/v1.1/` -> `http://api:4000/v1.1/`
  - `/v1.4/` -> `http://api:4000/v1.4/`
  - `/v2/` -> `http://api:4000/v2/`
  - `/athena/` -> `http://api:4000/athena/`
  - `/ws/` -> `http://api:4000/ws/` (with WebSocket Upgrade headers & extended `3600s` send/read timeouts)
- SPA fallback routing (`try_files $uri /index.html =404;`) must remain intact.

### `vite.config.mjs`
- Must retain proxy configurations for local development (`/api`, `/v1`, `/v1.1`, `/v1.4`, `/v2`, `/athena`, `/ws` with `ws: true`) -> `http://localhost:4000`.

### `Dockerfile` & `docker-compose*.yml`
- Must default the build argument `ARG VITE_COMMA_URL_ROOT=/`, `VITE_ATHENA_URL_ROOT=/athena/`, `VITE_BILLING_URL_ROOT=/`, `VITE_USERADMIN_URL_ROOT=/v1/me/` so that production frontend builds route through the same-origin reverse proxy without double prefixes.
- `server/Dockerfile` installs `ffmpeg` for HLS segment duration probing (`ffprobe`) and timeline sprite generation (`ffmpeg`).

### `src/components/Dashboard/index.jsx` & `DriveListItem.jsx`
- `Dashboard` renders `Fahrten` (`DriveList`, default tab — no extra network calls on initial mount so upstream tests remain intact), `Ioniq & Verbrauch` (`IoniqPanel`), and `Logs & System` (`LogsPanel`).
- `DriveListItem` displays `drive.ioniq` fuel/EV badge when synced telemetry exists.

### `src/components/AppHeader/index.jsx`, `AppDrawer/index.jsx`, `Promotions/index.jsx`
- Retain `MarkenJaden Drive` branding and suppress comma referral/prime upsells when `device.prime` is true.

---

## 3. Conflict Resolution Strategy

- In case of conflicts in UI components (`anonymous.jsx`), keep both upstream improvements and the local `SelfHostedLogin` card.
- In case of changes to `package.json` dependencies, preserve `@commaai/my-comma-auth` and any newly added dependencies from upstream without discarding existing ones.
- When in doubt, prefer preserving the local self-hosted authentication flow while integrating new features and bugfixes from upstream.

# Agent Guidelines for MarkenJaden Drive

## Knowledge Graph & Architecture Navigation (`graphify`)
This repository has an integrated `graphify` knowledge graph located in `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md`.
**To save tokens**, always query the graph first instead of reading many source files into context:
- Run `graphify query "<question>"` to trace dependencies, data flows, and component interactions.
- Run `graphify path "<ComponentA>" "<ComponentB>"` to find connections.
- Run `graphify explain "<Node>"` for explanations.
- Before committing changes, the post-commit hook will automatically update the graph.

## System Components
1. **Frontend (`src/`)**: React 18, Vite, Tailwind CSS, Material-UI, Redux.
   - Entry point: `src/index.jsx`, `src/App.jsx`.
   - Landing & Login: `src/components/anonymous.jsx` and `src/components/SelfHostedLogin.jsx`.
   - API client: `src/api.js` (requests route to `/` by default).
2. **Companion Backend (`server/`)**: Node.js/Express service.
   - Entry point: `server/index.js`, `server/db.js`.
   - Handles JWT generation, TOTP 2FA verification (`otplib`), and openpilot device endpoints (`/v1/me/`, `/v1/me/devices/`, `/v2/pilotpair/`).
   - Persistent store: `/app/data/users.json` and `/app/data/devices.json`.
3. **Deployment**:
   - General: `docker-compose.yml`
   - Coolify: `docker-compose.coolify.yml` with Magic Variables (`$$SERVICE_FQDN_DRIVE`, `$$SERVICE_PASSWORD_JWT`, etc.)
   - Reverse proxy: `nginx.conf` routing `/api/`, `/v1/`, `/v2/` to `api:4000`.
4. **Upstream Sync**:
   - `.github/workflows/upstream-sync.yml` syncs with `commaai/connect:master`.
   - `FORK_DIVERGENCES.md` protects fork invariants against merge conflicts.

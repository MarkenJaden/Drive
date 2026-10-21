# MarkenJaden Drive

Self-hosted companion platform for [openpilot](https://github.com/commaai/openpilot) based on [commaai/connect](https://github.com/commaai/connect).

- **Production URL:** [https://drive.markenjaden.de](https://drive.markenjaden.de)
- **Features:** Self-hosted user login, Two-Factor Authentication (TOTP 2FA), Coolify & Docker Compose support, automated upstream sync with AI conflict resolution, and `graphify` knowledge graph integration.

---

## Deployment

### 1. Coolify (Empfohlen)

Deploye direkt in Coolify mit `docker-compose.coolify.yml`. Coolify belegt die Magic Variables automatisch:
- `SERVICE_FQDN_DRIVE`: Domain z.B. `drive.markenjaden.de`
- `SERVICE_PASSWORD_JWT`: Automatisches JWT Secret
- `SERVICE_PASSWORD_ADMIN`: Generiertes Admin-Passwort

### 2. Standard Docker Compose

```bash
docker compose up -d
```
Besuche anschließend `http://localhost:3000`. Melde dich mit `admin` / `admin123` an und richte dein 2FA-Secret in deiner Authenticator-App (z. B. Google Authenticator) ein.

---

## Upstream Synchronization

Dieses Repository nutzt den zentralen Workflow aus [MarkenJaden/workflows](https://github.com/MarkenJaden/workflows).
Täglich wird automatisch geprüft, ob `commaai/connect:master` neue Commits hat. Etwaige Merge-Konflikte werden unter Beachtung von `FORK_DIVERGENCES.md` via Google Gemini Hunk-by-Hunk automatisch gelöst, sodass alle Self-Hosted-Funktionen erhalten bleiben.

---

## Token-Optimierung mit Graphify

Dieses Repo enthält einen integrierten Knowledge Graph (`graphify-out/`).
Vor Code-Recherchen können KI-Agenten den Graphen abfragen (`graphify query "<frage>"`), anstatt viele Quelldateien einzulesen, was den Token-Verbrauch drastisch senkt.

---

## Development
* Install bun: https://bun.sh/docs/installation
* Install dependencies: `bun install`
* Start companion server: `cd server && npm start`
* Start frontend dev server: `bun start`
* Demo mode: Navigate to `/demo` to test locally without a comma device.

API and useradmin URL roots can be overridden at build time with
`VITE_COMMA_URL_ROOT`, `VITE_ATHENA_URL_ROOT`, `VITE_BILLING_URL_ROOT`, and
`VITE_USERADMIN_URL_ROOT`. Docker Compose accepts the same variables.

## Contributing

* Use best practices
* Write/update test cases for functionality changes
* Keep files small and clean
* Use branches / pull requests to isolate work. Don't do work that can't be merged quickly, find ways to break it up

## Libraries Used
There's a ton of them, but these are worth mentioning because they sort of affect everything.

 * `React` - Object oriented components with basic lifecycle callbacks rendered by state and prop changes.
 * `Redux` - Sane formal *global* scope. This is not a replacement for component state, which is the best way to store local component level variables and trigger re-renders. Redux state is for global state that many unrelated components care about. No free-form editing, only specific pre-defined actions. [Redux DevTools](https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd?hl=en) can be very helpful.
 * `@material-ui` - Lots of fully featured highly customizable components for building the UIs with. Theming system with global and per-component overrides of any CSS values.
 * `connected-react-router` - Mindlessly simple routing with convenient global access due to redux

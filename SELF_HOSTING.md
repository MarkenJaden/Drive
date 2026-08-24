# Self-Hosting Guide für "Drive" mit Coolify

Dieser Leitfaden beschreibt, wie du **Drive** und alle dazugehörigen Komponenten unkompliziert über **Coolify** auf deinem eigenen Server unter `drive.markenjaden.de` bereitstellst.

---

## 1. Warum Coolify?
Coolify ist eine Open-Source PaaS (wie Netlify/Vercel/Heroku auf eigenem VPS/Server), die folgendes automatisch übernimmt:
* **Automatisches SSL/TLS (Let's Encrypt)** für `drive.markenjaden.de`.
* **Automatische Git-Deployments (CI/CD)** bei jedem `git push`.
* **Integrierter Reverse Proxy (Traefik)** mit nativer WebSocket-Unterstützung für Athena (`/ws`).
* **1-Click MinIO (S3-kompatibler Storage)** für deine Fahrtenvideos und Telemetriedateien.

---

## 2. Schritt-für-Schritt Einrichtung in Coolify

### Schritt 1: DNS-Eintrag setzen
Lege bei deinem Domain-Provider (z. B. Cloudflare, Strato, Hetzner) folgenden DNS A-Record an:
* **Host / Name:** `drive` (bzw. `drive.markenjaden.de`)
* **Typ:** `A`
* **Wert / Ziel:** Öffentliche IP-Adresse deines Coolify-Servers

---

### Schritt 2: Eigene GitHub OAuth App erstellen

Damit der Login auf deiner eigenen Domain funktioniert:
1. Gehe in deinem GitHub-Account auf: **Settings -> Developer Settings -> OAuth Apps -> New OAuth App** (oder direkt `https://github.com/settings/applications/new`).
2. Fülle die Felder wie folgt aus:
   * **Application name:** `Drive`
   * **Homepage URL:** `https://drive.markenjaden.de`
   * **Authorization callback URL:** `https://drive.markenjaden.de/auth` (bzw. deine API-Callback-URL)
3. Klicke auf **Register application**.
4. Kopiere die generierte **Client ID** (z. B. `Ov23...`).
5. Klicke auf **Generate a new client secret** und speichere das Secret sicher ab.

---

### Schritt 3: Drive Web Frontend in Coolify anlegen

1. Öffne dein **Coolify Dashboard**.
2. Klicke auf **Projects** -> Wähle oder erstelle ein Projekt (z. B. *"StarPilot Drive"*).
3. Klicke auf **+ New Resource** -> Wähle **Public Repository** (oder Private GitHub App).
4. **Repository URL:** `https://github.com/MarkenJaden/Drive`
5. **Branch:** `master`
6. **Build Pack:** Wähle **Dockerfile**.
7. **Domains:** Trage `https://drive.markenjaden.de` ein.
8. **Port:** `80` (Standard Nginx Port im Dockerfile).
9. **Environment Variables (in Coolify eintragen):**
   ```env
   VITE_API_URL=https://drive.markenjaden.de
   VITE_ATHENA_URL=wss://drive.markenjaden.de/ws
   VITE_GITHUB_CLIENT_ID=DEINE_GITHUB_CLIENT_ID
   ```
10. Klicke auf **Deploy**. Coolify baut das Docker-Image, generiert das SSL-Zertifikat und schaltet die Seite online!


---

### Schritt 4: Storage (MinIO) für Videos & Logs in Coolify bereitstellen

1. Klicke im Projekt auf **+ New Resource** -> Wähle **Service**.
2. Wähle **MinIO** aus dem Service-Katalog.
3. Vergib ein sicheres Root-Passwort und lege einen Bucket an (z. B. `comma-logs`).
4. Setze als Domain z. B. `https://storage.markenjaden.de` oder mappe es auf den Server.

---

### Schritt 5: StarPilot auf deinem Comma 4 konfigurieren

In StarPilot auf deinem Comma 4 ist `drive.markenjaden.de` bereits als wählbarer Server hinterlegt.
* Sobald du in StarPilot den Connect-Server auf **Drive (`drive.markenjaden.de`)** stellst, sendet dein Comma 4 alle Fahrten, Videos, Telemetriedaten und Verbrauchsberichte automatisch an deine Coolify-Instanz!

---

## 3. Manuelle Bereitstellung mit Docker Compose (Alternative)

Falls du Coolify mit einer Docker-Compose Datei nutzt:

```yaml
version: '3.8'

services:
  drive-web:
    build:
      context: https://github.com/MarkenJaden/Drive.git#master
      dockerfile: Dockerfile
    container_name: drive_web
    restart: always
    environment:
      - VITE_API_URL=https://drive.markenjaden.de
      - VITE_ATHENA_URL=wss://drive.markenjaden.de/ws
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.drive.rule=Host(`drive.markenjaden.de`)"
      - "traefik.http.routers.drive.entrypoints=https"
      - "traefik.http.routers.drive.tls.certresolver=letsencrypt"
```

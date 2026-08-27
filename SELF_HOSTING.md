# Self-Hosting Guide für "Drive" (Komplett-Stack) mit Coolify

Dieser Leitfaden beschreibt, wie du den **vollständigen Drive-Stack** (Web-Frontend + FastAPI Backend + Athena WebSocket Gateway + SQLite-Datenbank + Lokaler Video-Storage) unkompliziert über **Coolify** auf deinem eigenen Server unter `drive.markenjaden.de` betreibst.

---

## 1. Was ist im Drive-Stack enthalten?

* **`drive-frontend` (SolidJS Web App):** Dashboards, Routen-Viewer, Video-Player, Live-Karte, GPS-Tracking.
* **`drive-backend` (Python FastAPI):**
  * **API Endpoints:** Vollständige Emulation aller Comma/Konik Connect APIs (`/v1/me/devices`, `/v2/pilotpair`, `/v1/devices/{dongle}/stats`, `/v1/devices/{dongle}/location` etc.).
  * **Athena WebSocket Server (`/ws/v2/{dongle_id}`):** Live-Kommunikation mit dem Comma 4 (Kamera-Snapshots, Remote-Steuerung, Live-Status).
  * **Lokale Datenbank (SQLite):** Speichert Geräte, Routen, GPS-Historie und Fahrtenstatistiken persistent auf deinem Server.
  * **Integrierter Video & Log Storage:** Speichert alle Dashcam-Videos und Logs direkt auf deiner Server-Festplatte (kostenlos & ohne Cloud-Abos).

---

## 2. Einrichtung in Coolify (1-Klick Docker Compose)

### Schritt 1: DNS-Eintrag setzen
Lege bei deinem Domain-Provider (z. B. Cloudflare, Strato, Hetzner) folgenden DNS A-Record an:
* **Host / Name:** `drive` (bzw. `drive.markenjaden.de`)
* **Typ:** `A`
* **Wert / Ziel:** Öffentliche IP-Adresse deines Coolify-Servers

---

### Schritt 2: Anwendung in Coolify anlegen

1. Öffne dein **Coolify Dashboard**.
2. Klicke auf **Projects** -> Wähle oder erstelle ein Projekt (z. B. *"StarPilot Drive"*).
3. Klicke auf **+ New Resource** -> Wähle **Public Repository** (oder Private GitHub App).
4. **Repository URL:** `https://github.com/MarkenJaden/Drive`
5. **Branch:** `master`
6. **Build Pack:** Wähle **Docker Compose**.
7. **Domains:** Setze für den Frontend-Dienst `https://drive.markenjaden.de`.
8. Klicke auf **Deploy**.

Coolify startet automatisch beide Container (`drive-frontend` und `drive-backend`), richtet Let's Encrypt SSL ein und verbindet das Frontend mit dem Backend!

---

## 3. Comma 4 mit deinem Server koppeln

1. Öffne auf deinem Comma 4 das **Galaxy Dashboard** (z. B. unter `http://192.168.178.83:8082`).
2. Stelle in **Toggles / Device Settings** den `ConnectServer` auf **`drive` (`drive.markenjaden.de`)**.
3. Klicke in Galaxy auf **`Gerät koppeln / QR`** ([/pairing](http://192.168.178.83:8082/pairing)).
4. Öffne [https://drive.markenjaden.de](https://drive.markenjaden.de) auf deinem Smartphone oder PC und scanne den QR-Code bzw. rufe den angezeigten Pairing-Link auf.
5. Dein Comma 4 verbindet sich sofort live über Athena WebSocket mit deinem Server!

---

## 4. Google Drive Backup / 100TB Cloud-Sync (Optional)

Wenn du deine Dashcam-Aufnahmen und Logs zusätzlich auf deinem 100TB Google Drive sichern möchtest:

### 1. `rclone` auf deinem Server installieren
```bash
curl https://rclone.org/install.sh | sudo bash
```

### 2. Google Drive in `rclone` einrichten
```bash
rclone config
```
* Wähle `n` für neue Remote, Name z. B. `gdrive`.
* Wähle `drive` (Google Drive) und folge den Authentifizierungsschritten.

### 3. Sync ausführen oder als Cronjob anlegen
```bash
# Manueller Sync
./scripts/sync_gdrive.sh gdrive comma_recordings

# Oder als täglicher Cronjob (z. B. jeden Tag um 03:00 Uhr)
crontab -e
0 3 * * * /var/lib/docker/volumes/drive_drive-data/_data/storage gdrive:comma_recordings --quiet
```

# Drive

**Drive** is the self-hosted web and mobile experience for managing your openpilot & StarPilot devices, analyzing drives, and viewing deep fuel/hybrid efficiency analytics.

Live instance: https://drive.markenjaden.de

## Features

- 🚘 **Device Management & Live View:** Real-time location, live video streaming, and remote SSH.
- ⚡ **Synchronized Fuel & Hybrid Telemetry:** Video-synchronized timeline showing EV mode, regeneration, Atkinson cruising, and power acceleration.
- 📊 **Fuel & Energy Analytics:** Complete 3-tier fuel tracking (individual drives, tank-to-tank refueling cycles, and custom trips).
- ☁️ **Self-Hosted Ready:** Easy deployment via Docker and Nginx.

## Self-Hosting Guide

Please refer to [SELF_HOSTING.md](file:///C:/Users/SCJA03/.gemini/antigravity/scratch/Drive/SELF_HOSTING.md) for full instructions on setting up your own backend, object storage, and reverse proxy at `drive.markenjaden.de`.

## Development

```bash
bun install
bun dev
```


# Server Reliability and PC Wi-Fi Mode

Goal: make Ludovive playable around a real table even before native Android proximity is complete.

## Architecture Decision

The Ludovive server remains authoritative:

- stores sessions, devices, resources, phases, resolutions and audit;
- validates role, phase, resources, proximity/fallback and action availability;
- broadcasts filtered read models by WebSocket;
- lets clients recover with heartbeat plus sync.

Android gestures, Nearby Connections, BLE, NFC and sensors are input adapters. They should emit normalized events such as `gesture.detected`; they do not decide game state.

## PC Wi-Fi Host Mode

For playtests, one laptop can host the table:

1. Connect the PC and all phones to the same Wi-Fi.
2. Prefer a private 5 GHz network or a phone hotspot over a public venue Wi-Fi.
3. Start:

```powershell
.\scripts\start-ludovive-lan.ps1
```

4. Open the dashboard on the PC.
5. On phones, open one of the printed `http://IP:3333/play` URLs.

The dashboard also exposes an `Acces Wi-Fi` panel powered by `GET /network`.

## Stability Rules

- Keep the PC awake and plugged in.
- Keep the server as a local LAN service for the MVP; avoid cloud latency for table gestures.
- Use heartbeat for presence and `/sync` for reconnect after a dropped WebSocket.
- Treat venue Wi-Fi as unreliable unless phone-to-phone traffic and local ports are allowed.
- If the room network blocks clients, use a dedicated phone hotspot or travel router.

## API Surface

- `GET /health`: liveness plus uptime and current session counts.
- `GET /network`: local candidate URLs, LAN guidance, WebSocket paths and reconnect hints.
- `WS /sessions/:code/live?dashboard=true`: full dashboard stream.
- `WS /sessions/:code/live?deviceId=:deviceId`: filtered device stream.
- `POST /sessions/:code/devices/:deviceId/heartbeat`: presence.
- `GET /sessions/:code/devices/:deviceId/sync?after=:sequence&limit=:limit`: reconnect/catch-up.

## Next Hardening Steps

- Add a packaged Windows launcher or tray app.
- Add QR codes for participant URLs.
- Add a connection quality panel: last heartbeat age, reconnect count, WebSocket state.
- Add Android local network discovery once the native app is active.
- Spike Nearby Connections with two real Android devices and submit the same normalized event contract.

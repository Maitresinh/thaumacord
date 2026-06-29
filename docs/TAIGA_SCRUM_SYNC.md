# Taiga Scrum Sync

This repo contains a small Taiga API helper for keeping the MVP backlog aligned with Taiga.

## Environment

Do not commit secrets.

```powershell
$env:TAIGA_BASE_URL = "https://taiga.500nuancesdegeek.fr"
$env:TAIGA_PROJECT_ID = "10"
$env:TAIGA_PROJECT_SLUG = "thaumacord"
$env:TAIGA_USERNAME = "Maitresinh"
```

Then run:

```powershell
./scripts/taiga-scrum-sync.ps1 -Command audit
./scripts/taiga-scrum-sync.ps1 -Command discover
./scripts/taiga-scrum-sync.ps1 -Command apply
./scripts/taiga-scrum-sync.ps1 -Command sandbox-statuses
```

The PowerShell wrapper asks for the Taiga password as a `SecureString` when `TAIGA_AUTH_TOKEN` and `TAIGA_PASSWORD` are not set.

If `TAIGA_PROJECT_ID` is not set, the Node script tries to resolve the project from `TAIGA_PROJECT_SLUG`. For private Taiga projects, this still requires authentication.

Use `discover` to list the projects visible to `TAIGA_USERNAME` when the slug is not obvious from the Taiga URL.

The product has been renamed to Ludovive. The Taiga slug may remain `thaumacord` until the remote project itself is renamed.

Use `sandbox-statuses` to create a `Sandbox` user-story status on every visible project, placed after `En cours` / `In progress` when that status exists.

## Planned Backlog

Epics:

- Transmission Core
- Module Import
- Participant State Model
- Dashboard Read Model
- Action and Rule Events
- Operational Putsch MVP
- Persistence and Reconnect

Sprint:

- `Ludovive MVP Putsch`

Stories:

- Player read model exposes only playable current actions.
- Participant reconnect uses heartbeat and safe fallback to join screen.
- Putsch Lite supports core market actions.
- Facilitator dashboard shows an MVP control panel.
- Ready-to-play Putsch demo session can be created.
- Sessions persist to local JSON storage.

## Notes

The script is intentionally conservative. It creates missing epics and user stories by subject, but does not delete existing Taiga data.

# Project Memory

## Taiga

- Taiga URL: `https://taiga.500nuancesdegeek.fr`
- Taiga project id: `10`
- Product name: `Ludovive`
- Taiga project slug/name: currently `thaumacord` / `Thaumacord` until the remote project is renamed
- Taiga username: `Maitresinh`
- GitHub repo: currently `Maitresinh/thaumacord` until the remote repository is renamed
- Project management target: keep Taiga synchronized with the Ludovive Scrum backlog and MVP increments.
- Never commit Taiga credentials, password, or auth token.
- Preferred local variables:
  - `TAIGA_BASE_URL=https://taiga.500nuancesdegeek.fr`
  - `TAIGA_PROJECT_ID=10`
  - `TAIGA_PROJECT_SLUG=thaumacord`
  - `TAIGA_USERNAME=`
  - `TAIGA_PASSWORD=`
  - `TAIGA_AUTH_TOKEN=`
  - `TAIGA_SPRINT_NAME=Ludovive MVP Putsch`

## Current MVP Done Slice

The following items were implemented and pushed to GitHub on `main`:

- Filter participant read models for playable actions.
- Stabilize participant reconnection flow.
- Expand Putsch core market actions.
- Add facilitator MVP control panel.
- Add ready-to-play Putsch demo endpoint.
- Persist sessions to local JSON storage.

## Taiga Sync

Use:

```powershell
./scripts/taiga-scrum-sync.ps1 -Command audit
./scripts/taiga-scrum-sync.ps1 -Command apply
```

`audit` prints the planned epics and stories without calling Taiga.

`apply` calls the Taiga API. It requires either `TAIGA_AUTH_TOKEN`, or `TAIGA_USERNAME` plus a password supplied by the PowerShell wrapper.

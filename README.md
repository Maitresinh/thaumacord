# Thaumacord

Thaumacord is an Android-first engine for running social live-action games: semi-LARP, murder parties, political intrigue games, hidden-role court games, and other table-adjacent games where phones become props, ledgers, cards, seals, weapons, maps, and secret channels.

It is not tied to one game. A game is imported as a module: roles, resources, phases, cards, actions, gestures, zones, visibility rules, votes, and victory conditions.

## Product Direction

- Android first, iOS later.
- Scrum delivery with playable increments.
- Generic rule engine, not hardcoded game logic.
- Real-time master-of-game backoffice and private player interface.
- Physical phone interactions: touch, tilt, pour, strike, parry, reveal, seal.
- Hybrid maps: real-world zones mapped to imaginary places with game effects.
- Mandragore AI assistant via API at the end of the roadmap, not in the MVP.

## Repository Layout

```text
apps/
  android/      Android native app skeleton
  server/       TypeScript real-time backend prototype
docs/           Product, architecture, Scrum backlog, module schema
modules/        Importable game module examples
```

Current example modules:

- `putsch-lite`
- `long-live-the-king-lite`
- `wolfpack-lite`, a WWII submarine crew coordination module inspired by the coordinated-stations feel of games like Captain Sonar, without copying its rules.

## MVP Scope

The MVP focuses on the playable spine:

- create a game session;
- join by code;
- assign roles;
- progress through phases;
- track resources and private/public information;
- configure actions from a module;
- resolve simple votes and petitions;
- keep an audit log.

Gestures, hybrid maps, and Mandragore are planned after the MVP, with extension points designed early.

## Development

The backend prototype is immediately runnable once dependencies are installed:

```bash
cd apps/server
npm install
npm run dev
```

Then open `http://localhost:3333/` to use the browser-based GM/player prototype. The API also exposes `GET /modules`, `POST /sessions`, `POST /sessions/:code/join`, and `POST /sessions/:code/phases/advance`.

The Android app is a native skeleton. Open `apps/android` in Android Studio after installing Android Studio/Gradle tooling.

## GitHub

Target account: https://github.com/Maitresinh

Recommended repository name: `thaumacord`.

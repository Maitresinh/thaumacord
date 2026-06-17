# Technical Audit: Open Source Reuse Candidates

Date: 2026-06-16

## Goal

Avoid reinventing infrastructure that already exists, without forcing Thaumacord into a framework that does not match its table-first, multi-device, visibility-filtered model.

This audit focuses on reusable foundations for real-time session synchronization, reconnect, missed-message recovery, rule/action execution, Android proximity, and existing Mafia/Werewolf or RPG-table tooling.

## Executive Decision

Do not replace the current Thaumacord prototype immediately.

The current server already models the core domain correctly:

- sessions;
- devices;
- participants;
- visibility-filtered read models;
- audit sequence;
- device sync;
- module actions;
- gestures;
- imaginary zones.

Instead, run targeted spikes:

1. Colyseus spike for live room/state/reconnect.
2. Nearby Connections spike for Android phone-to-phone proximity.
3. boardgame.io rules spike only if Sprint 2/3 rule complexity grows.

Nakama should remain watchlisted, not adopted now.

## Colyseus

Sources:

- https://github.com/colyseus/colyseus
- https://docs.colyseus.io/state

What it provides:

- Node.js multiplayer rooms.
- Authoritative server model.
- Schema-based state synchronization.
- Delta-compressed binary state patches.
- Room lifecycle, matchmaking, reconnection support.
- TypeScript/JavaScript clients.

Fit for Thaumacord:

- A Thaumacord session maps naturally to a Colyseus room.
- Our custom WebSocket live layer, heartbeat, sync, and reconnect could possibly be simplified.
- The authoritative server model matches our direction.

Risks:

- Thaumacord needs different filtered read models per device.
- Colyseus state sync is strongest when clients receive a shared schema state.
- We may still need a custom visibility layer on top.
- Schema/decorator constraints may influence TypeScript config.

Decision:

Spike started. Do not migrate yet.

Spike result on 2026-06-17:

- A minimal isolated Colyseus room can send different filtered read models to dashboard, bound device, and unbound device clients.
- The spike uses targeted `client.send(...)` messages rather than shared schema state.
- This means Colyseus can host the room/lifecycle layer without forcing all clients to receive the same state.
- However, adopting Colyseus for Thaumacord would likely mean using it as room/reconnect infrastructure, while keeping Thaumacord's custom read-model and visibility logic.
- A second test confirms that reconnect still needs Thaumacord-style audit catch-up: the reconnected client receives a filtered read model plus missed audit entries after its last sequence.

Dependency result:

- Colyseus 0.17.10 expects Zod 4 as an optional peer dependency through `@colyseus/core`, while the current Thaumacord server uses Zod 3.
- The spike is therefore isolated in `spikes/colyseus-visibility` and uses its own package manifest.
- `npm audit` reports 8 vulnerabilities in the isolated Colyseus dependency tree, including moderate issues through optional auth/playground dependencies. These must be reassessed before production adoption.

Spike acceptance criteria:

- One Thaumacord session as one Colyseus room.
- Two devices in same room receive different visibility-filtered payloads. Done in isolated spike.
- Reconnection can recover missed state. Tested at room-message level; not yet tested through real Colyseus client/matchmaker transport.
- Existing audit sequence model can coexist or be replaced cleanly. Partially tested through payload sequence preservation.
- Test proves dashboard and bound device do not see the same read model. Done.

Next decision:

Do not adopt Colyseus yet. Its room abstraction is compatible with Thaumacord, but it does not remove the need for our audit sequence, filtered read models, and sync endpoint. Continue only if a real transport/matchmaker spike proves its reconnect lifecycle is materially better than our current Fastify/WebSocket + audit sync model.

## boardgame.io

Sources:

- https://github.com/boardgameio/boardgame.io
- https://boardgame.io/
- https://boardgame.io/documentation/

What it provides:

- Turn-based game state management.
- Moves, phases, turns, multiplayer, logs.
- A mature model for board-game-like state transitions.

Fit for Thaumacord:

- Thaumacord has phases, actions, resources, legal/illegal moves, and audit.
- Its move functions are close to our module action execution direction.

Risks:

- Thaumacord is not primarily a turn-based board game engine.
- It has live, asynchronous, physical, hidden-information, multi-device flows.
- Participants can be people, stations, objects, locations, clocks, etc.
- Visibility-filtered device read models remain a custom concern.

Decision:

Do not adopt now. Use as rule-engine inspiration.

Spike only if module actions become too complex or before implementing votes/petitions.

## Nakama

Sources:

- https://github.com/heroiclabs/nakama
- https://heroiclabs.com/nakama/

What it provides:

- Full open-source game backend.
- Realtime multiplayer.
- Accounts, storage, matchmaking, chat, social systems.

Fit for Thaumacord:

- If Thaumacord becomes an online platform, Nakama could cover many backend concerns.

Risks:

- Heavy operational footprint.
- Adds accounts/social/storage before we need them.
- May complicate the local/table-first model.
- Our current domain is not online matchmade multiplayer.

Decision:

Watchlist only. Do not adopt for Sprint 1/2.

Revisit when persistence, accounts, hosted public sessions, creator accounts, or marketplace features become product requirements.

## Google Nearby Connections

Sources:

- https://developers.google.com/nearby/connections/overview
- https://github.com/google/nearby

What it provides:

- Peer-to-peer discovery and data exchange between nearby devices.
- Offline/local proximity scenarios.
- Real-time nearby device interaction.

Fit for Thaumacord:

- Direct match for physical interactions:
  - touching phones;
  - local exchange;
  - proximity confirmation;
  - table-local fallback when internet is weak.

Risks:

- Android-first fit is good, but iOS story needs separate confirmation.
- Real-world stability with many devices may be a risk.
- Nearby should not become the authoritative game state layer.

Decision:

High-priority spike for Android.

Spike result on 2026-06-17:

- Added an Android-side pure Kotlin contract for Nearby-derived gestures.
- No Google Play Services dependency has been added yet, because the real API spike needs Android Studio/Gradle and two devices.
- Nearby remains an input adapter. The server remains authoritative.
- Normalized events use the existing server contract: `type: "gesture.detected"`, `gesture`, `sourceDeviceId`, and payload metadata.

Architecture direction:

```text
Nearby gesture/proximity signal
-> Android client normalizes event
-> Thaumacord server validates sourceDeviceId, participant, action/gesture
-> state/audit/read models update
```

## Existing Mafia/Werewolf Apps

Examples:

- https://github.com/davidchilin/werewolves_game
- https://f-droid.org/en/packages/io.github.davidchilin.werewolves_game/
- https://github.com/kligarski/mafia-the-party-game
- https://github.com/stephenhu3/open-source-mafia-mobile

What they provide:

- Role assignment.
- Local multiplayer or moderator workflows.
- Mafia/Werewolf-specific night/day flow.

Decision:

Do not reuse as foundation. Use only for UX and product research.

## RPG Character Sheet / VTT Adjacent Tools

Examples:

- https://github.com/Lucas-C/rpg-bonhomme
- https://github.com/Roll20/roll20-character-sheets

What they provide:

- Character sheet formats and UI conventions.
- Data forms for RPG characters.

Decision:

Do not reuse now. Revisit for active sheet UX and import/export conventions.

## Recommended Architecture Choice Now

Keep the current Fastify prototype for Sprint 1 closure.

Why:

- It is small.
- It is tested.
- It encodes our actual domain.
- It already solves visibility, device binding, audit, sync, gestures, and zones in one coherent model.

But run explicit spikes before hardening:

1. Colyseus spike before scaling the live server.
2. Nearby Connections spike before designing physical gesture UX.
3. boardgame.io comparison before implementing complex votes/petitions.

## Backlog Additions

### Spike: Evaluate Colyseus For Live Session Rooms

Acceptance criteria:

- Prototype one Thaumacord session as a Colyseus room.
- Demonstrate dashboard and bound-device filtered payloads.
- Demonstrate reconnect or state catch-up.
- Write adoption decision: adopt, hybrid, or reject.

### Spike: Evaluate Android Nearby Connections

Acceptance criteria:

- Two Android devices discover/connect locally.
- One local interaction produces a normalized gesture payload.
- Payload can be submitted to Thaumacord server.
- Document Android/iOS implications.

### Spike: Compare boardgame.io Rules Model

Acceptance criteria:

- Map Thaumacord phases/actions/resources to boardgame.io phases/moves.
- Identify what can be borrowed conceptually.
- Decide before implementing votes and petitions.

## Final Recommendation

Do not pivot blindly to an existing repo.

Use Thaumacord's current code as the domain prototype, then run controlled spikes against Colyseus and Nearby. If Colyseus proves compatible with per-device visibility, it may replace part of our custom WebSocket/session infrastructure. If not, keep the current server and borrow only patterns.

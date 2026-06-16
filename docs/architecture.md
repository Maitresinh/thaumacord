# Architecture

## Recommended Shape

Thaumacord starts as:

- Android native client;
- TypeScript backend for real-time sessions;
- JSON/YAML game modules;
- data transmission core isolated from rules, persistence, and UI;
- rule engine layered on top of the transmission core;
- audit log as a first-class system.

## Core Problem

The foundation of Thaumacord is not "GM screen versus player screen".

The foundation is a generic live-game data layer:

- identify devices around a table;
- attach devices to participants, roles, stations, teams, or objects;
- move structured events between devices and the authoritative server;
- filter data according to visibility rights;
- synchronize shared and private state;
- log every meaningful change;
- expose enough state for dashboards, sheets, gestures, maps, and later Mandragore.

Game master and player views are projections of this data layer. They should not define the architecture.

## Android

Android native is preferred because the project depends on device capabilities:

- NFC;
- Bluetooth Low Energy;
- vibration and haptics;
- accelerometer and gyroscope;
- orientation;
- location;
- camera/QR fallback.

The Android code should be split into:

- `ui`: screens and presentation;
- `connection`: device identity, pairing, session join, and real-time updates;
- `state`: local read model of synchronized game state;
- `events`: outgoing structured player/device events;
- `rules`: local module types and client-side validation hints;
- `gestures`: sensor/NFC/BLE abstractions;
- `maps`: hybrid map and zone presence;
- `mandragore`: late API integration wrapper.

## Backend

The backend owns authority:

- game session state;
- device and participant registration;
- visibility filtering;
- event validation;
- state synchronization;
- legal action validation;
- rule execution;
- phase transitions;
- audit log;
- messages and notifications.

Suggested modules:

- `modules`: load and validate game modules;
- `sessions`: create and join game sessions;
- `devices`: register phones, pair them to participants, and track connection state;
- `participants`: players, game masters, teams, stations, NPCs, or objects that can own state;
- `events`: ingest and normalize structured changes from devices and sensors;
- `rules`: execute actions and triggers;
- `visibility`: filter state per viewer;
- `realtime`: WebSocket event delivery;
- `readmodels`: produce dashboard, sheet, table, and device-specific views;
- `audit`: immutable action/event history;
- `mandragore`: future API adapter.

## Data Storage

For the first prototype, in-memory storage is acceptable.

For the real MVP, prefer PostgreSQL because the system needs:

- durable audit logs;
- relational entities such as sessions, devices, participants, roles, cards, resources, actions;
- JSON fields for module-defined state;
- future analytics from playtests.

## Real-Time Events

Minimum event types:

- `session.created`;
- `device.registered`;
- `device.connected`;
- `participant.joined`;
- `participant.bound_to_device`;
- `role.assigned`;
- `phase.changed`;
- `resource.changed`;
- `status.applied`;
- `status.cleared`;
- `card.drawn`;
- `action.requested`;
- `action.resolved`;
- `vote.opened`;
- `vote.cast`;
- `vote.resolved`;
- `zone.entered`;
- `zone.exited`;
- `visibility.changed`;
- `audit.appended`.

## First Technical Milestone

The first useful application milestone is a generic transmission loop:

1. A device joins a session.
2. The server binds it to a participant.
3. The device sends a structured event.
4. The server validates and stores the event.
5. The server updates authoritative state.
6. The server emits filtered updates to each connected device.
7. A dashboard read model receives a complete, auditable view.

Only after this loop is solid should the product specialize into GM views, player sheets, votes, gestures, or maps.

# Architecture

## Recommended Shape

Thaumacord starts as:

- Android native client;
- TypeScript backend for real-time sessions;
- JSON/YAML game modules;
- rule engine isolated from transport, persistence, and UI;
- audit log as a first-class system.

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
- `session`: connection and real-time updates;
- `rules`: local module types and client-side validation hints;
- `gestures`: sensor/NFC/BLE abstractions;
- `maps`: hybrid map and zone presence;
- `mandragore`: late API integration wrapper.

## Backend

The backend owns authority:

- game session state;
- player visibility;
- legal action validation;
- rule execution;
- phase transitions;
- audit log;
- messages and notifications.

Suggested modules:

- `modules`: load and validate game modules;
- `sessions`: create and join game sessions;
- `rules`: execute actions and triggers;
- `visibility`: filter state per viewer;
- `realtime`: WebSocket event delivery;
- `audit`: immutable action/event history;
- `mandragore`: future API adapter.

## Data Storage

For the first prototype, in-memory storage is acceptable.

For the real MVP, prefer PostgreSQL because the system needs:

- durable audit logs;
- relational entities such as sessions, players, roles, cards, resources, actions;
- JSON fields for module-defined state;
- future analytics from playtests.

## Real-Time Events

Minimum event types:

- `session.created`;
- `player.joined`;
- `role.assigned`;
- `phase.changed`;
- `resource.changed`;
- `card.drawn`;
- `action.requested`;
- `action.resolved`;
- `vote.opened`;
- `vote.cast`;
- `vote.resolved`;
- `zone.entered`;
- `zone.exited`;
- `audit.appended`.


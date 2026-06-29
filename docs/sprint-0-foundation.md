# Sprint 0 Foundation

## Goal

Establish Ludovive as a generic live-game data transmission app, not as a GM/player screen pair.

The first architectural target is a reliable loop:

```text
device -> event -> server validation -> state update -> visibility filter -> device/dashboard read model -> audit
```

## Core Concepts

### Device

A physical phone, tablet, browser, or future sensor endpoint connected to a session.

Examples:

- a player's phone;
- a facilitator tablet;
- a table display;
- a phone used as a fictional object;
- a BLE/NFC bridge;
- a test browser.

### Participant

Anything that can own game state.

Examples:

- player character;
- team;
- submarine station;
- role;
- NPC;
- location;
- faction;
- object;
- hidden clock.

### Event

A structured message that requests or records a change.

Examples:

- device joined;
- participant claimed;
- resource changed;
- status applied;
- gesture detected;
- zone entered;
- action requested;
- action resolved;
- dashboard override.

### Read Model

A filtered view of authoritative state.

Examples:

- participant phone view;
- facilitator dashboard;
- table display;
- debug audit;
- Mandragore context payload.

## Sprint 0 Stories

### Register a Device

As a device, I can register in a session so that the server can track my connection and route updates.

Acceptance criteria:

- A device has an id.
- A device has a display name or generated label.
- A device has connection metadata.
- Registration creates an audit event.

### Bind a Device to a Participant

As a facilitator or module rule, I can bind a device to a participant so that state updates can be filtered correctly.

Acceptance criteria:

- A device can be unbound.
- A device can be bound to one participant.
- Future support for multiple devices per participant is not blocked.
- Binding creates an audit event.

### Send a Structured Event

As a device, I can send a structured event so that the server can validate and apply it.

Acceptance criteria:

- Event has type, source device, optional participant, payload, timestamp.
- Unknown event types are rejected or stored as debug-only.
- Accepted events are appended to audit.

### Produce a Dashboard Read Model

As a dashboard, I can request the complete current session read model.

Acceptance criteria:

- It includes devices.
- It includes participants.
- It includes current state.
- It includes recent audit events.


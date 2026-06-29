# Sprint 1: Connection and Data Exchange

## Sprint Goal

Prove the core Ludovive loop before building game-specific interfaces.

The sprint is successful when several devices can connect to a session, bind to participants, send structured events, receive synchronized state, and leave a readable audit trail.

## Not The Goal Yet

This sprint does not aim to build a polished GM view or player sheet.

Those are later read models. The first problem is transmission:

```text
device connects -> device binds to participant -> device sends event -> server validates -> state/audit changes -> filtered read model updates
```

## User Stories

### Receive Validation Feedback

As a mobile client, I receive structured validation errors when I send an invalid payload.

Acceptance criteria:

- Malformed JSON-shaped payloads return `400`.
- Response includes `error: "Validation failed"`.
- Response includes field-level `issues`.

### Order Synchronized Updates

As a synchronized client, I can order audit and live updates without guessing.

Acceptance criteria:

- Each audit entry has an `id`.
- Each audit entry has a monotonic per-session `sequence`.
- Live state-change broadcasts include the sequenced audit entry.
- Clients can request audit entries after their last applied sequence.
- Device clients can request read model and catch-up audit in one sync call.

### Register Device

As a table device, I can register in a session so that Ludovive can identify the source of future data.

Acceptance criteria:

- A session code is required.
- A device id is generated.
- Device display name is stored.
- Device connection metadata is stored.
- `device.registered` is added to audit.

### Track Device Connection

As a table device, I can report that I am still present or explicitly disconnected.

Acceptance criteria:

- Unknown device is rejected.
- Heartbeat marks the device connected.
- Disconnect marks the device disconnected.
- `lastSeenAt` is updated.
- Change is audited and broadcast.

### Create Participant

As a facilitator or module, I can create a participant so that game state has an owner.

Acceptance criteria:

- Participant can be a person, team, station, object, location, or clock.
- Participant owns resources and statuses.
- Participant can be unbound from any device.
- `participant.created` is added to audit.

### Bind Device To Participant

As a facilitator or joining flow, I can bind a device to a participant.

Acceptance criteria:

- Unknown device is rejected.
- Unknown participant is rejected.
- Successful binding updates the device.
- `participant.bound_to_device` is added to audit.

### Send Structured Event

As a connected device, I can send a structured event.

Acceptance criteria:

- Event has `type`, optional `sourceDeviceId`, optional `participantId`, and `payload`.
- Event can include `actionId` to execute a module action.
- Gesture events can resolve to a currently available module action.
- If `participantId` is omitted, a bound `sourceDeviceId` can identify the participant.
- Unknown source device is rejected.
- Unknown participant is rejected.
- Unknown action is rejected.
- Action role, phase, and resource costs are validated.
- Supported action effects update participant resources or statuses.
- Accepted event is added to audit.
- Server returns the dashboard read model after acceptance.

### Read Dashboard State

As a dashboard, I can request a complete read model.

Acceptance criteria:

- Response includes devices.
- Response includes participants.
- Response includes module and phase.
- Response includes audit.

### Read Participant State

As a participant-bound surface, I can request my filtered read model.

Acceptance criteria:

- Response includes my participant state.
- Response includes available actions for my current role, phase, and resources.
- Blocked actions include blocking reasons so the interface can hide or disable them.
- Response includes public identity of other participants.
- Response includes recent audit.
- It does not require a GM/player distinction.

### Receive Live Updates

As a connected device or dashboard, I can subscribe to a session stream so that I receive updates when another device sends data.

Acceptance criteria:

- WebSocket endpoint exists at `/sessions/:code/live`.
- Dashboard clients can subscribe with `?dashboard=true`.
- Device clients can subscribe with `?deviceId=:deviceId`.
- Client receives `live.connected` on subscription.
- Client receives `device.registered`.
- Client receives `participant.created`.
- Client receives `participant.bound_to_device`.
- Client receives `event.accepted`.
- Broadcast payload includes a read model filtered for the subscribing audience.

### Read Device State

As a connected device, I can request the state that this physical phone is allowed to see.

Acceptance criteria:

- Unknown device is rejected.
- Unbound device receives minimal public pairing state.
- Bound device receives its participant-specific read model.
- Dashboard-only data is not exposed to device read models.

### Exchange Resources Between Participants

As a connected surface, I can transfer declared resources between two participants without hard-coding a player/GM model.

Acceptance criteria:

- Source can be supplied as `fromParticipantId`.
- Source can be inferred from a bound `sourceDeviceId`.
- Target participant is required.
- Resources are supplied as positive integer amounts.
- Unknown source device is rejected.
- Unknown participants are rejected.
- Unknown resources are rejected.
- Transfers cannot cross module resource bounds.
- Invalid exchanges do not partially apply resource changes.
- Accepted exchange is added to audit and broadcast.
- Dashboard sees all exchanges.
- Participant-bound read models only see exchanges involving that participant.

### Enter Imaginary Zone

As a mapped real-world interaction, a participant can enter an imaginary module zone.

Acceptance criteria:

- Unknown zone is rejected.
- Unknown participant is rejected.
- Unknown source device is rejected.
- Participant location is updated.
- Bound source device can identify the participant when `participantId` is omitted.
- Supported zone effects update session state.
- `zone.entered` is added to audit and broadcast.

# Scrum Backlog

## Definition of Ready

- User value is clear.
- Acceptance criteria are written.
- Dependencies are identified.
- Visibility and audit impact are considered.
- Playtest impact is known when relevant.

## Definition of Done

- Feature is implemented.
- Tests are added for rule behavior when applicable.
- Device, participant, and visibility behavior are checked.
- Audit log entries are created for important actions.
- Documentation or module examples are updated.
- Feature can be demonstrated in a sprint review.

## Epics

### Epic 1: Transmission Core

As a table device, I can connect to a session, identify myself, send structured events, and receive only the synchronized state I am allowed to see.

Acceptance criteria:

- A session has a code.
- Devices can join by code.
- Devices can be bound to participants.
- Incoming events are normalized before they affect state.
- Every accepted event is logged.
- Each connected device receives a filtered update.

### Epic 2: Module Import

As a creator, I can define roles, resources, phases, actions, cards, and visibility rules in a module file.

Acceptance criteria:

- A sample module validates against the schema.
- Invalid modules return readable errors.
- The same engine can load at least two example modules.

### Epic 3: Participant State Model

As a module, I can define participants that own state, regardless of whether they are players, teams, stations, NPCs, locations, or objects.

Acceptance criteria:

- A participant can own resources, statuses, cards, permissions, and location.
- A participant can be controlled by one or more devices.
- A participant can be visible, hidden, shared, or dashboard-only.
- State changes are represented as auditable events.

### Epic 4: Dashboard Read Model

As an operator dashboard, I can receive a complete read model of the session so that the human facilitator can understand and correct the table state.

Acceptance criteria:

- The dashboard receives all state allowed by the module.
- It shows devices, participants, resources, statuses, locations, events, and audit.
- Manual corrections are logged.
- It is implemented as a projection of the transmission core, not as a special case.

### Epic 5: Action and Rule Events

As a module, I can declare actions that consume events, apply rules, and update state.

Acceptance criteria:

- Actions can be available or unavailable depending on state.
- Actions can target participants, resources, zones, cards, or the whole session.
- Vote weight can use a resource such as favor.
- Special role exceptions can be represented.
- The result is logged and visible according to rules.

### Epic 6: Physical Gestures

As a device, I can turn physical gestures into structured events.

Acceptance criteria:

- Each gesture has a manual fallback.
- Critical gestures require confirmation.
- The audit log records gesture source and fallback status.

### Epic 7: Hybrid Mapping

As a module or facilitator, I can map real places to imaginary zones with game effects.

Acceptance criteria:

- A zone can be defined manually.
- A zone can unlock actions.
- Zone effects can be public or private.

### Epic 8: Mandragore API

As a connected surface, I can ask Mandragore for rule help or strategic suggestions at the end of the roadmap.

Acceptance criteria:

- Mandragore receives only allowed context.
- The API connector is replaceable.
- Answers distinguish rules from interpretation.

### Epic 9: Table-First Character Surfaces

As a participant device, I can display a table-first active sheet that shows current actions and state without making the user search through a form.

Acceptance criteria:

- The surface is generated from participant state and module rules.
- It prioritizes current actions, statuses, resources, and alerts.
- Any change emits a structured event to the transmission core.
- The dashboard receives the corresponding update.

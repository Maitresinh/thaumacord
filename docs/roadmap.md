# Roadmap

## Sprint 0: Project Setup

- Create repository structure.
- Document product brief and architecture.
- Define first module schema.
- Create backend prototype skeleton.
- Create Android skeleton.

## Sprint 1: Session Spine

- Create session.
- Register devices.
- Bind devices to participants.
- Send structured events.
- Broadcast filtered session state.
- Audit transmission events.

First test target:

- session created from `wolfpack-lite`;
- device registered;
- station participant created;
- device bound to participant;
- `sonar.ping` event accepted;
- dashboard read model receives devices, participants, and audit;
- participant read model receives its filtered state.

## Sprint 2: Module Loading and State Model

- Load example module.
- Validate roles, resources, phases, mechanics, and actions.
- Validate components, setup declarations, and setup distributions.
- Start a session from a module.
- Represent participants, devices, resources, statuses, zones, and permissions.
- Bind player-facing actions to reusable mechanisms with `mechanicId`.
- Define the AI import kit format for converting source rules into module drafts.

Operational target:

- Prepare `Putsch Au Panador Core Demo`: players connect, exchange, and facilitator follows/manages state.

## Sprint 3: Read Models and Dashboard

- Device-specific filtered state.
- Complete dashboard read model.
- Phase progression.
- Resource updates.
- Status updates.
- Button-level dashboard flows for the first Putsch operational slice.

## Sprint 4: Actions, Votes, Petitions

- Execute configured actions.
- Execute the first mechanism runners.
- Resolve simple votes.
- Resolve simple petitions and contests.
- Add rule tests.

Operational target:

- Run a dry Putsch session with device binding, participant resources, exchanges, facilitator messages, manual corrections, and audit.

## Sprint 5+: Physical Gestures

- Prototype phone touch confirmation using QR/NFC fallback.
- Prototype tilt transfer.
- Prototype strike/parry gesture as optional non-critical interaction.

## Sprint 6+: Hybrid Mapping

- Define zones.
- Link zone presence to actions.
- Add fictional map display.

## Final Integration: Mandragore

Mandragore has an API and arrives at the end of the project.

- Define context payloads.
- Filter hidden information.
- Add replaceable API connector.
- Add rule-help mode.
- Add facilitator arbitration mode.
- Add optional participant strategy mode.

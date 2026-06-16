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
- Game master and player visibility are checked.
- Audit log entries are created for important actions.
- Documentation or module examples are updated.
- Feature can be demonstrated in a sprint review.

## Epics

### Epic 1: Game Session Spine

As a game master, I can create a session from a module so that players can join a playable game.

Acceptance criteria:

- A session has a code.
- Players can join by code.
- The game master sees the player list.
- The audit log records creation and joins.

### Epic 2: Module Import

As a creator, I can define roles, resources, phases, actions, cards, and visibility rules in a module file.

Acceptance criteria:

- A sample module validates against the schema.
- Invalid modules return readable errors.
- The same engine can load at least two example modules.

### Epic 3: Player Interface

As a player, I can see my role, private resources, available actions, and current phase.

Acceptance criteria:

- Hidden information from other players is not shown.
- Actions are filtered by phase and role.
- Resource changes update in real time.

### Epic 4: Game Master Interface

As a game master, I can inspect the whole state, advance phases, resolve votes, and override mistakes.

Acceptance criteria:

- The game master can view all resources and roles.
- Phase changes are broadcast.
- Manual corrections are logged.

### Epic 5: Votes and Petitions

As a player, I can submit and vote on petitions according to the module rules.

Acceptance criteria:

- Vote weight can use a resource such as favor.
- Special role exceptions can be represented.
- The result is logged and visible according to rules.

### Epic 6: Physical Gestures

As a player, I can perform selected actions through phone gestures.

Acceptance criteria:

- Each gesture has a manual fallback.
- Critical gestures require confirmation.
- The audit log records gesture source and fallback status.

### Epic 7: Hybrid Mapping

As a game master, I can map real places to imaginary zones with game effects.

Acceptance criteria:

- A zone can be defined manually.
- A zone can unlock actions.
- Zone effects can be public or private.

### Epic 8: Mandragore API

As a player or game master, I can ask Mandragore for rule help or strategic suggestions at the end of the roadmap.

Acceptance criteria:

- Mandragore receives only allowed context.
- The API connector is replaceable.
- Answers distinguish rules from interpretation.


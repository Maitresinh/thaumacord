# Module Schema Draft

This is the first conceptual schema for importable Ludovive modules.

```json
{
  "id": "string",
  "name": "string",
  "version": "string",
  "timeline": {
    "roundLabel": "Turn",
    "turnCount": 7,
    "durationPolicy": "facilitator-controlled",
    "convergencePhaseId": "audience",
    "decisionPhaseId": "council"
  },
  "players": {
    "min": 3,
    "max": 12
  },
  "resources": [
    {
      "id": "gold",
      "name": "Gold",
      "visibility": "private",
      "min": 0
    }
  ],
  "phases": [
    {
      "id": "diplomacy",
      "name": "Diplomacy",
      "durationSeconds": 900
    }
  ],
  "sessionRoles": [
    {
      "id": "host",
      "name": "Host",
      "description": "Opens the session and manages table flow.",
      "capabilities": ["session.host", "participants.manage", "roles.assign", "phase.control"],
      "canInjectGameElements": false,
      "assignableToRoles": [],
      "optional": false
    },
    {
      "id": "game-authority",
      "name": "Game Authority",
      "description": "Can inject, correct, or arbitrate game elements outside normal player limits.",
      "capabilities": ["resources.adjust", "state.adjust", "components.draw", "messages.send", "resolutions.override"],
      "canInjectGameElements": true,
      "assignableToRoles": ["baron"],
      "optional": true
    }
  ],
  "roles": [
    {
      "id": "baron",
      "name": "Baron",
      "startingResources": {
        "gold": 3,
        "favor": 6,
        "status": 3
      },
      "visibility": "private",
      "victoryCondition": {
        "type": "all",
        "conditions": []
      }
    }
  ],
  "components": [
    {
      "id": "intrigue-card",
      "name": "Intrigue Card",
      "kind": "card",
      "count": 80,
      "visibility": "private",
      "tags": ["deck", "hand"]
    }
  ],
  "setup": {
    "phaseId": "setup",
    "instructions": ["Assign roles", "Distribute starting cards"],
    "distributions": [
      {
        "id": "initial-intrigue",
        "componentId": "intrigue-card",
        "target": "allParticipants",
        "count": 1,
        "visibility": "private"
      },
      {
        "id": "initial-status",
        "componentId": "status-card",
        "target": "allParticipants",
        "countResource": "status",
        "visibility": "private"
      }
    ]
  },
  "mechanics": [
    {
      "id": "direct-gift",
      "name": "Direct Gift",
      "family": "exchange",
      "summary": "One participant transfers a declared resource to another participant.",
      "phases": ["diplomacy"],
      "inputs": [],
      "resolution": {
        "type": "exchange",
        "mode": "immediate"
      },
      "visibility": {
        "dashboard": "full",
        "participants": "involved-only"
      },
      "variants": []
    }
  ],
  "actions": [
    {
      "id": "transfer-gold",
      "name": "Transfer Gold",
      "phase": "diplomacy",
      "actor": "any",
      "target": "player",
      "cost": {},
      "effect": {
        "type": "transferResource",
        "resource": "gold"
      },
      "mechanicId": "direct-gift",
      "gesture": "touch-phones",
      "fallback": "manual-confirmation"
    }
  ],
  "zones": [
    {
      "id": "throne-room",
      "name": "Throne Room",
      "fictionalType": "court",
      "presenceMethod": "manual",
      "effects": []
    }
  ],
  "visibilityRules": [],
  "triggers": []
}
```

## Timeline

`timeline` is loose timing metadata for table-time games. It can describe the round label, total turn count, facilitator timing policy, convergence phase, and decision phase.

`state` can declare initial table-wide state such as market prices, council flags, panic levels, economic indicators, or other shared tracks. The session exposes this state to dashboard and participant read models.

## UI Theme

`uiTheme` lets an imported game carry its own table identity without hard-coding a new app.

It can declare:

- `template`: broad visual family, such as `political-pulp`, `court-intrigue`, `submarine-stations`, or `economic-simulation`;
- `tone`: short flavour text displayed by the UI;
- `colors`: background, panel, ink, muted, accent, secondary, success, warning;
- `icons`: small action/family markers for exchange, contest, vote, live-administration, phases, or game-specific concepts;
- `interactionLabels`: wording for primary gestures and fallback controls.

Buttons remain available as fallback, but player-facing controls should first present the physical gesture declared by the action whenever possible.

## Session Roles

`sessionRoles` separates table operation from in-fiction player roles. This matters because the person who opens a session is not always a classical GM.

- `host` is the technical/session role: it creates or opens the session, accepts devices, assigns roles, and controls phase timing.
- `game-authority` is optional rule authority: it can inject game elements, correct state, arbitrate resolutions, draw components, send private/public messages, or override normal player limits when the module permits it.
- `canInjectGameElements` tells the app whether this session role can introduce or modify game state beyond ordinary participant actions.
- `assignableToRoles` links the session role to in-game roles when needed. In Putsch, the host and the director/MJ authority can be combined or separated. In the submarine module, the host can simply be the captain and does not need injection authority.

Each session stores `sessionRoleAssignments` separately from participants' in-game `roleId`. Optional session roles start disabled; required session roles start enabled but unassigned. The prototype supports:

```http
POST /sessions/:code/session-roles/:sessionRoleId
```

```json
{
  "participantId": "participant-id",
  "enabled": true
}
```

The server validates that the session role exists, that the participant exists when supplied, and that `assignableToRoles` allows the participant's current in-game role.

When a module declares at least one session role with `canInjectGameElements: true`, sensitive table mutations require one of those roles to be enabled and assigned to a participant. The current prototype enforces this for resolution arbitration, direct resource correction, and component draws. Modules without an injection-authority role keep the previous open dashboard behavior.

The server keeps an active `phaseClock` on each session:

- `turn`;
- `phaseId`;
- `phaseStartedAt`;
- `phaseDurationSeconds`;
- `phaseEndsAt`;
- `facilitatorControlled`.

Default phase durations come from `phases[].durationSeconds`. A facilitator can override the current phase with `POST /sessions/:code/phases/timer`.

## Components And Setup

`components` describe importable game elements such as cards, decks, tokens, tracks, documents, role cards, clue cards, or physical props.

`setup` declares the mise en place:

- `phaseId`: setup phase;
- `instructions`: facilitator-facing setup checklist;
- `distributions`: initial component distribution rules.

Distribution entries can use either a fixed `count` or `countResource`. `countResource` draws a different number of components for each target participant based on that participant's current resource value, which is useful for Long Live the King status cards and similar role-derived setup.

The prototype supports `POST /sessions/:code/setup/distribute`, which draws from session `componentPools`, applies setup distributions to `participant.inventory`, and audits `setup.distributed`.

The prototype also supports `POST /sessions/:code/components/draw` for facilitator or rule-driven draws:

```json
{
  "participantId": "participant-id",
  "componentId": "intrigue-card",
  "count": 2,
  "reason": "audience-income"
}
```

`sourceDeviceId` can stand in for `participantId` when the device is bound. Draws are rejected if the component pool does not contain enough remaining elements.

## Mechanics

Mechanics describe reusable workflows that modules can create, vary, and bind to player-facing actions without hard-coding a specific game in the server.

Supported fields in the prototype:

- `id`: stable identifier used by actions through `mechanicId`;
- `name`: table-facing name;
- `family`: broad mechanism family such as `exchange`, `petition`, `vote`, `contest`, `coordination`, `hidden-role`, `facilitator-action`, `live-administration`, `triggered-ability`, `zone-effect`, `information-action`, or `card-or-object`;
- `summary`: short designer-facing description;
- `phases`: phases where this mechanism normally applies;
- `inputs`: free structured input declaration;
- `resolution`: free structured resolution declaration;
- `visibility`: free structured visibility policy;
- `variants`: free structured list of supported variants.

Actions can include `mechanicId` to bind a verb to a mechanism.

## Supported Action Execution In Prototype

`POST /sessions/:code/events` accepts an optional top-level `actionId`.

When `actionId` is present, the server currently checks:

- the action exists in the imported module;
- the event has a valid `participantId`;
- the participant role matches `action.actor`;
- the current phase matches `action.phase`, unless the action phase is `*`;
- resource costs can be paid without crossing resource bounds.

Supported effects:

- `adjustResource`: adds `delta` to a participant resource;
- `setState`: writes a value to participant `statuses`;
- `message`: stores a simple last message status;
- `revealContactHint`: stores a contact hint status;
- `runTimedIncome`: runs a table-level income step from a source resource into a target resource, optionally drawing components by turn parity and role.

`runTimedIncome` is meant for repeated administrative phases such as Long Live the King Audience or economic-simulation ticks. In live games, it can be used either as a guided in-app sequence led by the authority, or as the recording/application step after the table phase resolution has happened. It supports:

- `resource`: participant resource to credit;
- `amountResource`: participant resource used as the credit amount;
- `componentId`: optional component pool to draw from;
- `oddTurnCount` and `evenTurnCount`: default component draw count by turn parity;
- `fixedDrawByRole`: role-specific draw count that replaces the parity count;
- `bonusDrawByRole`: role-specific bonus added to the parity count;
- `lowStatusResource`, `lowStatusThreshold`, and `lowStatusIncomeMultiplier`: optional reduced income rule;
- `excludeRoles`: roles ignored by the income step.

When a module declares a session role with `canInjectGameElements: true`, `runTimedIncome` requires an active assignment for one of those roles.

If an action is bound to a workflow mechanism such as `petition`, `vote`, `contest`, or `live-administration`, unsupported immediate effects can open a `pendingResolution` instead of being discarded. The resolution keeps the action, participant, payload, mechanic id, mechanic family, and module-declared resolution/visibility policy for later rule handling.

When the facilitator resolves a pending resolution, the server records the selected outcome and creates a `resolution` channel message. Participant-bound resolutions notify only the concerned participant; table-level resolutions notify all participants.

Resolution payloads can include `effects` to apply generic consequences while resolving. Supported effects are `adjustResource` with optional `participantId`, `resource`, and `delta`; `setState` with optional `participantId`, `state`, and `value`; `setSessionState` with `state` and optional `value`; `adjustSessionCounter` with `state`, `delta`, and optional `min`/`max`; and `scaleSessionCounter` with `state`, `factor`, optional `rounding` (`floor`, `ceil`, `round`), and optional `min`/`max`. When a participant effect omits `participantId`, it targets the participant attached to the pending resolution.

Mechanic resolution declarations can also include `outcomes`, an array of `{ id, label, description, effects }`. Declared outcomes replace the generic facilitator suggestions for that mechanic, and their effects are applied automatically when the facilitator chooses the matching outcome. Manual `payload.effects` supplied by the dashboard are applied after the declared outcome effects.

If an action is bound to an `exchange` mechanic, or declares an effect of type `transferBundle` or `transferResource`, the participant payload can apply an immediate exchange with `toParticipantId` and `resources`. The exchange is validated against resource bounds and the action/mechanic resource limits, then recorded in the session exchange log.

Participant read models expose `availableActions` derived from module actions. Each item contains `id`, `name`, `phase`, optional `gesture`, optional `fallback`, optional `mechanicId`, optional `inputs`, `available`, and `blockedBy`.

When an action references a mechanic, `inputs` mirrors the mechanic inputs that a client must ask the participant to provide. Inputs with `source: "actor-or-bound-device"` are omitted because the server can infer them from the bound phone. The prototype participant app currently renders simple controls for `text`, `participant`, `participant-list`, `enum`, and `resource-bundle`.

Gesture events can omit `actionId` when the module action has a matching `gesture`. The server only resolves the gesture if the action is currently available for the participant.

For mobile clients, `sourceDeviceId` can stand in for `participantId` after the device has been bound to a participant.

## Participant Exchanges In Prototype

`POST /sessions/:code/exchanges` transfers declared resources from one participant to another.

Payload:

- `fromParticipantId` or a bound `sourceDeviceId`;
- `toParticipantId`;
- `resources`, a map of resource ids to positive integer amounts.

The server validates:

- source device, when provided;
- source and target participants;
- known resources;
- source debit and target credit against module resource bounds.

Accepted exchanges are recorded in `exchanges`, added to audit as `exchange.completed`, and broadcast with filtered read models. Dashboard read models see all exchanges. Participant-bound read models only see exchanges involving that participant.

## Dashboard Aggregates

Dashboard read models include `aggregates` for facilitator analysis and economic-simulation modules:

- participant totals by role and location;
- resource total, min, max, average, and participant count;
- inventory totals by component;
- component pool remaining counts.

Participant-bound read models do not expose these global aggregates.

## Facilitator Messages

`POST /sessions/:code/messages` lets a dashboard or facilitator surface send structured messages:

```json
{
  "target": "participant",
  "participantId": "participant-id",
  "text": "Le roi vous convoque en prive.",
  "channel": "audience"
}
```

Targets:

- `participant`: visible only to the target participant and dashboard;
- `allParticipants`: visible to all participant-bound read models and dashboard;
- `dashboard`: visible only to dashboard.

Messages are audited as `message.sent` and broadcast through live read models.

## Supported Zone Effects In Prototype

`POST /sessions/:code/zones/:zoneId/presence` moves a participant to a module zone and applies supported zone effects.

Supported zone effects:

- `unlockPhase`: adds the phase id to session `unlockedPhases`;
- `increaseRisk`: increments a session risk counter;
- `periodicDamageCheck`: records a pending resolution for audit/read-model visibility.

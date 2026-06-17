# Module Schema Draft

This is the first conceptual schema for importable Thaumacord modules.

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
- `family`: broad mechanism family such as `exchange`, `petition`, `vote`, `contest`, `coordination`, `hidden-role`, `facilitator-action`, `triggered-ability`, `zone-effect`, `information-action`, or `card-or-object`;
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
- `revealContactHint`: stores a contact hint status.

If an action is bound to a workflow mechanism such as `petition`, `vote`, or `contest`, unsupported immediate effects can open a `pendingResolution` instead of being discarded. The resolution keeps the action, participant, payload, mechanic id, mechanic family, and module-declared resolution/visibility policy for later rule handling.

When the facilitator resolves a pending resolution, the server records the selected outcome and creates a `resolution` channel message. Participant-bound resolutions notify only the concerned participant; table-level resolutions notify all participants.

Resolution payloads can include `effects` to apply generic consequences while resolving. Supported effects are `adjustResource` with optional `participantId`, `resource`, and `delta`; `setState` with optional `participantId`, `state`, and `value`; `setSessionState` with `state` and optional `value`; and `adjustSessionCounter` with `state`, `delta`, and optional `min`/`max`. When a participant effect omits `participantId`, it targets the participant attached to the pending resolution.

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

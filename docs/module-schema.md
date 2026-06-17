# Module Schema Draft

This is the first conceptual schema for importable Thaumacord modules.

```json
{
  "id": "string",
  "name": "string",
  "version": "string",
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

Participant read models expose `availableActions` derived from module actions. Each item contains `id`, `name`, `phase`, optional `gesture`, optional `fallback`, `available`, and `blockedBy`.

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

## Supported Zone Effects In Prototype

`POST /sessions/:code/zones/:zoneId/presence` moves a participant to a module zone and applies supported zone effects.

Supported zone effects:

- `unlockPhase`: adds the phase id to session `unlockedPhases`;
- `increaseRisk`: increments a session risk counter;
- `periodicDamageCheck`: records a pending resolution for audit/read-model visibility.

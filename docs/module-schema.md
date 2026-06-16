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


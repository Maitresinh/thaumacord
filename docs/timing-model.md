# Timing Model

Ludovive games are table-time games. The server tracks time as a facilitator-controlled structure, not as an autonomous board-game clock.

## Concepts

- `turn`: current round/cycle number, starting at 1.
- `phase`: current module phase.
- `phaseStartedAt`: server time when the phase clock was started or reset.
- `phaseDurationSeconds`: active duration for the current phase.
- `phaseEndsAt`: expected end time if a duration is active.
- `facilitatorControlled`: true when the current duration was set by the facilitator.

Modules can declare a loose `timeline` object. For example, Long Live the King uses:

```json
{
  "roundLabel": "Tour",
  "turnCount": 7,
  "durationPolicy": "facilitator-controlled",
  "convergencePhaseId": "audience",
  "decisionPhaseId": "council"
}
```

The `convergencePhaseId` marks the phase toward which play returns. In Long Live the King, diplomacy, cards, favor changes, petitions, and rulings converge toward the king's audience/council sequence.

## Server Behavior

- Session creation starts turn 1 at the first module phase.
- Phase duration defaults to the module phase `durationSeconds`.
- `POST /sessions/:code/phases/advance` moves to the next phase.
- When phase advancement wraps back to phase index 0, the turn number increments.
- `POST /sessions/:code/phases/timer` lets the facilitator set the current phase duration or end time.

## Endpoint

`POST /sessions/:code/phases/timer`

Payload:

```json
{
  "durationSeconds": 600,
  "facilitatorControlled": true
}
```

or:

```json
{
  "endsAt": "2026-06-17T20:15:00.000Z",
  "facilitatorControlled": true
}
```

The server audits `phase.timer_set` and broadcasts the updated read model.

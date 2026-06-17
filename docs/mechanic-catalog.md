# Mechanic Catalog

This catalog extracts reusable mechanisms from the current Thaumacord examples and nearby role/social/table games. A mechanism is not a rulebook by itself. It is a configurable pattern that a module can bind to actions, phases, resources, statuses, visibility rules, and facilitator decisions.

## Sources Read

- `Putsch cahier des charges.doc`: resource transactions, timed income, coup attempts, hidden counter-bids, facilitator backoffice.
- `Long Live the King` spreadsheet: petitions, weighted votes, democratic votes, authority rulings, status cards, intrigue cards, immunity, cancellation, delayed effects, role-specific victory conditions.
- Thaumacord examples: `putsch-lite`, `long-live-the-king-lite`, `wolfpack-lite`.
- Related families: Mafia/Werewolf, Blood on the Clocktower, Two Rooms and a Boom, Captain Sonar-like crew coordination.

## Mechanism Families

| Family | Core Question | Examples | Engine Need |
| --- | --- | --- | --- |
| `exchange` | Who gives what to whom, and under what visibility? | Putsch market, gold transfer, bribes, forced payments | Transfer validation, optional acceptance, involved-only visibility |
| `petition` | Who asks for a ruling, who can influence it, who decides? | Long Live the King council petitions | Request queue, votes, authority decision, delayed resolution |
| `contest` | Which side wins after commitments, bids, checks, or opposed resources? | Putsch coup, submarine attack, duels | Commitments, reveal policy, compare function, tie policy |
| `vote` | How is collective preference captured and weighted? | Council votes, democratic emergency votes, day lynch votes | Ballots, weights, quorum/majority, visibility |
| `hidden-role` | What does each participant know, and when can it change? | Mafia/Werewolf, Blood on the Clocktower, role cards | Secret assignment, private info, death/status, moderator prompts |
| `facilitator-action` | What can the authority receive, alter, reveal, validate, or override? | King, moderator, Storyteller, GM dashboard | Inbox, approvals, corrections, private/public sends |
| `triggered-ability` | When does a passive or once-per-turn ability fire? | Status cards, immunities, counters, doctor/protection | Trigger registry, usage limits, target restrictions |
| `timed-income` | What refreshes at a phase or timer boundary? | Putsch income, Long Live the King audience allowance | Scheduled grants, caps, phase hooks |
| `economic-simulation` | How do supply, demand, prices, liquidity, shocks, and queues evolve? | Sheep market, monetary creation, bank run, inflation/deflation simulations | Aggregates, agents, orders, price rules, liquidity pools, confidence shocks |
| `zone-effect` | What changes when a real/fictional location is entered? | Court rooms, black market, sea zones | Zone presence, effects, pending resolutions |
| `coordination` | How do specialized roles combine partial actions? | Submarine crew stations, team command | Team messages, prerequisites, shared statuses |
| `information-action` | Who learns what, with what precision and audit trail? | Sonar hints, spies, informers, seers | Private reads, redacted audit, precision levels |
| `card-or-object` | Who owns, reveals, spends, disables, steals, or verifies an object? | Intrigue cards, status cards, documents | Object ownership, zones, validation, cancellation |

## Minimum Mechanic Shape

```json
{
  "id": "petition-vote",
  "name": "Petition et vote du conseil",
  "family": "petition",
  "summary": "Un participant depose une demande, les autres votent, puis une autorite tranche.",
  "phases": ["council"],
  "inputs": [],
  "resolution": {},
  "visibility": {},
  "variants": []
}
```

Actions bind to mechanisms with `mechanicId`. The action remains the player-facing verb. The mechanism describes the reusable workflow behind that verb.

## Initial Implementation Priority

1. `exchange`: direct transfer is implemented; add pending/accepted/cancelled exchanges next.
2. `petition` plus `vote`: opening pending petition resolutions is implemented; add vote collection and authority decision next.
3. `contest`: opening pending contest resolutions is implemented; add sealed commitments and opposed checks next.
4. `facilitator-action`: dashboard receives, approves, rejects, edits, reveals, and sends.
5. `triggered-ability`: counters, immunities, once-per-turn abilities.
6. `hidden-role` and `information-action`: Mafia/Werewolf/Blood-on-the-Clocktower-like support.
7. `economic-simulation`: sheep market, money creation, bank run, liquidity, confidence, supply/demand shocks.
8. `card-or-object`: generalized cards, documents, status cards, physical/object tokens.

## Current Runner Behavior

When an action has a `mechanicId` and its effect is not one of the immediate built-in effects, the server can open a `pendingResolution` for workflow families such as `petition`, `vote`, and `contest`.

The pending resolution stores:

- the participant who opened it;
- the action id;
- the mechanic id and family;
- the original event payload;
- the module-declared `resolution` and `visibility` policy.

This deliberately does not decide the outcome yet. Follow-up runners will collect votes, sealed commitments, facilitator decisions, or other inputs before closing the resolution.

## Design Notes

- A mechanism must be data-driven enough to vary per module.
- Resolution belongs on the server; input gestures are only input signals.
- Visibility is part of the mechanism, not a UI afterthought.
- Facilitator overrides are first-class. Many role/social games rely on a human authority to keep pace, correct mistakes, or preserve drama.
- The app should not hard-code `GM` versus `player`; it should model audiences, permissions, and message routing.
- Economic simulations should start from dashboard aggregates rather than a full economic engine: total resources, inventory totals, component pools, counts by role/location, and later event-series analytics.

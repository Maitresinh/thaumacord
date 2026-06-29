# Import Kit Format

The import kit is the target format for turning a game rulebook into a Ludovive module with AI assistance.

It is not only a rules summary. It must contain the playable structure: phases, setup, game components, roles, resources, actions, mechanisms, timing, visibility, and facilitator controls.

## Conversion Pipeline

1. Ingest source rules: PDF, DOCX, spreadsheet, markdown, pasted text, or designer notes.
2. Extract entities: roles, resources, cards, decks, tokens, locations, tracks, statuses, phases, actions, victory conditions.
3. Extract mechanisms: exchange, petition, vote, contest, hidden-role, facilitator-action, live-administration, timed-income, economic-simulation, card-or-object, triggered-ability, coordination.
4. Extract setup: initial phase, required components, role assignment, player distribution, decks/tracks, starting resources.
5. Generate a module JSON.
6. Validate schema and references.
7. Produce a designer review report with uncertainties and manual choices.
8. Import into Ludovive.

## Kit Sections

```json
{
  "source": {},
  "module": {},
  "conversionNotes": [],
  "reviewChecklist": []
}
```

The server currently loads the `module` shape directly. `source`, `conversionNotes`, and `reviewChecklist` are for the future Mandragore/import assistant.

## Module Sections

### Timeline

Declares table time: setup phase, turn count, facilitator-controlled duration, convergence phase, and decision phase.

### Components

Components are game elements that can be owned, held, revealed, disabled, spent, verified, or placed on a track.

Examples:

- intrigue cards;
- status cards;
- decision cards;
- health cards;
- mobilization/rebellion cards;
- clue cards;
- role cards;
- tokens;
- physical props;
- fictional map markers.
- market instruments such as sheep, cash, deposits, loans, bank reserves, debt notes, and confidence markers.

Current shape:

```json
{
  "id": "intrigue-card",
  "name": "Carte Intrigue",
  "kind": "card",
  "count": 80,
  "visibility": "private",
  "tags": ["deck", "hand"]
}
```

### Setup

Setup is a first-class phase. It prepares the table before ordinary play.

Current shape:

```json
{
  "phaseId": "setup",
  "instructions": [
    "Assigner les roles.",
    "Distribuer les cartes initiales."
  ],
  "distributions": [
    {
      "id": "initial-intrigue",
      "componentId": "intrigue-card",
      "target": "allParticipants",
      "count": 1,
      "visibility": "private"
    }
  ]
}
```

Current server behavior:

- `POST /sessions/:code/setup/distribute` applies declared distributions.
- Target `allParticipants` gives components to every participant.
- Target `role` gives components only to participants with that `roleId`.
- Components are drawn from session `componentPools` and stored in `participant.inventory`.
- The operation is audited as `setup.distributed`.
- `POST /sessions/:code/components/draw` can draw components later for phase income, card effects, facilitator grants, or rule-driven events.

## AI Review Checklist

The importer must ask for review when:

- a card/effect has ambiguous timing;
- a role can interrupt another rule;
- an ability can be used once per turn/phase/game;
- hidden information has unclear audience;
- a live table phase resolution must be recorded after being played physically or orally;
- a resource can go below zero or has no explicit cap;
- a setup distribution depends on player count;
- a deck order, shuffle, reveal, discard, or recycle rule is important;
- the facilitator has discretionary authority;
- the rulebook uses examples instead of formal rules.

## Near-Term Import Targets

1. Convert Long Live the King spreadsheet rows into component declarations and mechanism candidates.
2. Convert Putsch rules into exchange, market, minister-council recording, timed income, and contested-coup mechanisms.
3. Add a `market-sheep-lite` module for price formation, supply, demand, shocks, and inventory pressure.
4. Add a monetary simulation module for credit creation, reserve pressure, confidence, and bank run dynamics.
5. Add component validation: actions and setup distributions must reference existing components.
6. Add deck/hand operations beyond numeric inventory.

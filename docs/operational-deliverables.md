# Operational Deliverables

Thaumacord should regularly converge toward playable operational slices, not only technical foundations.

An operational deliverable is a simplified but runnable table experience. It can use buttons and dashboard controls instead of gestures, polished UI, or full rule automation.

## Deliverable 1: Putsch Au Panador Core Demo

Goal: demonstrate the core value of Thaumacord with a stripped-down Putsch session: players are connected, exchange resources, and the facilitator can follow and manage the game without losing the table state.

Core verbs:

- connect players to a session;
- bind players/devices to game participants;
- exchange resources between participants;
- declare and resolve a coup attempt;
- record and resolve a minister council scene;
- help the facilitator follow, message, correct, and audit the table.

Non-goals:

- no mandatory gestures;
- no polished Android UI;
- no visual chrome beyond functional buttons;
- no zones;
- no hybrid mapping;
- no card/deck operations unless strictly needed;
- no complete automatic coup resolution beyond facilitator outcome buttons;
- no full vote engine;
- no economic simulation;
- no Mandragore.

### Minimum Play Loop

1. Facilitator creates a `putsch-lite` session.
2. Facilitator creates participants and assigns roles.
3. Devices are registered and bound to participants.
4. Participants see resources, current phase, actions, messages, and available actions.
5. Market phase allows simplified exchanges through game action controls.
6. Facilitator can send private or public messages.
7. Facilitator can manually adjust resources or roles.
8. Dashboard shows participants, device bindings, resources, exchanges, messages, and audit.
9. Coup phase lets a participant open a pending coup resolution.
10. Facilitator resolves the coup with outcome buttons; copper price and council flags update.
11. First council phase lets Paquito record attendees, embezzlement, and decisions.
12. Facilitator resolves the council; money and `firstCouncilDue` update, and a public summary message is sent.

### Acceptance Criteria

- A complete demo script exists.
- No Android install is required for the first dry run; browser/API is acceptable.
- Setup takes less than 5 minutes.
- A participant can exchange at least one resource with another participant.
- Dashboard messages can be sent to one participant and all participants.
- Audit log shows session creation, device/participant binding, exchange, message, and correction.
- Facilitator can answer "who has what?" from the dashboard without asking the table.
- Facilitator can run the stripped Putsch path: market exchange, coup, outcome, council record, council resolution.
- Any missing manual step is explicitly listed.

### Required Technical Gaps

- A compact demo script or checklist.
- Button-level browser prototype for common actions:
  - create session;
  - create/bind participant;
  - set resource;
  - trigger phase actions such as exchange resources;
  - send message;
  - advance phase only if useful for the demo.
- Optional seeded scenario for faster setup.

### Demo Script

1. Click `Scenario Putsch test`.
2. During `Marche`, use `Controles de jeu` to make at least one exchange action, for example General -> Marchand.
3. Use `Phase suivante` until `Coup d'Etat`.
4. From a participant phone or API action, trigger `attempt-coup`.
5. In dashboard `Resolutions`, choose `Attaquant gagne` or `Defense gagne`.
6. Use `Phase suivante` until `Premier conseil`.
7. In `Scenes guidees`, use `Enregistrer le conseil`: select attendees, enter the embezzlement amount and decision text.
8. In `Resolutions`, mark the council resolved.
9. Confirm dashboard resources, `firstCouncilDue`, messages, and audit changed.

## Deliverable 2: Long Live The King Council Slice

Goal: run setup, audience, diplomacy, and a simplified council petition.

Minimum:

- setup distribution works;
- phase clock works;
- petition opens pending resolution;
- facilitator messages and manual decision support exist.

## Deliverable 3: Economic Simulation Slice

Goal: run a light sheep/market or monetary confidence simulation without a full economic engine.

Minimum:

- participants have resources;
- dashboard aggregates show totals/min/max/average;
- facilitator can inject shocks by changing resources or sending messages;
- exchanges are audited;
- no price engine required at first.

## Sprint Rule

Every two or three technical stories should point back to one operational deliverable. If a story does not improve a deliverable, it should be marked as infrastructure and justified.

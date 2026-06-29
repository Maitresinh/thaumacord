# Demo: Putsch Au Panador Core

Purpose: prove the core Ludovive loop with the smallest possible table demo.

## Demo Rule

If it does not help players connect, exchange, or help the facilitator follow/manage the table, it is out of scope.

Out of scope:

- gestures;
- zones;
- maps;
- Mandragore;
- full coup resolution;
- full card/deck handling;
- polished mobile UI.

## Script

1. Start the server.
2. Create a `putsch-lite` session.
3. Create 3-4 participants.
4. Register one device/browser per participant.
5. Bind each device to a participant.
6. Confirm each participant sees only their own resources/actions/messages.
7. Facilitator sends one public message.
8. Facilitator sends one private message.
9. Participant A transfers resources to Participant B.
10. Facilitator checks dashboard resources, aggregates, exchange log, messages, and audit.
11. Facilitator manually corrects one resource.
12. Facilitator confirms audit shows the correction.

## Pass Criteria

- Setup can be completed in under 5 minutes.
- One resource exchange works end to end.
- Dashboard answers "who has what?" immediately.
- Participant read models remain filtered.
- Audit is understandable enough to reconstruct the table sequence.
- Facilitator can see and manually close pending rule resolutions.
- Facilitator can set a phase timer visible in participant read models.

## Missing UX To Build

- One-page button dashboard for the script: first operational pass exists at `/`.
- Simple participant page: first operational pass exists at `/play`.
  - current resources;
  - incoming messages;
  - available actions.
  - exchange form;
  - action trigger buttons.
- Missing from participant page:
  - richer action payload forms when a rule needs a target or bid.
- Seed scenario endpoint or fixture for 3-4 participants: browser dashboard can seed a 4-player `putsch-lite` table.

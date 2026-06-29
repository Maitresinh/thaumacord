# Android Real Gestures Sprints

Goal: make table interactions require real physical proximity and progressively replace fallback buttons with phone-to-phone gestures.

## Sprint G1: Canonical Gesture Event

Outcome: every Android source emits the same event shape.

Stories:

- Define a canonical Android event with `gesture`, `proximity`, `sourceDeviceId`, `targetDeviceId`, `confidence`, `transport`, and optional payload.
- Convert the event to the server `gesture.detected` payload.
- Reject player exchanges server-side unless proximity is confirmed.

Done:

- One payload can represent Nearby, BLE, NFC, QR, and sensor gestures.
- The server still remains authoritative.

## Sprint G2: Proximity Layer

Outcome: phones must be near each other to transact.

Stories:

- Model proximity sources: Nearby Connections, BLE, NFC tap, QR scan, and manual fallback.
- Normalize all close-contact proofs to `proximity: "near"`.
- Keep `contactConfirmed` as browser/test fallback only.

Done:

- A transaction cannot be valid from another room unless a module declares a remote action.
- Android can include `targetDeviceId` when the peer phone is known.

## Sprint G3: Sensor Gesture Layer

Outcome: physical movement picks the action.

Stories:

- Add recognizers for pour, strike, parry, shake, face-down, ballot-drop, and tap-stack.
- Attach confidence and axis hints.
- Keep gesture recognition separate from rule resolution.

Done:

- Sensor recognizers emit canonical events but do not apply game rules locally.
- Low-confidence events can be confirmed by UI before sending.

## Sprint G4: Transport To Server

Outcome: Android can send gestures to Ludovive.

Stories:

- Add a small HTTP client for `POST /sessions/:code/events`.
- Send canonical gesture payloads.
- Surface server acceptance/rejection to the Android UI.

Done:

- The same payload path works for gestures and fallback action controls.

## Sprint G5: Table Playtest

Outcome: run a two-phone exchange test.

Stories:

- Two phones join the same session.
- Phones touch or scan QR/NFC to establish `targetDeviceId`.
- One player pushes an exchange gesture.
- The server accepts only when proximity is near.

Done:

- A tester can prove that cross-room transactions fail.
- The playtest notes identify which gestures are reliable enough for MVP+.

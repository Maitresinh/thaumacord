# Gesture Catalog

This catalog keeps Android gesture adapters, module declarations, and server validation aligned.

The server resolves a gesture only when a module action declares the same `gesture` and the action is currently available for the participant.

## Current Gestures

| Gesture | Meaning | Current Sources | Module Examples |
| --- | --- | --- | --- |
| `touch-phones` | Two phones touch or confirm proximity. | Nearby adapter, manual fallback, later NFC/QR. | `putsch-lite.sell-weapons`, `long-live-the-king-lite.transfer-gold` |
| `strike-phone` | A phone performs an attack/strike motion toward another phone/table target. | Nearby adapter plus sensors later. | `putsch-lite.attempt-coup`, `wolfpack-lite.fire-torpedo` |
| `phone-face-down` | Phone placed face down to confirm a hidden/quiet action. | Sensor/manual fallback. | `wolfpack-lite.quiet-engines` |
| `tilt-phone-forward` | Phone tilted forward. | Sensor/manual fallback. | `wolfpack-lite.change-depth` |
| `slow-phone-arc` | Slow arc sweep. | Sensor/manual fallback. | `wolfpack-lite.sonar-sweep` |
| `hold-phone-up` | Phone held up to signal or broadcast. | Sensor/manual fallback. | `wolfpack-lite.issue-order` |
| `slide-resource-to-edge` | Sliding motion/resource commit. | Touch UI/manual fallback. | `wolfpack-lite.load-torpedo` |
| `pour-liquid` | Pouring gesture from one phone toward another. | Nearby adapter placeholder. | Not yet declared in modules |

## Rules

- Critical gestures must always have `fallback: "manual-confirmation"`.
- Nearby-derived gestures are input signals, not rules decisions.
- The server remains authoritative and validates source device, participant binding, role, phase, resources, and action availability.
- `actor: "any"` and `actor: "*"` both mean the action is not role-restricted.

## Next Work

- Decide which module should first use `pour-liquid`.
- Add parry/block gesture names before implementing sword-like interactions.
- Add confidence and confirmation policy to module schema if playtests require it.

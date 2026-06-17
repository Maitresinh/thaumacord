# Android Nearby Connections Spike

Goal: evaluate Google Nearby Connections as a local input adapter for Thaumacord physical interactions.

Architecture decision:

```text
Nearby/local proximity signal
-> Android normalizer creates NearbyGestureEvent
-> Android sends a normal Thaumacord event to the server
-> Server remains authoritative
```

The current spike adds a pure Kotlin contract in the Android app:

- `NearbyGestureEvent`
- `NearbyGestureTransport`
- `NearbyGestureNormalizer`

Gesture names are tracked in `docs/gesture-catalog.md` so Android, modules, and server validation use the same vocabulary.

No Google Play Services dependency is added yet. That comes after Android Studio/Gradle are available locally, because the next step needs a real device pair.

Current validation:

- Server tests still pass after adding the Android-side contract.
- Android compilation could not be run in this environment because `gradle` is not installed and no Gradle wrapper is present in `apps/android`.

Acceptance criteria for the next device spike:

- Two Android devices discover each other.
- A local payload is exchanged.
- The app converts it to a `gesture.detected` event.
- Thaumacord server validates `sourceDeviceId`, participant binding, gesture/action availability, and audit.

# Android Gesture Test

This guide is for the first Android Studio test of real gesture plumbing.

## Current State

The Android app now has a diagnostic screen for gesture events.

It can send:

- Nearby-style close contact;
- NFC/tap close contact;
- QR close contact;
- pour gesture;
- strike gesture;
- parry gesture;
- handshake gesture;
- face-down gesture;
- ballot-drop gesture.

All buttons emit the canonical gesture payload and send it to:

```http
POST /sessions/:code/events
```

## Server URL

For the Android emulator, use:

```text
http://10.0.2.2:3333
```

For a real phone, use the computer LAN IP, for example:

```text
http://192.168.1.42:3333
```

The phone and the computer must be on the same network.

## First Test

1. Start the Ludovive server on the computer.
2. Create a Putsch demo session from the browser dashboard.
3. Open the Android project in Android Studio.
4. Run the app on emulator or phone.
5. Enter the server URL and session code.
6. Enter a source `deviceId` that exists in the session.
7. Enter a target `deviceId` for the other participant.
8. Tap a proximity button, then a gesture button.
9. Check whether the server accepts or rejects the event.

## Expected Result

- Contact/proximity gestures should carry `proximity: "near"`.
- Sensor-only solo gestures can carry `proximity: "unknown"`.
- Player-to-player exchanges should fail unless the event includes proximity or contact confirmation.

## Not Done Yet

- Real Nearby Connections discovery is not wired to Google Play Services yet.
- Real NFC intent handling is not wired yet.
- Real QR scanning is not wired yet.
- Real Android sensor collection is not wired yet.
- Current motion classification exists as a reusable classifier, but the Activity still uses diagnostic buttons.

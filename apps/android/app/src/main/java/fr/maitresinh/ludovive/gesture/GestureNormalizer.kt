package fr.maitresinh.ludovive.gesture

class GestureNormalizer {
    fun phoneTouch(
        sessionCode: String,
        sourceDeviceId: String,
        targetDeviceId: String,
        transport: GestureTransport = GestureTransport.NearbyConnections,
        confidence: Float = 1f
    ): CanonicalGestureEvent =
        closeContact(sessionCode, sourceDeviceId, targetDeviceId, "touch-phones", transport, confidence)

    fun pourTowardPeer(
        sessionCode: String,
        sourceDeviceId: String,
        targetDeviceId: String,
        confidence: Float
    ): CanonicalGestureEvent =
        closeContact(sessionCode, sourceDeviceId, targetDeviceId, "pour-liquid", GestureTransport.Sensors, confidence)

    fun strikePeer(
        sessionCode: String,
        sourceDeviceId: String,
        targetDeviceId: String,
        confidence: Float
    ): CanonicalGestureEvent =
        closeContact(sessionCode, sourceDeviceId, targetDeviceId, "strike-phone", GestureTransport.Sensors, confidence)

    fun parryPeer(
        sessionCode: String,
        sourceDeviceId: String,
        targetDeviceId: String,
        confidence: Float
    ): CanonicalGestureEvent =
        closeContact(sessionCode, sourceDeviceId, targetDeviceId, "parry-phone", GestureTransport.Sensors, confidence)

    fun shakePhones(
        sessionCode: String,
        sourceDeviceId: String,
        targetDeviceId: String,
        confidence: Float
    ): CanonicalGestureEvent =
        closeContact(sessionCode, sourceDeviceId, targetDeviceId, "shake-phones", GestureTransport.Sensors, confidence)

    fun faceDown(
        sessionCode: String,
        sourceDeviceId: String,
        confidence: Float
    ): CanonicalGestureEvent =
        soloGesture(sessionCode, sourceDeviceId, "phone-face-down", GestureTransport.Sensors, confidence)

    fun ballotDrop(
        sessionCode: String,
        sourceDeviceId: String,
        confidence: Float
    ): CanonicalGestureEvent =
        soloGesture(sessionCode, sourceDeviceId, "ballot-drop", GestureTransport.Sensors, confidence)

    fun qrContact(
        sessionCode: String,
        sourceDeviceId: String,
        targetDeviceId: String
    ): CanonicalGestureEvent =
        closeContact(sessionCode, sourceDeviceId, targetDeviceId, "touch-phones", GestureTransport.Qr, 1f)

    fun nfcContact(
        sessionCode: String,
        sourceDeviceId: String,
        targetDeviceId: String
    ): CanonicalGestureEvent =
        closeContact(sessionCode, sourceDeviceId, targetDeviceId, "touch-phones", GestureTransport.Nfc, 1f)

    private fun closeContact(
        sessionCode: String,
        sourceDeviceId: String,
        targetDeviceId: String,
        gesture: String,
        transport: GestureTransport,
        confidence: Float
    ): CanonicalGestureEvent =
        CanonicalGestureEvent(
            sessionCode = sessionCode,
            sourceDeviceId = sourceDeviceId,
            targetDeviceId = targetDeviceId,
            gesture = gesture,
            proximity = GestureProximity.Near,
            transport = transport,
            confidence = confidence
        )

    private fun soloGesture(
        sessionCode: String,
        sourceDeviceId: String,
        gesture: String,
        transport: GestureTransport,
        confidence: Float
    ): CanonicalGestureEvent =
        CanonicalGestureEvent(
            sessionCode = sessionCode,
            sourceDeviceId = sourceDeviceId,
            targetDeviceId = null,
            gesture = gesture,
            proximity = GestureProximity.Unknown,
            transport = transport,
            confidence = confidence
        )
}

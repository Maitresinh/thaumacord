package fr.maitresinh.ludovive.gesture

class ContactProofNormalizer {
    private val normalizer = GestureNormalizer()

    fun nearby(
        sessionCode: String,
        sourceDeviceId: String,
        targetDeviceId: String,
        confidence: Float
    ): CanonicalGestureEvent =
        normalizer.phoneTouch(sessionCode, sourceDeviceId, targetDeviceId, GestureTransport.NearbyConnections, confidence)

    fun ble(
        sessionCode: String,
        sourceDeviceId: String,
        targetDeviceId: String,
        confidence: Float
    ): CanonicalGestureEvent =
        normalizer.phoneTouch(sessionCode, sourceDeviceId, targetDeviceId, GestureTransport.Ble, confidence)

    fun nfc(sessionCode: String, sourceDeviceId: String, targetDeviceId: String): CanonicalGestureEvent =
        normalizer.nfcContact(sessionCode, sourceDeviceId, targetDeviceId)

    fun qr(sessionCode: String, sourceDeviceId: String, targetDeviceId: String): CanonicalGestureEvent =
        normalizer.qrContact(sessionCode, sourceDeviceId, targetDeviceId)
}

package fr.maitresinh.thaumacord.nearby

class NearbyGestureNormalizer {
    fun phoneTouch(
        sessionCode: String,
        sourceDeviceId: String,
        peerDeviceId: String,
        confidence: Float
    ): NearbyGestureEvent =
        NearbyGestureEvent(
            sessionCode = sessionCode,
            sourceDeviceId = sourceDeviceId,
            peerDeviceId = peerDeviceId,
            gesture = "touch-phones",
            confidence = confidence
        )

    fun pourTowardPeer(
        sessionCode: String,
        sourceDeviceId: String,
        peerDeviceId: String,
        confidence: Float
    ): NearbyGestureEvent =
        NearbyGestureEvent(
            sessionCode = sessionCode,
            sourceDeviceId = sourceDeviceId,
            peerDeviceId = peerDeviceId,
            gesture = "pour-liquid",
            confidence = confidence
        )

    fun strikePeer(
        sessionCode: String,
        sourceDeviceId: String,
        peerDeviceId: String,
        confidence: Float
    ): NearbyGestureEvent =
        NearbyGestureEvent(
            sessionCode = sessionCode,
            sourceDeviceId = sourceDeviceId,
            peerDeviceId = peerDeviceId,
            gesture = "strike-phone",
            confidence = confidence
        )
}


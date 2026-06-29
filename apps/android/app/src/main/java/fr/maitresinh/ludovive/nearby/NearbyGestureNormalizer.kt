package fr.maitresinh.ludovive.nearby

import fr.maitresinh.ludovive.gesture.GestureNormalizer
import fr.maitresinh.ludovive.gesture.GestureTransport

class NearbyGestureNormalizer {
    private val normalizer = GestureNormalizer()

    fun phoneTouch(
        sessionCode: String,
        sourceDeviceId: String,
        peerDeviceId: String,
        confidence: Float
    ): NearbyGestureEvent =
        normalizer.phoneTouch(sessionCode, sourceDeviceId, peerDeviceId, GestureTransport.NearbyConnections, confidence)

    fun pourTowardPeer(
        sessionCode: String,
        sourceDeviceId: String,
        peerDeviceId: String,
        confidence: Float
    ): NearbyGestureEvent =
        normalizer.pourTowardPeer(sessionCode, sourceDeviceId, peerDeviceId, confidence)

    fun strikePeer(
        sessionCode: String,
        sourceDeviceId: String,
        peerDeviceId: String,
        confidence: Float
    ): NearbyGestureEvent =
        normalizer.strikePeer(sessionCode, sourceDeviceId, peerDeviceId, confidence)

    fun parryPeer(
        sessionCode: String,
        sourceDeviceId: String,
        peerDeviceId: String,
        confidence: Float
    ): NearbyGestureEvent =
        normalizer.parryPeer(sessionCode, sourceDeviceId, peerDeviceId, confidence)
}

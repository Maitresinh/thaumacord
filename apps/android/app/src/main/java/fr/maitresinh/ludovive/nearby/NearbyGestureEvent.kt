package fr.maitresinh.ludovive.nearby

import fr.maitresinh.ludovive.gesture.CanonicalGestureEvent
import fr.maitresinh.ludovive.gesture.GestureProximity
import fr.maitresinh.ludovive.gesture.GestureTransport

typealias NearbyGestureEvent = CanonicalGestureEvent

fun nearbyGestureEvent(
    sessionCode: String,
    sourceDeviceId: String,
    peerDeviceId: String?,
    gesture: String,
    confidence: Float,
    payload: Map<String, String> = emptyMap()
): NearbyGestureEvent =
    CanonicalGestureEvent(
        sessionCode = sessionCode,
        sourceDeviceId = sourceDeviceId,
        targetDeviceId = peerDeviceId,
        gesture = gesture,
        proximity = if (peerDeviceId != null) GestureProximity.Near else GestureProximity.Unknown,
        transport = GestureTransport.NearbyConnections,
        confidence = confidence,
        payload = payload
    )

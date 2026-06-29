package fr.maitresinh.ludovive.gesture

data class CanonicalGestureEvent(
    val sessionCode: String,
    val sourceDeviceId: String,
    val targetDeviceId: String?,
    val gesture: String,
    val proximity: GestureProximity,
    val transport: GestureTransport,
    val confidence: Float,
    val payload: Map<String, String> = emptyMap()
) {
    init {
        require(sessionCode.isNotBlank()) { "sessionCode is required" }
        require(sourceDeviceId.isNotBlank()) { "sourceDeviceId is required" }
        require(gesture.isNotBlank()) { "gesture is required" }
        require(confidence in 0f..1f) { "confidence must be between 0 and 1" }
    }

    fun toLudovivePayload(): Map<String, Any> =
        mapOf(
            "type" to "gesture.detected",
            "gesture" to gesture,
            "sourceDeviceId" to sourceDeviceId,
            "payload" to buildMap {
                put("transport", transport.wireValue)
                put("confidence", confidence)
                put("proximity", proximity.wireValue)
                targetDeviceId?.let {
                    put("targetDeviceId", it)
                    put("peerDeviceId", it)
                }
                putAll(payload)
            }
        )
}

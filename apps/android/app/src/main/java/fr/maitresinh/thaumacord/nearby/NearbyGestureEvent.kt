package fr.maitresinh.thaumacord.nearby

data class NearbyGestureEvent(
    val sessionCode: String,
    val sourceDeviceId: String,
    val peerDeviceId: String?,
    val gesture: String,
    val confidence: Float,
    val payload: Map<String, String> = emptyMap()
) {
    init {
        require(sessionCode.isNotBlank()) { "sessionCode is required" }
        require(sourceDeviceId.isNotBlank()) { "sourceDeviceId is required" }
        require(gesture.isNotBlank()) { "gesture is required" }
        require(confidence in 0f..1f) { "confidence must be between 0 and 1" }
    }

    fun toThaumacordPayload(): Map<String, Any> =
        mapOf(
            "type" to "gesture.detected",
            "gesture" to gesture,
            "sourceDeviceId" to sourceDeviceId,
            "payload" to buildMap {
                put("transport", "nearby-connections")
                put("confidence", confidence)
                peerDeviceId?.let { put("peerDeviceId", it) }
                putAll(payload)
            }
        )
}


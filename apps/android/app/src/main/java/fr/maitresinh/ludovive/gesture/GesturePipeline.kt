package fr.maitresinh.ludovive.gesture

class GesturePipeline(
    private val sender: GestureEventSender,
    private val minimumConfidence: Float = 0.6f
) {
    fun sendIfTrusted(event: CanonicalGestureEvent): Boolean {
        if (event.confidence < minimumConfidence) {
            return false
        }
        val status = sender.send(event)
        return status in 200..299
    }
}

package fr.maitresinh.ludovive.gesture

class SensorGestureClassifier {
    fun classify(samples: List<MotionSample>): Pair<String, Float>? {
        if (samples.size < 2) return null

        val maxAcceleration = samples.maxOf { magnitude(it.accelerationX, it.accelerationY, it.accelerationZ) }
        val maxRotationY = samples.maxOf { kotlin.math.abs(it.rotationY) }
        val maxRotationZ = samples.maxOf { kotlin.math.abs(it.rotationZ) }
        val last = samples.last()

        return when {
            last.accelerationZ < -7f && maxAcceleration < 14f -> "phone-face-down" to 0.75f
            maxRotationY > 3.8f && maxAcceleration < 18f -> "pour-liquid" to confidence(maxRotationY, 3.8f, 7f)
            maxAcceleration > 24f && maxRotationZ > 2.5f -> "strike-phone" to confidence(maxAcceleration, 24f, 42f)
            maxAcceleration > 18f && maxRotationZ < 1.8f -> "parry-phone" to confidence(maxAcceleration, 18f, 34f)
            maxRotationZ > 4.2f && maxAcceleration < 20f -> "shake-phones" to confidence(maxRotationZ, 4.2f, 8f)
            maxAcceleration in 10f..18f && last.accelerationZ > 6f -> "ballot-drop" to 0.7f
            else -> null
        }
    }

    fun classifyEvent(
        sessionCode: String,
        sourceDeviceId: String,
        targetDeviceId: String?,
        samples: List<MotionSample>
    ): CanonicalGestureEvent? {
        val (gesture, confidence) = classify(samples) ?: return null
        return CanonicalGestureEvent(
            sessionCode = sessionCode,
            sourceDeviceId = sourceDeviceId,
            targetDeviceId = targetDeviceId,
            gesture = gesture,
            proximity = if (targetDeviceId != null) GestureProximity.Near else GestureProximity.Unknown,
            transport = GestureTransport.Sensors,
            confidence = confidence
        )
    }

    private fun magnitude(x: Float, y: Float, z: Float): Float =
        kotlin.math.sqrt(x * x + y * y + z * z)

    private fun confidence(value: Float, low: Float, high: Float): Float =
        ((value - low) / (high - low)).coerceIn(0.55f, 0.98f)
}

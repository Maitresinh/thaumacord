package fr.maitresinh.ludovive.gesture

data class MotionSample(
    val accelerationX: Float,
    val accelerationY: Float,
    val accelerationZ: Float,
    val rotationX: Float,
    val rotationY: Float,
    val rotationZ: Float,
    val timestampMillis: Long
)

package fr.maitresinh.ludovive.gesture

enum class GestureTransport(val wireValue: String) {
    NearbyConnections("nearby-connections"),
    Ble("ble"),
    Nfc("nfc"),
    Qr("qr"),
    Sensors("sensors"),
    ManualFallback("manual-fallback")
}

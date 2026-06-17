package fr.maitresinh.thaumacord.nearby

interface NearbyGestureTransport {
    fun startAdvertising(localDeviceId: String)
    fun startDiscovery(sessionCode: String)
    fun stop()
    fun sendGesture(peerDeviceId: String, event: NearbyGestureEvent)
}


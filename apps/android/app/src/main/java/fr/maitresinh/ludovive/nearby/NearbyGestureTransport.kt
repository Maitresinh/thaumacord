package fr.maitresinh.ludovive.nearby

interface NearbyGestureTransport {
    fun startAdvertising(localDeviceId: String)
    fun startDiscovery(sessionCode: String)
    fun onGestureReceived(handler: (NearbyGestureEvent) -> Unit)
    fun stop()
    fun sendGesture(peerDeviceId: String, event: NearbyGestureEvent)
}

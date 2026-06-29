package fr.maitresinh.ludovive

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import fr.maitresinh.ludovive.gesture.CanonicalGestureEvent
import fr.maitresinh.ludovive.gesture.ContactProofNormalizer
import fr.maitresinh.ludovive.gesture.GestureEventSender
import fr.maitresinh.ludovive.gesture.GestureNormalizer

class MainActivity : Activity() {
    private val gestureNormalizer = GestureNormalizer()
    private val contactProofNormalizer = ContactProofNormalizer()
    private lateinit var baseUrlInput: EditText
    private lateinit var sessionCodeInput: EditText
    private lateinit var sourceDeviceInput: EditText
    private lateinit var targetDeviceInput: EditText
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(36, 36, 36, 36)
        }

        val title = TextView(this).apply {
            text = "Ludovive"
            textSize = 32f
            gravity = Gravity.CENTER
        }

        val subtitle = TextView(this).apply {
            text = "Diagnostic gestes reels Android"
            textSize = 16f
            gravity = Gravity.CENTER
        }

        layout.addView(title)
        layout.addView(subtitle)

        baseUrlInput = input("Serveur", "http://10.0.2.2:3333")
        sessionCodeInput = input("Code session", "")
        sourceDeviceInput = input("Source deviceId", "android-source")
        targetDeviceInput = input("Target deviceId", "android-target")

        layout.addView(label("Connexion"))
        layout.addView(baseUrlInput)
        layout.addView(sessionCodeInput)
        layout.addView(sourceDeviceInput)
        layout.addView(targetDeviceInput)
        layout.addView(label("Preuves de proximite"))
        layout.addView(button("Nearby: telephones proches") {
            sendContact { session, source, target -> contactProofNormalizer.nearby(session, source, target, 0.95f) }
        })
        layout.addView(button("NFC/tap: contact explicite") {
            sendContact { session, source, target -> contactProofNormalizer.nfc(session, source, target) }
        })
        layout.addView(button("QR: associer le receveur") {
            sendContact { session, source, target -> contactProofNormalizer.qr(session, source, target) }
        })
        layout.addView(label("Gestes de table"))
        layout.addView(button("Verser vers le telephone") {
            sendTargetGesture { session, source, target -> gestureNormalizer.pourTowardPeer(session, source, target, 0.82f) }
        })
        layout.addView(button("Coup d'epee telephone") {
            sendTargetGesture { session, source, target -> gestureNormalizer.strikePeer(session, source, target, 0.82f) }
        })
        layout.addView(button("Parer avec le telephone") {
            sendTargetGesture { session, source, target -> gestureNormalizer.parryPeer(session, source, target, 0.82f) }
        })
        layout.addView(button("Poignee de main telephones") {
            sendTargetGesture { session, source, target -> gestureNormalizer.shakePhones(session, source, target, 0.78f) }
        })
        layout.addView(button("Retourner face contre table") {
            sendSoloGesture { session, source -> gestureNormalizer.faceDown(session, source, 0.76f) }
        })
        layout.addView(button("Deposer un bulletin") {
            sendSoloGesture { session, source -> gestureNormalizer.ballotDrop(session, source, 0.72f) }
        })

        status = TextView(this).apply {
            text = "Pret. Pour un telephone physique, remplace 10.0.2.2 par l'IP locale du serveur."
            textSize = 14f
            setTextColor(Color.rgb(60, 88, 99))
            setPadding(0, 20, 0, 0)
        }
        layout.addView(status)

        setContentView(ScrollView(this).apply { addView(layout) })
    }

    private fun label(text: String): TextView =
        TextView(this).apply {
            this.text = text
            textSize = 18f
            setTextColor(Color.rgb(108, 45, 45))
            setPadding(0, 24, 0, 8)
        }

    private fun input(hint: String, value: String): EditText =
        EditText(this).apply {
            this.hint = hint
            setText(value)
            singleLine = true
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }

    private fun button(text: String, action: () -> Unit): Button =
        Button(this).apply {
            this.text = text
            setAllCaps(false)
            setOnClickListener { action() }
        }

    private fun sendContact(factory: (String, String, String) -> CanonicalGestureEvent) {
        sendTargetGesture(factory)
    }

    private fun sendTargetGesture(factory: (String, String, String) -> CanonicalGestureEvent) {
        val session = requiredText(sessionCodeInput, "Code session") ?: return
        val source = requiredText(sourceDeviceInput, "Source deviceId") ?: return
        val target = requiredText(targetDeviceInput, "Target deviceId") ?: return
        send(factory(session, source, target))
    }

    private fun sendSoloGesture(factory: (String, String) -> CanonicalGestureEvent) {
        val session = requiredText(sessionCodeInput, "Code session") ?: return
        val source = requiredText(sourceDeviceInput, "Source deviceId") ?: return
        send(factory(session, source))
    }

    private fun requiredText(field: EditText, name: String): String? {
        val value = field.text.toString().trim()
        if (value.isBlank()) {
            status.text = "$name requis"
            return null
        }
        return value
    }

    private fun send(event: CanonicalGestureEvent) {
        val baseUrl = baseUrlInput.text.toString().trim()
        status.text = "Envoi ${event.gesture} via ${event.transport.wireValue}..."
        Thread {
            val result = runCatching { GestureEventSender(baseUrl).send(event) }
            runOnUiThread {
                status.text = result.fold(
                    onSuccess = { code -> "Serveur: HTTP $code pour ${event.gesture} (${event.proximity.wireValue})" },
                    onFailure = { error -> "Erreur: ${error.message}" }
                )
            }
        }.start()
    }
}

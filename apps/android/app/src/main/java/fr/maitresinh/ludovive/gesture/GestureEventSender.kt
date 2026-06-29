package fr.maitresinh.ludovive.gesture

import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class GestureEventSender(private val baseUrl: String) {
    fun send(event: CanonicalGestureEvent): Int {
        val endpoint = URL("${baseUrl.trimEnd('/')}/sessions/${event.sessionCode}/events")
        val connection = endpoint.openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.setRequestProperty("content-type", "application/json")
        connection.doOutput = true
        OutputStreamWriter(connection.outputStream).use { writer ->
            writer.write(toJson(event.toLudovivePayload()))
        }
        return connection.responseCode
    }

    private fun toJson(value: Any?): String =
        when (value) {
            null -> "null"
            is String -> "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
            is Number, is Boolean -> value.toString()
            is Map<*, *> -> value.entries.joinToString(prefix = "{", postfix = "}") { (key, item) ->
                toJson(key.toString()) + ":" + toJson(item)
            }
            is Iterable<*> -> value.joinToString(prefix = "[", postfix = "]") { item -> toJson(item) }
            else -> toJson(value.toString())
        }
}

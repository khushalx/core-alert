package com.corealert.prototype

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class CoreAlertCloudResult(
  val incidentId: String?,
  val error: String?
)

object CoreAlertCloudClient {
  fun activate(
    config: CoreAlertProtectionConfig,
    activationId: String,
    latitude: Double?,
    longitude: Double?,
    accuracy: Float?
  ): CoreAlertCloudResult = request(
    config,
    JSONObject()
      .put("action", "activate")
      .put("activationId", activationId)
      .put("isDemo", config.demoMode)
      .apply {
        if (latitude != null && longitude != null) {
          put("location", JSONObject()
            .put("latitude", latitude)
            .put("longitude", longitude)
            .put("accuracy", accuracy))
        }
      }
  )

  fun updateLocation(
    config: CoreAlertProtectionConfig,
    incidentId: String,
    latitude: Double,
    longitude: Double,
    accuracy: Float?
  ): CoreAlertCloudResult = request(
    config,
    JSONObject()
      .put("action", "location")
      .put("incidentId", incidentId)
      .put("location", JSONObject()
        .put("latitude", latitude)
        .put("longitude", longitude)
        .put("accuracy", accuracy))
  )

  private fun request(config: CoreAlertProtectionConfig, body: JSONObject): CoreAlertCloudResult {
    if (!config.cloudConfigured) return CoreAlertCloudResult(null, "Native cloud activation is not configured.")
    return runCatching {
      val connection = URL("${config.endpoint}/functions/v1/activate-native-sos")
        .openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.connectTimeout = 12_000
      connection.readTimeout = 20_000
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("apikey", config.anonKey)
      connection.setRequestProperty("x-core-alert-device-id", config.deviceId)
      connection.setRequestProperty("x-core-alert-device-secret", config.deviceSecret)
      connection.outputStream.use { it.write(body.toString().toByteArray()) }
      val responseText = (if (connection.responseCode in 200..299) {
        connection.inputStream
      } else {
        connection.errorStream
      })?.bufferedReader()?.use { it.readText() }.orEmpty()
      val payload = runCatching { JSONObject(responseText) }.getOrDefault(JSONObject())
      if (connection.responseCode !in 200..299) {
        CoreAlertCloudResult(null, payload.optString("error", "Cloud activation failed (${connection.responseCode})."))
      } else {
        CoreAlertCloudResult(payload.optString("incidentId").takeIf { it.isNotBlank() }, null)
      }
    }.getOrElse {
      CoreAlertCloudResult(null, "Core Alert could not reach the cloud.")
    }
  }
}

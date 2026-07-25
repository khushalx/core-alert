package com.corealert.prototype

import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

data class CoreAlertEvidenceApiResult(
  val success: Boolean,
  val signedUrl: String? = null,
  val storagePath: String? = null,
  val retryable: Boolean = false,
  val error: String? = null
)

object CoreAlertEvidenceApi {
  fun prepareUpload(
    config: CoreAlertProtectionConfig,
    record: CoreAlertEvidenceRecord,
    sha256: String
  ): CoreAlertEvidenceApiResult {
    val incidentId = record.incidentId
      ?: return CoreAlertEvidenceApiResult(false, error = "Evidence has no incident.")
    return request(
      config,
      JSONObject()
        .put("action", "prepare")
        .put("incidentId", incidentId)
        .put("evidenceId", record.id)
        .put("mimeType", record.mimeType)
        .put("mode", record.mode)
        .put("byteSize", record.mediaFile.length())
        .put("durationMs", record.durationMs)
        .put("capturedAt", record.startedAt)
        .put("sha256", sha256)
    )
  }

  fun completeUpload(
    config: CoreAlertProtectionConfig,
    record: CoreAlertEvidenceRecord,
    storagePath: String,
    sha256: String
  ): CoreAlertEvidenceApiResult = request(
    config,
    JSONObject()
      .put("action", "complete")
      .put("incidentId", record.incidentId)
      .put("evidenceId", record.id)
      .put("storagePath", storagePath)
      .put("byteSize", record.mediaFile.length())
      .put("durationMs", record.durationMs)
      .put("sha256", sha256)
  )

  fun uploadFile(
    config: CoreAlertProtectionConfig,
    signedUrl: String,
    file: File,
    mimeType: String
  ): CoreAlertEvidenceApiResult {
    return runCatching {
      val connection = URL(signedUrl).openConnection() as HttpURLConnection
      connection.requestMethod = "PUT"
      connection.connectTimeout = 20_000
      connection.readTimeout = 120_000
      connection.doOutput = true
      connection.setFixedLengthStreamingMode(file.length())
      connection.setRequestProperty("Content-Type", mimeType)
      connection.setRequestProperty("Cache-Control", "max-age=0")
      connection.setRequestProperty("x-upsert", "true")
      connection.setRequestProperty("apikey", config.anonKey)
      file.inputStream().use { input ->
        connection.outputStream.use { output -> input.copyTo(output, DEFAULT_BUFFER_SIZE) }
      }
      val code = connection.responseCode
      if (code in 200..299) {
        CoreAlertEvidenceApiResult(true)
      } else {
        CoreAlertEvidenceApiResult(
          false,
          retryable = code == 408 || code == 429 || code >= 500,
          error = "Evidence upload failed ($code)."
        )
      }
    }.getOrElse {
      CoreAlertEvidenceApiResult(false, retryable = true, error = "Evidence upload could not reach storage.")
    }
  }

  private fun request(
    config: CoreAlertProtectionConfig,
    body: JSONObject
  ): CoreAlertEvidenceApiResult {
    if (!config.cloudConfigured) {
      return CoreAlertEvidenceApiResult(false, error = "Native cloud protection is not configured.")
    }
    return runCatching {
      val connection = URL("${config.endpoint}/functions/v1/manage-native-evidence")
        .openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.connectTimeout = 12_000
      connection.readTimeout = 30_000
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("apikey", config.anonKey)
      connection.setRequestProperty("x-core-alert-device-id", config.deviceId)
      connection.setRequestProperty("x-core-alert-device-secret", config.deviceSecret)
      connection.outputStream.use { it.write(body.toString().toByteArray()) }
      val code = connection.responseCode
      val responseText = (if (code in 200..299) connection.inputStream else connection.errorStream)
        ?.bufferedReader()?.use { it.readText() }.orEmpty()
      val payload = runCatching { JSONObject(responseText) }.getOrDefault(JSONObject())
      if (code !in 200..299) {
        CoreAlertEvidenceApiResult(
          success = false,
          retryable = code == 408 || code == 429 || code >= 500,
          error = payload.optString("error", "Evidence service failed ($code).")
        )
      } else {
        CoreAlertEvidenceApiResult(
          success = true,
          signedUrl = payload.optString("signedUrl").takeIf { it.isNotBlank() },
          storagePath = payload.optString("storagePath").takeIf { it.isNotBlank() }
        )
      }
    }.getOrElse {
      CoreAlertEvidenceApiResult(false, retryable = true, error = "Evidence service is unreachable.")
    }
  }
}

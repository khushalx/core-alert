package com.corealert.prototype

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.util.UUID

data class CoreAlertEvidenceRecord(
  val id: String,
  val activationId: String,
  val incidentId: String?,
  val mediaFile: File,
  val metadataFile: File,
  val mode: String,
  val mimeType: String,
  val startedAt: Long,
  val completedAt: Long?,
  val durationMs: Long,
  val state: String,
  val attempts: Int,
  val lastError: String
)

/**
 * Stores evidence and its upload state in private app storage. No evidence is
 * written to shared storage or exposed through a FileProvider.
 */
object CoreAlertEvidenceStore {
  private const val DIRECTORY = "emergency_evidence"
  private const val STATE_RECORDING = "recording"
  private const val STATE_READY = "ready"
  private const val STATE_UPLOADING = "uploading"
  private const val STATE_FAILED = "failed"
  private const val STATE_UPLOADED = "uploaded"

  @Synchronized
  fun create(
    context: Context,
    activationId: String,
    incidentId: String?,
    mode: String,
    mimeType: String
  ): CoreAlertEvidenceRecord {
    val id = UUID.randomUUID().toString()
    val extension = if (mode == "video") "mp4" else "m4a"
    val directory = directory(context)
    val mediaFile = File(directory, "$id.$extension")
    val metadataFile = File(directory, "$id.json")
    val record = CoreAlertEvidenceRecord(
      id = id,
      activationId = activationId,
      incidentId = incidentId,
      mediaFile = mediaFile,
      metadataFile = metadataFile,
      mode = mode,
      mimeType = mimeType,
      startedAt = System.currentTimeMillis(),
      completedAt = null,
      durationMs = 0L,
      state = STATE_RECORDING,
      attempts = 0,
      lastError = ""
    )
    write(record)
    refreshPendingCount(context)
    return record
  }

  @Synchronized
  fun markCompleted(context: Context, record: CoreAlertEvidenceRecord): CoreAlertEvidenceRecord? {
    if (!record.mediaFile.exists() || record.mediaFile.length() <= 0L) {
      delete(record)
      refreshPendingCount(context)
      return null
    }
    val completedAt = System.currentTimeMillis()
    val completed = record.copy(
      completedAt = completedAt,
      durationMs = (completedAt - record.startedAt).coerceAtLeast(0L),
      state = STATE_READY,
      lastError = ""
    )
    write(completed)
    refreshPendingCount(context)
    return completed
  }

  @Synchronized
  fun attachIncident(context: Context, activationId: String, incidentId: String): List<CoreAlertEvidenceRecord> {
    val attached = all(context)
      .filter { it.activationId == activationId && it.state != STATE_UPLOADED }
      .map { record ->
        record.copy(incidentId = incidentId).also(::write)
      }
    refreshPendingCount(context)
    return attached.filter { it.state == STATE_READY || it.state == STATE_FAILED }
  }

  @Synchronized
  fun updateUploadState(
    context: Context,
    record: CoreAlertEvidenceRecord,
    state: String,
    error: String = ""
  ): CoreAlertEvidenceRecord {
    val updated = record.copy(
      state = state,
      attempts = if (state == STATE_UPLOADING) record.attempts + 1 else record.attempts,
      lastError = error.take(180)
    )
    write(updated)
    refreshPendingCount(context)
    return updated
  }

  @Synchronized
  fun find(context: Context, id: String): CoreAlertEvidenceRecord? {
    val metadata = File(directory(context), "$id.json")
    return read(metadata)
  }

  @Synchronized
  fun readyForUpload(context: Context): List<CoreAlertEvidenceRecord> =
    all(context).filter {
      !it.incidentId.isNullOrBlank() &&
        it.mediaFile.exists() &&
        (it.state == STATE_READY || it.state == STATE_FAILED || it.state == STATE_UPLOADING)
    }

  @Synchronized
  fun markUploadedAndDelete(context: Context, record: CoreAlertEvidenceRecord) {
    write(record.copy(state = STATE_UPLOADED, lastError = ""))
    record.mediaFile.delete()
    record.metadataFile.delete()
    refreshPendingCount(context)
  }

  @Synchronized
  fun discardActivation(context: Context, activationId: String) {
    all(context).filter { it.activationId == activationId }.forEach(::delete)
    refreshPendingCount(context)
  }

  @Synchronized
  fun recover(context: Context): List<CoreAlertEvidenceRecord> {
    val now = System.currentTimeMillis()
    all(context).forEach { record ->
      if (record.state == STATE_RECORDING && now - record.startedAt > 10 * 60_000L) {
        // A process death can leave an unfinalized container. Never upload a
        // file that CameraX or MediaRecorder did not finalize successfully.
        delete(record)
      }
    }
    refreshPendingCount(context)
    return readyForUpload(context)
  }

  private fun all(context: Context): List<CoreAlertEvidenceRecord> =
    directory(context).listFiles { file -> file.extension == "json" }
      ?.mapNotNull(::read)
      .orEmpty()

  private fun directory(context: Context): File =
    File(context.filesDir, DIRECTORY).apply { mkdirs() }

  private fun write(record: CoreAlertEvidenceRecord) {
    val payload = JSONObject()
      .put("id", record.id)
      .put("activationId", record.activationId)
      .put("incidentId", record.incidentId ?: JSONObject.NULL)
      .put("mediaPath", record.mediaFile.absolutePath)
      .put("mode", record.mode)
      .put("mimeType", record.mimeType)
      .put("startedAt", record.startedAt)
      .put("completedAt", record.completedAt ?: JSONObject.NULL)
      .put("durationMs", record.durationMs)
      .put("state", record.state)
      .put("attempts", record.attempts)
      .put("lastError", record.lastError)
    val temporary = File(record.metadataFile.parentFile, "${record.metadataFile.name}.tmp")
    temporary.writeText(payload.toString())
    if (!temporary.renameTo(record.metadataFile)) {
      record.metadataFile.writeText(payload.toString())
      temporary.delete()
    }
  }

  private fun read(metadataFile: File): CoreAlertEvidenceRecord? = runCatching {
    val payload = JSONObject(metadataFile.readText())
    val mediaFile = File(payload.getString("mediaPath"))
    CoreAlertEvidenceRecord(
      id = payload.getString("id"),
      activationId = payload.getString("activationId"),
      incidentId = payload.optString("incidentId").takeIf { it.isNotBlank() && it != "null" },
      mediaFile = mediaFile,
      metadataFile = metadataFile,
      mode = payload.getString("mode"),
      mimeType = payload.getString("mimeType"),
      startedAt = payload.getLong("startedAt"),
      completedAt = payload.optLong("completedAt").takeIf { it > 0L },
      durationMs = payload.optLong("durationMs"),
      state = payload.optString("state", STATE_FAILED),
      attempts = payload.optInt("attempts", 0),
      lastError = payload.optString("lastError", "")
    )
  }.getOrNull()

  private fun delete(record: CoreAlertEvidenceRecord) {
    record.mediaFile.delete()
    record.metadataFile.delete()
  }

  private fun refreshPendingCount(context: Context) {
    val count = all(context).count { it.state != STATE_UPLOADED }
    CoreAlertProtectionStore.setEvidencePendingUploads(context, count)
  }

  const val READY = STATE_READY
  const val UPLOADING = STATE_UPLOADING
  const val FAILED = STATE_FAILED
}

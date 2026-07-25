package com.corealert.prototype

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

class CoreAlertEvidenceUploadWorker(
  context: Context,
  parameters: WorkerParameters
) : Worker(context, parameters) {
  override fun doWork(): Result {
    val evidenceId = inputData.getString(KEY_EVIDENCE_ID) ?: return Result.failure()
    val record = CoreAlertEvidenceStore.find(applicationContext, evidenceId) ?: return Result.success()
    if (!record.mediaFile.exists() || record.incidentId.isNullOrBlank()) return Result.failure()

    runCatching { setForegroundAsync(foregroundInfo()).get() }
    var current = CoreAlertEvidenceStore.updateUploadState(
      applicationContext,
      record,
      CoreAlertEvidenceStore.UPLOADING
    )
    val config = CoreAlertProtectionStore.config(applicationContext)
    if (!config.cloudConfigured) {
      CoreAlertEvidenceStore.updateUploadState(
        applicationContext,
        current,
        CoreAlertEvidenceStore.FAILED,
        "Native cloud protection is not configured."
      )
      return Result.failure()
    }

    val sha256 = sha256(current.mediaFile)
    val prepared = CoreAlertEvidenceApi.prepareUpload(config, current, sha256)
    val signedUrl = prepared.signedUrl
    val storagePath = prepared.storagePath
    if (!prepared.success || signedUrl == null || storagePath == null) {
      current = CoreAlertEvidenceStore.updateUploadState(
        applicationContext,
        current,
        CoreAlertEvidenceStore.FAILED,
        prepared.error ?: "Could not prepare evidence upload."
      )
      return if (prepared.retryable) Result.retry() else Result.failure()
    }

    val uploaded = CoreAlertEvidenceApi.uploadFile(
      config,
      signedUrl,
      current.mediaFile,
      current.mimeType
    )
    if (!uploaded.success) {
      CoreAlertEvidenceStore.updateUploadState(
        applicationContext,
        current,
        CoreAlertEvidenceStore.FAILED,
        uploaded.error ?: "Evidence upload failed."
      )
      return if (uploaded.retryable) Result.retry() else Result.failure()
    }

    val completed = CoreAlertEvidenceApi.completeUpload(
      config,
      current,
      storagePath,
      sha256
    )
    if (!completed.success) {
      CoreAlertEvidenceStore.updateUploadState(
        applicationContext,
        current,
        CoreAlertEvidenceStore.FAILED,
        completed.error ?: "Evidence upload could not be finalized."
      )
      return if (completed.retryable) Result.retry() else Result.failure()
    }

    CoreAlertEvidenceStore.markUploadedAndDelete(applicationContext, current)
    CoreAlertProtectionStore.recordEvidenceState(applicationContext, "uploaded", current.mode)
    return Result.success()
  }

  private fun foregroundInfo(): ForegroundInfo {
    createChannel(applicationContext)
    val openAction = applicationContext.packageManager
      .getLaunchIntentForPackage(applicationContext.packageName)
      ?.let {
        PendingIntent.getActivity(
          applicationContext,
          57005,
          it,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
      }
    val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
      .setSmallIcon(applicationContext.applicationInfo.icon)
      .setContentTitle("Securing emergency evidence")
      .setContentText("Uploading privately to the incident")
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .apply { if (openAction != null) setContentIntent(openAction) }
      .build()
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
    } else {
      0
    }
    return ForegroundInfo(NOTIFICATION_ID, notification, type)
  }

  companion object {
    private const val KEY_EVIDENCE_ID = "evidence_id"
    private const val CHANNEL_ID = "core-alert-sender-evidence-upload-v2"
    private const val NOTIFICATION_ID = 57004

    fun enqueue(context: Context, record: CoreAlertEvidenceRecord) {
      if (record.incidentId.isNullOrBlank()) return
      val request = OneTimeWorkRequestBuilder<CoreAlertEvidenceUploadWorker>()
        .setInputData(workDataOf(KEY_EVIDENCE_ID to record.id))
        .setConstraints(
          Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresStorageNotLow(true)
            .build()
        )
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
        .addTag("core-alert-evidence")
        .build()
      WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
        "core-alert-evidence-${record.id}",
        ExistingWorkPolicy.KEEP,
        request
      )
    }

    fun recover(context: Context) {
      CoreAlertEvidenceStore.recover(context).forEach { enqueue(context, it) }
    }

    private fun createChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(
        NotificationChannel(
          CHANNEL_ID,
          "Emergency evidence uploads",
          NotificationManager.IMPORTANCE_LOW
        ).apply {
          description = "Silent status while completed emergency evidence uploads securely"
          lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
          enableVibration(false)
          setSound(null, null)
        }
      )
    }

    private fun sha256(file: File): String {
      val digest = MessageDigest.getInstance("SHA-256")
      file.inputStream().buffered().use { input ->
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
          val read = input.read(buffer)
          if (read < 0) break
          digest.update(buffer, 0, read)
        }
      }
      return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
    }
  }
}

package com.corealert.prototype

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.camera.core.CameraSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import java.util.concurrent.Executor

/**
 * Native emergency evidence engine. It is only started by a visible Activity
 * and continues independently of React Native after Android accepts the
 * camera/microphone foreground service.
 */
class CoreAlertEvidenceForegroundService : LifecycleService() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private lateinit var mainExecutor: Executor
  private var activationId: String = ""
  private var incidentId: String? = null
  private var currentRecord: CoreAlertEvidenceRecord? = null
  private var cameraProvider: ProcessCameraProvider? = null
  private var videoCapture: VideoCapture<Recorder>? = null
  private var videoRecording: Recording? = null
  private var audioRecorder: MediaRecorder? = null
  private var mode: String = ""
  private var stopping = false
  private var rolloverRequested = false
  private var foregroundStarted = false

  private val rollover = Runnable {
    if (stopping) return@Runnable
    rolloverRequested = true
    if (mode == MODE_VIDEO) {
      videoRecording?.stop()
    } else if (mode == MODE_AUDIO) {
      finishAudioSegment()
      if (!stopping) startAudioRecording()
    }
  }

  override fun onCreate() {
    super.onCreate()
    mainExecutor = ContextCompat.getMainExecutor(this)
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    super.onStartCommand(intent, flags, startId)
    when (intent?.action) {
      ACTION_ATTACH_INCIDENT -> {
        val incomingActivation = intent.getStringExtra(EXTRA_ACTIVATION_ID).orEmpty()
        val incomingIncident = intent.getStringExtra(EXTRA_INCIDENT_ID)
        if (incomingActivation == activationId && !incomingIncident.isNullOrBlank()) {
          incidentId = incomingIncident
          CoreAlertEvidenceStore.attachIncident(this, activationId, incomingIncident)
            .forEach { CoreAlertEvidenceUploadWorker.enqueue(this, it) }
        } else if (!foregroundStarted) {
          // An attach intent may arrive after recording was unavailable. Do not
          // leave a plain background Service instance alive in that case.
          stopSelf(startId)
        }
        return START_NOT_STICKY
      }

      ACTION_STOP -> {
        stopCapture(discard = false)
        return START_NOT_STICKY
      }

      ACTION_DISCARD -> {
        stopCapture(discard = true)
        return START_NOT_STICKY
      }
    }

    if (foregroundStarted) return START_NOT_STICKY
    activationId = intent?.getStringExtra(EXTRA_ACTIVATION_ID).orEmpty()
    incidentId = intent?.getStringExtra(EXTRA_INCIDENT_ID)
    if (activationId.isBlank()) {
      stopSelf()
      return START_NOT_STICKY
    }
    val hasMicrophone = hasPermission(Manifest.permission.RECORD_AUDIO)
    val hasCamera = hasPermission(Manifest.permission.CAMERA)
    if (!hasMicrophone) {
      CoreAlertProtectionStore.recordEvidenceState(
        this,
        "unavailable",
        error = "Microphone permission is unavailable; SOS continued without evidence."
      )
      stopSelf()
      return START_NOT_STICKY
    }

    try {
      startEvidenceForeground(if (hasCamera) MODE_VIDEO else MODE_AUDIO)
    } catch (error: Exception) {
      CoreAlertProtectionStore.recordEvidenceState(
        this,
        "unavailable",
        error = "Android did not allow emergency evidence capture."
      )
      stopSelf()
      return START_NOT_STICKY
    }
    if (hasCamera) startVideoRecording() else startAudioRecording()
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    mainHandler.removeCallbacks(rollover)
    runCatching { videoRecording?.close() }
    videoRecording = null
    runCatching { cameraProvider?.unbindAll() }
    cameraProvider = null
    runCatching { audioRecorder?.stop() }
    runCatching { audioRecorder?.release() }
    audioRecorder = null
    // If Android destroys the process before a recorder finalizes, leave the
    // metadata in "recording". Recovery removes that potentially corrupt
    // container instead of uploading it.
    currentRecord = null
    if (foregroundStarted && stopping) {
      CoreAlertProtectionStore.recordEvidenceState(this, "idle")
    }
    super.onDestroy()
  }

  override fun onBind(intent: Intent): IBinder? {
    super.onBind(intent)
    return null
  }

  @SuppressLint("MissingPermission")
  private fun startVideoRecording() {
    mode = MODE_VIDEO
    updateNotification(MODE_VIDEO)
    CoreAlertProtectionStore.recordEvidenceState(this, "starting", MODE_VIDEO)
    val providerFuture = ProcessCameraProvider.getInstance(this)
    providerFuture.addListener({
      if (stopping) return@addListener
      try {
        val provider = providerFuture.get()
        cameraProvider = provider
        val selector = when {
          provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) -> CameraSelector.DEFAULT_BACK_CAMERA
          provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) -> CameraSelector.DEFAULT_FRONT_CAMERA
          else -> throw IllegalStateException("No camera is available.")
        }
        val recorder = Recorder.Builder()
          .setQualitySelector(
            QualitySelector.fromOrderedList(
              listOf(Quality.HD, Quality.SD),
              FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)
            )
          )
          .build()
        val capture = VideoCapture.withOutput(recorder)
        videoCapture = capture
        provider.unbindAll()
        provider.bindToLifecycle(this, selector, capture)
        beginVideoSegment(capture)
      } catch (error: Exception) {
        fallbackToAudio("Camera unavailable; recording emergency audio instead.")
      }
    }, mainExecutor)
  }

  @SuppressLint("MissingPermission")
  private fun beginVideoSegment(capture: VideoCapture<Recorder>) {
    if (stopping) return
    val record = CoreAlertEvidenceStore.create(
      this,
      activationId,
      incidentId,
      MODE_VIDEO,
      MIME_VIDEO
    )
    currentRecord = record
    val output = FileOutputOptions.Builder(record.mediaFile)
      .setFileSizeLimit(MAX_SEGMENT_BYTES)
      .build()
    try {
      videoRecording = capture.output
        .prepareRecording(this, output)
        .withAudioEnabled()
        .start(mainExecutor) { event ->
          when (event) {
            is VideoRecordEvent.Start -> {
              CoreAlertProtectionStore.recordEvidenceState(this, "recording", MODE_VIDEO)
              scheduleRollover()
            }
            is VideoRecordEvent.Finalize -> onVideoFinalized(event)
          }
        }
    } catch (error: Exception) {
      record.mediaFile.delete()
      record.metadataFile.delete()
      currentRecord = null
      fallbackToAudio("Video recorder unavailable; recording emergency audio instead.")
    }
  }

  private fun onVideoFinalized(event: VideoRecordEvent.Finalize) {
    mainHandler.removeCallbacks(rollover)
    videoRecording = null
    val record = currentRecord
    currentRecord = null
    val completed = record?.let { CoreAlertEvidenceStore.markCompleted(this, it) }
    if (completed != null && !completed.incidentId.isNullOrBlank()) {
      CoreAlertEvidenceUploadWorker.enqueue(this, completed)
    }
    if (stopping) {
      finishStopping()
      return
    }
    if (rolloverRequested || (!event.hasError() && completed != null)) {
      rolloverRequested = false
      videoCapture?.let(::beginVideoSegment)
      return
    }
    fallbackToAudio("Video capture stopped; recording emergency audio instead.")
  }

  private fun fallbackToAudio(reason: String) {
    if (stopping) return
    mainHandler.removeCallbacks(rollover)
    runCatching { videoRecording?.close() }
    videoRecording = null
    runCatching { cameraProvider?.unbindAll() }
    cameraProvider = null
    videoCapture = null
    CoreAlertProtectionStore.recordEvidenceState(this, "starting", MODE_AUDIO, reason)
    startAudioRecording(reason)
  }

  @Suppress("DEPRECATION")
  private fun startAudioRecording(fallbackReason: String = "") {
    if (stopping) return
    mode = MODE_AUDIO
    updateNotification(MODE_AUDIO)
    val record = CoreAlertEvidenceStore.create(
      this,
      activationId,
      incidentId,
      MODE_AUDIO,
      MIME_AUDIO
    )
    currentRecord = record
    try {
      val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        MediaRecorder(this)
      } else {
        MediaRecorder()
      }
      audioRecorder = recorder
      recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
      recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      recorder.setAudioEncodingBitRate(96_000)
      recorder.setAudioSamplingRate(44_100)
      recorder.setOutputFile(record.mediaFile.absolutePath)
      recorder.setMaxFileSize(MAX_SEGMENT_BYTES)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) recorder.setPrivacySensitive(true)
      recorder.setOnInfoListener { _, what, _ ->
        if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED) {
          rolloverRequested = true
          finishAudioSegment()
          if (!stopping) startAudioRecording()
        }
      }
      recorder.prepare()
      recorder.start()
      CoreAlertProtectionStore.recordEvidenceState(this, "recording", MODE_AUDIO, fallbackReason)
      scheduleRollover()
    } catch (error: Exception) {
      runCatching { audioRecorder?.release() }
      audioRecorder = null
      record.mediaFile.delete()
      record.metadataFile.delete()
      currentRecord = null
      CoreAlertProtectionStore.recordEvidenceState(
        this,
        "unavailable",
        error = "Camera and microphone recording were unavailable; SOS remains active."
      )
      finishStopping()
    }
  }

  private fun finishAudioSegment() {
    mainHandler.removeCallbacks(rollover)
    val recorder = audioRecorder
    audioRecorder = null
    runCatching { recorder?.stop() }
    runCatching { recorder?.release() }
    val record = currentRecord
    currentRecord = null
    val completed = record?.let { CoreAlertEvidenceStore.markCompleted(this, it) }
    if (completed != null && !completed.incidentId.isNullOrBlank()) {
      CoreAlertEvidenceUploadWorker.enqueue(this, completed)
    }
  }

  private fun stopCapture(discard: Boolean) {
    if (stopping) return
    stopping = true
    rolloverRequested = false
    mainHandler.removeCallbacks(rollover)
    if (mode == MODE_VIDEO && videoRecording != null) {
      videoRecording?.stop()
      if (discard) CoreAlertEvidenceStore.discardActivation(this, activationId)
      return
    }
    if (mode == MODE_AUDIO) finishAudioSegment()
    if (discard) CoreAlertEvidenceStore.discardActivation(this, activationId)
    finishStopping()
  }

  private fun finishStopping() {
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun scheduleRollover() {
    mainHandler.removeCallbacks(rollover)
    mainHandler.postDelayed(rollover, SEGMENT_DURATION_MS)
  }

  private fun startEvidenceForeground(initialMode: String) {
    val notification = buildNotification(initialMode)
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      if (initialMode == MODE_VIDEO) {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      } else {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      }
    } else {
      0
    }
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
    foregroundStarted = true
  }

  private fun updateNotification(nextMode: String) {
    if (!foregroundStarted) return
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(NOTIFICATION_ID, buildNotification(nextMode))
  }

  private fun buildNotification(captureMode: String): android.app.Notification {
    val openAction = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(
        this,
        57003,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    val stopAction = PendingIntent.getService(
      this,
      57006,
      Intent(this, CoreAlertEvidenceForegroundService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val description = if (captureMode == MODE_VIDEO) {
      "Recording emergency video and audio"
    } else {
      "Camera unavailable — recording emergency audio"
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Core Alert evidence capture")
      .setContentText(description)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .addAction(0, "Stop evidence", stopAction)
      .apply { if (openAction != null) setContentIntent(openAction) }
      .build()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(
        CHANNEL_ID,
        "Emergency evidence capture",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Silent status while Core Alert records emergency evidence"
        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        enableVibration(false)
        setSound(null, null)
      }
    )
  }

  private fun hasPermission(permission: String): Boolean =
    ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

  companion object {
    const val EXTRA_ACTIVATION_ID = "core_alert_activation_id"
    const val EXTRA_INCIDENT_ID = "core_alert_incident_id"
    private const val ACTION_START = "com.corealert.prototype.action.START_EVIDENCE"
    private const val ACTION_ATTACH_INCIDENT = "com.corealert.prototype.action.ATTACH_EVIDENCE_INCIDENT"
    private const val ACTION_STOP = "com.corealert.prototype.action.STOP_EVIDENCE"
    private const val ACTION_DISCARD = "com.corealert.prototype.action.DISCARD_EVIDENCE"
    private const val CHANNEL_ID = "core-alert-sender-evidence-v2"
    private const val NOTIFICATION_ID = 57003
    private const val MODE_VIDEO = "video"
    private const val MODE_AUDIO = "audio"
    private const val MIME_VIDEO = "video/mp4"
    private const val MIME_AUDIO = "audio/mp4"
    // Finalize frequently so an assigned guardian can receive private,
    // near-live evidence while the SOS is still active. This is deliberately
    // segmented upload, not a claim of continuous camera/audio streaming.
    private const val SEGMENT_DURATION_MS = 30_000L
    private const val MAX_SEGMENT_BYTES = 100L * 1024L * 1024L

    fun startFromVisibleActivity(
      context: Context,
      activationId: String,
      incidentId: String? = null,
      @Suppress("UNUSED_PARAMETER") isDemo: Boolean = false
    ): Boolean {
      if (
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) !=
        PackageManager.PERMISSION_GRANTED
      ) {
        CoreAlertProtectionStore.recordEvidenceState(
          context,
          "permission_required",
          error = "Microphone permission is required for emergency evidence."
        )
        return false
      }
      val startingMode = if (
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
        PackageManager.PERMISSION_GRANTED
      ) MODE_VIDEO else MODE_AUDIO
      CoreAlertProtectionStore.recordEvidenceState(context, "starting", startingMode)
      return runCatching {
        ContextCompat.startForegroundService(
          context,
          Intent(context, CoreAlertEvidenceForegroundService::class.java)
            .setAction(ACTION_START)
            .putExtra(EXTRA_ACTIVATION_ID, activationId)
            .putExtra(EXTRA_INCIDENT_ID, incidentId)
        )
        true
      }.getOrElse {
        CoreAlertProtectionStore.recordEvidenceState(
          context,
          "unavailable",
          error = "Android did not allow evidence recording to start."
        )
        false
      }
    }

    fun attachIncident(context: Context, activationId: String, incidentId: String) {
      runCatching {
        context.startService(
          Intent(context, CoreAlertEvidenceForegroundService::class.java)
            .setAction(ACTION_ATTACH_INCIDENT)
            .putExtra(EXTRA_ACTIVATION_ID, activationId)
            .putExtra(EXTRA_INCIDENT_ID, incidentId)
        )
      }
      CoreAlertEvidenceStore.attachIncident(context, activationId, incidentId)
        .forEach { CoreAlertEvidenceUploadWorker.enqueue(context, it) }
    }

    fun stop(context: Context) {
      runCatching {
        context.startService(
          Intent(context, CoreAlertEvidenceForegroundService::class.java).setAction(ACTION_STOP)
        )
      }
    }

    fun discard(context: Context, activationId: String) {
      runCatching {
        context.startService(
          Intent(context, CoreAlertEvidenceForegroundService::class.java)
            .setAction(ACTION_DISCARD)
            .putExtra(EXTRA_ACTIVATION_ID, activationId)
        )
      }
      CoreAlertEvidenceStore.discardActivation(context, activationId)
    }
  }
}

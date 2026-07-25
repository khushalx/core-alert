package com.corealert.prototype

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

object CoreAlertNativeCountdown {
  private const val CHANNEL_ID = "core-alert-sender-sos-status-v2"
  private const val NOTIFICATION_ID = 57001
  private val handler = Handler(Looper.getMainLooper())
  private var activation: Runnable? = null
  private var wakeLock: PowerManager.WakeLock? = null

  @Synchronized
  fun start(context: Context, config: CoreAlertProtectionConfig) {
    if (activation != null) return
    if (!config.enabled || !config.cloudConfigured) {
      CoreAlertProtectionStore.recordError(context, "Protection is enabled but native cloud activation is not configured.")
      return
    }
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      CoreAlertProtectionStore.recordError(context, "Notification permission is required for a safe native SOS countdown.")
      return
    }

    createChannel(context)
    val notifications = NotificationManagerCompat.from(context)
    val channelBlocked = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
        .getNotificationChannel(CHANNEL_ID)?.importance == NotificationManager.IMPORTANCE_NONE
    if (!notifications.areNotificationsEnabled() || channelBlocked) {
      CoreAlertProtectionStore.recordError(context, "Notifications must be enabled for a safe native SOS countdown.")
      return
    }
    val activationId = CoreAlertSosCoordinator.beginCountdown(
      context,
      source = "volume-shortcut"
    ) ?: return
    acquireWakeLock(context, config.countdownSeconds)
    val cancelAction = PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, CoreAlertCountdownCancelReceiver::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val openAction = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(context, 1, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("Core Alert SOS countdown")
      .setContentText("SOS activates in ${config.countdownSeconds} seconds. Tap Cancel if you are safe.")
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .addAction(0, "Cancel SOS", cancelAction)
      .apply { if (openAction != null) setContentIntent(openAction) }
      .build()
    notifications.notify(NOTIFICATION_ID, notification)

    val runnable = Runnable {
      synchronized(this) { activation = null }
      if (CoreAlertSosCoordinator.claimActivation(context, activationId)) {
        activate(context.applicationContext, config, activationId)
      }
    }
    activation = runnable
    // Camera and microphone foreground services must be started while an
    // Activity is visible. Accessibility only reaches this launch boundary.
    val activityLaunched = CoreAlertEmergencyCountdownActivity.launch(context, activationId)
    if (!activityLaunched) {
      // If an OEM blocks the Activity launch, preserve the existing
      // notification countdown and SOS activation. Evidence is unavailable,
      // but SOS continues.
      CoreAlertProtectionStore.recordEvidenceState(
        context,
        "unavailable",
        error = "Android blocked the visible evidence countdown; SOS continued without recording."
      )
    }
    // The extra watchdog time lets the Activity own the normal completion. If
    // it is killed before completing, SOS still activates without evidence.
    val watchdogDelay = config.countdownSeconds * 1_000L + if (activityLaunched) 2_000L else 0L
    handler.postDelayed(runnable, watchdogDelay)
  }

  @Synchronized
  fun cancel(context: Context, reason: String? = null) {
    val pendingActivation = CoreAlertProtectionStore.pendingActivationId(context)
    val wasCountingDown = activation != null || pendingActivation != null
    if (!wasCountingDown) return
    activation?.let { handler.removeCallbacks(it) }
    activation = null
    CoreAlertSosCoordinator.cancelCountdown(context, pendingActivation)
    CoreAlertVolumeSequenceManager.reset(context)
    releaseWakeLock()
    if (!reason.isNullOrBlank()) CoreAlertProtectionStore.recordError(context, reason)
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    CoreAlertEmergencyCountdownActivity.finishVisible()
  }

  @Synchronized
  fun completeFromVisibleActivity(
    context: Context,
    config: CoreAlertProtectionConfig,
    activationId: String,
    onClaimed: () -> Unit
  ): Boolean {
    if (!CoreAlertSosCoordinator.claimActivation(context, activationId)) return false
    activation?.let { handler.removeCallbacks(it) }
    activation = null
    onClaimed()
    activate(context.applicationContext, config, activationId)
    return true
  }

  private fun activate(
    context: Context,
    config: CoreAlertProtectionConfig,
    activationId: String
  ) {
    showActivationStatus(
      context,
      "SOS activated",
      "Alerting your guardians and starting live protection.",
      ongoing = true
    )
    Thread {
      val lastLocation = lastKnownLocation(context)
      var result = CoreAlertCloudResult(null, "Core Alert could not reach the cloud.")
      for (attempt in 0 until 3) {
        result = CoreAlertCloudClient.activate(
          config,
          activationId,
          lastLocation?.latitude,
          lastLocation?.longitude,
          lastLocation?.accuracy
        )
        if (result.incidentId != null) break
        if (attempt < 2) runCatching { Thread.sleep(3_000L) }
      }
      val incidentId = result.incidentId
      if (incidentId != null) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
        if (CoreAlertSosCoordinator.activated(context, activationId, incidentId)) {
          CoreAlertEvidenceForegroundService.attachIncident(context, activationId, incidentId)
          runCatching {
            ContextCompat.startForegroundService(
              context,
              Intent(context, CoreAlertNativeLocationService::class.java)
                .putExtra(CoreAlertNativeLocationService.EXTRA_INCIDENT_ID, incidentId)
            )
          }.onFailure {
            CoreAlertProtectionStore.recordError(
              context,
              "SOS activated, but Android did not allow native background location to start."
            )
          }
        }
      } else {
        CoreAlertEvidenceForegroundService.discard(context, activationId)
        val activationError = result.error ?: "Native SOS activation failed."
        CoreAlertSosCoordinator.activationFailed(context, activationId, activationError)
        showActivationStatus(
          context,
          "SOS activation needs attention",
          "Core Alert could not connect. Open the app and trigger SOS again.",
          ongoing = false
        )
      }
      releaseWakeLock()
    }.start()
  }

  private fun showActivationStatus(context: Context, title: String, body: String, ongoing: Boolean) {
    val openAction = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(context, 3, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(body)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(ongoing)
      .setAutoCancel(!ongoing)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .apply { if (openAction != null) setContentIntent(openAction) }
      .build()
    NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
  }

  @Synchronized
  private fun acquireWakeLock(context: Context, countdownSeconds: Int) {
    releaseWakeLock()
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = powerManager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "${context.packageName}:native-sos-countdown"
    ).apply { acquire((countdownSeconds + 35L) * 1_000L) }
  }

  @Synchronized
  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }

  private fun lastKnownLocation(context: Context): Location? {
    val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
    if (fine != PackageManager.PERMISSION_GRANTED && coarse != PackageManager.PERMISSION_GRANTED) return null
    val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    return runCatching {
      manager.getProviders(true)
        .mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }
        .maxByOrNull { it.time }
    }.getOrNull()
  }

  private fun createChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "SOS status", NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = "Silent countdown and active-SOS status on the protected device"
        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        enableVibration(false)
        vibrationPattern = longArrayOf(0L)
        setSound(null, null)
      }
    )
  }
}

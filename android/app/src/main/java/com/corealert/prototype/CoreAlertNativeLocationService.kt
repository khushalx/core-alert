package com.corealert.prototype

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class CoreAlertNativeLocationService : Service(), LocationListener {
  private var incidentId: String? = null
  private var locationManager: LocationManager? = null
  private var lastUploadAt = 0L

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val requestedIncidentId = intent?.getStringExtra(EXTRA_INCIDENT_ID)
      ?: CoreAlertProtectionStore.activeIncidentId(this)
    if (
      requestedIncidentId.isNullOrBlank() ||
      CoreAlertSosCoordinator.state(this) != CoreAlertSosCoordinator.ACTIVE ||
      CoreAlertProtectionStore.activeIncidentId(this) != requestedIncidentId
    ) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (incidentId == requestedIncidentId && locationManager != null) return START_NOT_STICKY
    runCatching { locationManager?.removeUpdates(this) }
    incidentId = requestedIncidentId
    createChannel()
    val pendingIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 2, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Core Alert SOS is active")
      .setContentText("Sharing live location with linked guardians")
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .apply { if (pendingIntent != null) setContentIntent(pendingIntent) }
      .build()
    try {
      startForeground(NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {
      CoreAlertProtectionStore.recordError(this, "SOS is active, but Android blocked native background location.")
      stopSelf()
      return START_NOT_STICKY
    }
    requestUpdates()
    return START_NOT_STICKY
  }

  override fun onLocationChanged(location: Location) {
    val now = System.currentTimeMillis()
    if (now - lastUploadAt < 8_000) return
    val activeIncidentId = incidentId ?: return
    if (
      CoreAlertSosCoordinator.state(this) != CoreAlertSosCoordinator.ACTIVE ||
      CoreAlertProtectionStore.activeIncidentId(this) != activeIncidentId
    ) {
      stopSelf()
      return
    }
    lastUploadAt = now
    Thread {
      if (
        CoreAlertSosCoordinator.state(this) != CoreAlertSosCoordinator.ACTIVE ||
        CoreAlertProtectionStore.activeIncidentId(this) != activeIncidentId
      ) return@Thread
      val result = CoreAlertCloudClient.updateLocation(
        CoreAlertProtectionStore.config(this),
        activeIncidentId,
        location.latitude,
        location.longitude,
        location.accuracy
      )
      val uploadError = result.error
      if (uploadError != null) CoreAlertProtectionStore.recordError(this, uploadError)
    }.start()
  }

  override fun onDestroy() {
    runCatching { locationManager?.removeUpdates(this) }
    locationManager = null
    incidentId = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION_ID)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun requestUpdates() {
    val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
    if (fine != PackageManager.PERMISSION_GRANTED && coarse != PackageManager.PERMISSION_GRANTED) {
      CoreAlertProtectionStore.recordError(this, "SOS is active, but location permission is unavailable.")
      return
    }
    locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
    val provider = if (fine == PackageManager.PERMISSION_GRANTED) LocationManager.GPS_PROVIDER else LocationManager.NETWORK_PROVIDER
    runCatching { locationManager?.requestLocationUpdates(provider, 8_000L, 8f, this) }
      .onFailure { CoreAlertProtectionStore.recordError(this, "Android did not allow live-location updates.") }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Active SOS location", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Silent status while Core Alert shares live SOS location"
        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        enableVibration(false)
        setSound(null, null)
      }
    )
  }

  companion object {
    const val EXTRA_INCIDENT_ID = "incident_id"
    private const val CHANNEL_ID = "core-alert-sender-location-v2"
    private const val NOTIFICATION_ID = 57002
  }
}

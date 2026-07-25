package com.corealert.prototype

import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.res.Configuration
import android.graphics.Color
import android.media.AudioAttributes
import android.os.Build
import android.provider.Settings

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList = PackageList(this).packages
    )
  }

  override fun onCreate() {
    super.onCreate()
    // A new process starts with no Activity. onResume will set this to true
    // when the React Native UI actually becomes visible.
    CoreAlertProtectionStore.setActivityForeground(this, false)
    // Only finalized private files are recovered. This schedules network work;
    // it never starts camera or microphone capture from Application.
    CoreAlertEvidenceUploadWorker.recover(this)
    createNotificationChannels()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(
        GENERAL_CHANNEL_ID,
        "Core Alert updates",
        NotificationManager.IMPORTANCE_DEFAULT
      ).apply {
        description = "Silent Core Alert status and general updates"
        lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        enableVibration(false)
        setSound(null, null)
      }
    )
    manager.createNotificationChannel(
      NotificationChannel(
        GUARDIAN_SOS_CHANNEL_ID,
        "Emergency SOS alerts",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Loud SOS alerts from people you protect"
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        enableLights(true)
        lightColor = Color.rgb(217, 45, 32)
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 500, 180, 500, 180, 700)
        setSound(
          Settings.System.DEFAULT_ALARM_ALERT_URI,
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
      }
    )
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }

  companion object {
    private const val GENERAL_CHANNEL_ID = "core-alert-general-updates-v2"
    private const val GUARDIAN_SOS_CHANNEL_ID = "guardian-sos-alerts-v3"
  }
}

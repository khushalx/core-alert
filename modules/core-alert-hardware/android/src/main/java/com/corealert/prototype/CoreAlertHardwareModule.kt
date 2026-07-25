package com.corealert.prototype

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import android.util.Log
import android.view.KeyEvent
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong

class CoreAlertHardwareModule : Module() {
  @Volatile
  private var listening = false

  @Volatile
  private var subscribed = false

  private val lastModuleEmitTimestamp = AtomicLong(0)
  private val totalEventsEmitted = AtomicLong(0)

  private val eventBusListener = ModuleEventBusListener(this)

  override fun definition() = ModuleDefinition {
    Name(MODULE_NAME)
    Events(EVENT_NAME)

    Function("isSupported") {
      true
    }

    Function("startListening") {
      Log.d(TAG, "startListening called")
      listening = true
      subscribeToEventBus()
    }

    Function("stopListening") {
      Log.d(TAG, "stopListening called")
      listening = false
      unsubscribeFromEventBus()
    }

    Function("getDiagnostics") {
      nativeDiagnostics()
    }

    Function("getInstallationId") {
      applicationContext()?.let { CoreAlertProtectionStore.installationId(it) } ?: ""
    }

    Function("openAccessibilitySettings") {
      val context = applicationContext() ?: return@Function false
      context.startActivity(
        Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
      true
    }

    Function("configureProtection") { options: Map<String, Any?> ->
      val context = applicationContext() ?: return@Function false
      CoreAlertProtectionStore.configure(
        context = context,
        endpoint = options["endpoint"] as? String ?: "",
        anonKey = options["anonKey"] as? String ?: "",
        deviceId = options["deviceId"] as? String ?: "",
        deviceSecret = options["deviceSecret"] as? String ?: "",
        userId = options["userId"] as? String ?: "",
        countdownSeconds = (options["countdownSeconds"] as? Number)?.toInt() ?: 10,
        demoMode = options["demoMode"] as? Boolean ?: false
      )
      true
    }

    Function("updateProtectionPreferences") { enabled: Boolean, countdownSeconds: Int, demoMode: Boolean ->
      val context = applicationContext() ?: return@Function false
      CoreAlertProtectionStore.updatePreferences(context, enabled, countdownSeconds, demoMode)
      if (!enabled) {
        context.sendBroadcast(
          Intent().setClassName(context.packageName, "${context.packageName}.CoreAlertCountdownCancelReceiver")
        )
        CoreAlertVolumeSequenceManager.reset(context)
        context.stopService(
          Intent().setClassName(context.packageName, "${context.packageName}.CoreAlertNativeLocationService")
        )
        runCatching {
          context.startService(
            Intent()
              .setClassName(context.packageName, "${context.packageName}.CoreAlertEvidenceForegroundService")
              .setAction(ACTION_STOP_EVIDENCE)
          )
        }
        CoreAlertProtectionStore.clearActiveIncident(context)
      }
      true
    }

    Function("clearProtection") {
      val context = applicationContext() ?: return@Function false
      context.sendBroadcast(
        Intent().setClassName(context.packageName, "${context.packageName}.CoreAlertCountdownCancelReceiver")
      )
      CoreAlertVolumeSequenceManager.reset(context)
      context.stopService(
        Intent().setClassName(context.packageName, "${context.packageName}.CoreAlertNativeLocationService")
      )
      runCatching {
        context.startService(
          Intent()
            .setClassName(context.packageName, "${context.packageName}.CoreAlertEvidenceForegroundService")
            .setAction(ACTION_STOP_EVIDENCE)
        )
      }
      CoreAlertProtectionStore.clear(context)
      true
    }

    Function("stopNativeLocation") {
      val context = applicationContext() ?: return@Function false
      context.stopService(
        Intent().setClassName(context.packageName, "${context.packageName}.CoreAlertNativeLocationService")
      )
      true
    }

    Function("setSosBusy") { busy: Boolean, incidentId: String? ->
      val context = applicationContext() ?: return@Function false
      CoreAlertProtectionStore.setSosBusy(context, busy, incidentId)
      true
    }

    Function("clearNativeIncident") {
      val context = applicationContext() ?: return@Function false
      CoreAlertProtectionStore.clearActiveIncident(context)
      true
    }

    Function("setPracticeMode") { enabled: Boolean ->
      val context = applicationContext() ?: return@Function false
      CoreAlertProtectionStore.setPracticeMode(context, enabled)
      CoreAlertVolumeSequenceManager.reset(context)
      true
    }

    Function("beginSosCountdown") { activationId: String, source: String ->
      val context = applicationContext() ?: return@Function false
      CoreAlertSosCoordinator.beginCountdown(context, source, activationId) != null
    }

    Function("claimSosActivation") { activationId: String ->
      val context = applicationContext() ?: return@Function false
      CoreAlertSosCoordinator.claimActivation(context, activationId)
    }

    Function("markSosActive") { activationId: String, incidentId: String ->
      val context = applicationContext() ?: return@Function false
      CoreAlertSosCoordinator.activated(context, activationId, incidentId)
    }

    Function("markSosActivationFailed") { activationId: String, message: String ->
      val context = applicationContext() ?: return@Function false
      CoreAlertSosCoordinator.activationFailed(context, activationId, message)
      true
    }

    Function("cancelSosCountdown") { activationId: String ->
      val context = applicationContext() ?: return@Function false
      CoreAlertSosCoordinator.cancelCountdown(context, activationId)
    }

    Function("restoreSosActive") { incidentId: String ->
      val context = applicationContext() ?: return@Function false
      CoreAlertSosCoordinator.restoreActive(context, incidentId)
    }

    Function("beginSosEnding") { incidentId: String ->
      val context = applicationContext() ?: return@Function false
      CoreAlertSosCoordinator.beginEnding(context, incidentId)
    }

    Function("markSosEndingFailed") { incidentId: String, message: String ->
      val context = applicationContext() ?: return@Function false
      CoreAlertSosCoordinator.endingFailed(context, incidentId, message)
    }

    Function("completeSosEnd") { incidentId: String ->
      val context = applicationContext() ?: return@Function false
      val completed = CoreAlertSosCoordinator.resolved(context, incidentId)
      if (completed) CoreAlertVolumeSequenceManager.reset(context)
      completed
    }

    Function("requestEvidencePermissions") {
      val activity = appContext.currentActivity ?: return@Function false
      val missing = buildList {
        if (
          ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) !=
          PackageManager.PERMISSION_GRANTED
        ) add(Manifest.permission.CAMERA)
        if (
          ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) !=
          PackageManager.PERMISSION_GRANTED
        ) add(Manifest.permission.RECORD_AUDIO)
      }
      if (missing.isNotEmpty()) {
        ActivityCompat.requestPermissions(activity, missing.toTypedArray(), REQUEST_EVIDENCE_PERMISSIONS)
      }
      true
    }

    Function("startEvidenceCapture") { incidentId: String, _: Boolean ->
      val activity = appContext.currentActivity ?: return@Function false
      if (incidentId.isBlank()) return@Function false
      if (
        ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) !=
        PackageManager.PERMISSION_GRANTED
      ) {
        CoreAlertProtectionStore.recordEvidenceState(
          activity,
          "permission_required",
          error = "Microphone permission is required for emergency evidence."
        )
        return@Function false
      }
      val startingMode = if (
        ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) ==
        PackageManager.PERMISSION_GRANTED
      ) "video" else "audio"
      CoreAlertProtectionStore.recordEvidenceState(activity, "starting", startingMode)
      runCatching {
        ContextCompat.startForegroundService(
          activity,
          Intent()
            .setClassName(activity.packageName, "${activity.packageName}.CoreAlertEvidenceForegroundService")
            .setAction(ACTION_START_EVIDENCE)
            .putExtra(EXTRA_ACTIVATION_ID, "js-${UUID.randomUUID()}")
            .putExtra(EXTRA_INCIDENT_ID, incidentId)
        )
        true
      }.getOrDefault(false)
    }

    Function("stopEvidenceCapture") {
      val context = applicationContext() ?: return@Function false
      runCatching {
        context.startService(
          Intent()
            .setClassName(context.packageName, "${context.packageName}.CoreAlertEvidenceForegroundService")
            .setAction(ACTION_STOP_EVIDENCE)
        )
        true
      }.getOrDefault(false)
    }

    OnStopObserving(EVENT_NAME) {
      unsubscribeFromEventBus()
    }

    OnStartObserving(EVENT_NAME) {
      if (listening) subscribeToEventBus()
    }

    OnDestroy {
      listening = false
      unsubscribeFromEventBus()
    }
  }

  @Synchronized
  private fun subscribeToEventBus() {
    if (subscribed) return
    subscribed = CoreAlertVolumeEventBus.subscribe(eventBusListener)
  }

  @Synchronized
  private fun unsubscribeFromEventBus() {
    if (!subscribed) return
    CoreAlertVolumeEventBus.unsubscribe(eventBusListener)
    subscribed = false
  }

  private fun emitVolumeDown(event: CoreAlertVolumeEvent) {
    if (!listening || !subscribed) return

    val emittedAt = System.currentTimeMillis()
    lastModuleEmitTimestamp.set(emittedAt)
    totalEventsEmitted.incrementAndGet()
    Log.d(TAG, "Module emitted event to JavaScript sequence=${event.nativeSequenceNumber}")
    sendEvent(
      EVENT_NAME,
      mapOf(
        "timestamp" to event.timestamp,
        "keyCode" to event.keyCode,
        "action" to if (event.action == KeyEvent.ACTION_DOWN) "down" else "up",
        "repeatCount" to event.repeatCount,
        "isRepeat" to event.isRepeat,
        "nativeSequenceNumber" to event.nativeSequenceNumber,
        "captureSource" to event.captureSource,
        "handledByNativeProtection" to event.handledByNativeProtection,
        "nativePressCount" to event.nativePressCount
      )
    )
  }

  private fun nativeDiagnostics(): Map<String, Any> {
    val protection = applicationContext()?.let { CoreAlertProtectionStore.diagnostics(it) } ?: emptyMap()
    return CoreAlertVolumeEventBus.diagnostics() + protection + mapOf(
      "moduleLoaded" to true,
      "listening" to (listening && subscribed),
      "lastModuleEmitTimestamp" to lastModuleEmitTimestamp.get(),
      "totalEventsEmitted" to totalEventsEmitted.get()
    )
  }

  private fun applicationContext() = appContext.reactContext?.applicationContext

  private class ModuleEventBusListener(module: CoreAlertHardwareModule) :
    CoreAlertVolumeEventBus.Listener {
    private val moduleReference = WeakReference(module)

    override fun onVolumeDown(event: CoreAlertVolumeEvent) {
      moduleReference.get()?.emitVolumeDown(event)
    }
  }

  companion object {
    const val MODULE_NAME = "CoreAlertHardware"
    const val EVENT_NAME = "coreAlertVolumeDownPress"
    const val TAG = "CoreAlertVolume"
    private const val REQUEST_EVIDENCE_PERMISSIONS = 7402
    private const val ACTION_START_EVIDENCE = "com.corealert.prototype.action.START_EVIDENCE"
    private const val ACTION_STOP_EVIDENCE = "com.corealert.prototype.action.STOP_EVIDENCE"
    private const val EXTRA_ACTIVATION_ID = "core_alert_activation_id"
    private const val EXTRA_INCIDENT_ID = "core_alert_incident_id"
  }
}

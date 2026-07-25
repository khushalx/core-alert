package com.corealert.prototype

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.util.Log
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent

/**
 * Observes the emergency shortcut while Android keeps this accessibility
 * service enabled. It never consumes the key, reads screen content, performs
 * gestures, or controls any UI.
 */
class CoreAlertAccessibilityService : AccessibilityService() {
  override fun onServiceConnected() {
    super.onServiceConnected()
    serviceInfo = serviceInfo.apply {
      flags = flags or AccessibilityServiceInfo.FLAG_REQUEST_FILTER_KEY_EVENTS
    }
    CoreAlertProtectionStore.setAccessibilityConnected(this, true)
    Log.i(TAG, "Core Alert hardware protection connected")
  }

  override fun onKeyEvent(event: KeyEvent): Boolean {
    if (
      event.keyCode != KeyEvent.KEYCODE_VOLUME_DOWN ||
      event.action != KeyEvent.ACTION_DOWN ||
      event.repeatCount != 0
    ) return false

    val config = CoreAlertProtectionStore.config(this)
    val result = CoreAlertVolumeSequenceManager.recordPress(this, event.eventTime)
    if (result.duplicate) return false
    CoreAlertVolumeEventBus.publishVolumeDown(
      event,
      captureSource = "accessibility",
      handledByNativeProtection = true,
      nativePressCount = result.count
    )
    if (result.triggered && !CoreAlertProtectionStore.isPracticeMode(this)) {
      CoreAlertNativeCountdown.start(this, config)
    }

    return false
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

  override fun onInterrupt() = Unit

  override fun onUnbind(intent: android.content.Intent?): Boolean {
    CoreAlertProtectionStore.setAccessibilityConnected(this, false)
    CoreAlertVolumeSequenceManager.reset(this)
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    CoreAlertProtectionStore.setAccessibilityConnected(this, false)
    super.onDestroy()
  }

  companion object {
    private const val TAG = "CoreAlertAccessibility"
  }
}

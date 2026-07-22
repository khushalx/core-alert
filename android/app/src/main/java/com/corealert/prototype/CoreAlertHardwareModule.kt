package com.corealert.prototype

import android.view.KeyEvent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class CoreAlertHardwareModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  @Volatile
  private var isListening = false

  override fun getName(): String = "CoreAlertHardware"

  @ReactMethod
  fun isSupported(promise: Promise) {
    promise.resolve(true)
  }

  @ReactMethod
  fun startListening(promise: Promise) {
    isListening = true
    promise.resolve(null)
  }

  @ReactMethod
  fun stopListening(promise: Promise) {
    isListening = false
    promise.resolve(null)
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by NativeEventEmitter. Listener ownership remains in JavaScript.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required by NativeEventEmitter. Listener ownership remains in JavaScript.
  }

  fun emitVolumeDownPress(event: KeyEvent) {
    if (!isListening || !reactContext.hasActiveReactInstance()) return

    val payload = Arguments.createMap().apply {
      putDouble("timestamp", System.currentTimeMillis().toDouble())
      putInt("keyCode", event.keyCode)
      putString("action", "down")
      putInt("repeatCount", event.repeatCount)
      putBoolean("isRepeat", event.repeatCount > 0)
    }

    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, payload)
  }

  companion object {
    const val EVENT_NAME = "coreAlertVolumeDownPress"
  }
}

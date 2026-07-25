package com.corealert.prototype

import android.util.Log
import android.view.KeyEvent
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

data class CoreAlertVolumeEvent(
  val timestamp: Long,
  val keyCode: Int,
  val action: Int,
  val repeatCount: Int,
  val nativeSequenceNumber: Long,
  val captureSource: String,
  val handledByNativeProtection: Boolean,
  val nativePressCount: Int
) {
  val isRepeat: Boolean
    get() = repeatCount > 0
}

/**
 * Process-level handoff between MainActivity and the Expo module.
 *
 * It contains no Activity or ReactContext reference. CopyOnWriteArraySet makes
 * publication thread-safe, prevents duplicate listeners, and keeps iteration
 * stable if a listener detaches while an event is being published.
 */
object CoreAlertVolumeEventBus {
  private const val TAG = "CoreAlertVolume"

  fun interface Listener {
    fun onVolumeDown(event: CoreAlertVolumeEvent)
  }

  private val listeners = CopyOnWriteArraySet<Listener>()
  private val sequence = AtomicLong(0)
  private val lastPhysicalEventTimestamp = AtomicLong(0)
  private val lastPhysicalKeyCode = AtomicInteger(0)
  private val totalPhysicalPressesReceived = AtomicLong(0)

  fun subscribe(listener: Listener): Boolean {
    val added = listeners.add(listener)
    Log.d(TAG, "Module subscribed added=$added subscribers=${listeners.size}")
    return added
  }

  fun unsubscribe(listener: Listener): Boolean {
    val removed = listeners.remove(listener)
    Log.d(TAG, "Module unsubscribed removed=$removed subscribers=${listeners.size}")
    return removed
  }

  fun publishVolumeDown(
    keyEvent: KeyEvent,
    captureSource: String = "activity",
    handledByNativeProtection: Boolean = false,
    nativePressCount: Int = 0
  ) {
    val event = CoreAlertVolumeEvent(
      timestamp = System.currentTimeMillis(),
      keyCode = keyEvent.keyCode,
      action = keyEvent.action,
      repeatCount = keyEvent.repeatCount,
      nativeSequenceNumber = sequence.incrementAndGet(),
      captureSource = captureSource,
      handledByNativeProtection = handledByNativeProtection,
      nativePressCount = nativePressCount
    )
    lastPhysicalEventTimestamp.set(event.timestamp)
    lastPhysicalKeyCode.set(event.keyCode)
    totalPhysicalPressesReceived.incrementAndGet()
    Log.d(
      TAG,
      "Event bus published sequence=${event.nativeSequenceNumber} subscribers=${listeners.size}"
    )
    listeners.forEach { listener ->
      runCatching { listener.onVolumeDown(event) }
        .onFailure { error ->
          Log.e(TAG, "Event bus listener failed: ${error.javaClass.simpleName}")
        }
    }
  }

  fun diagnostics(): Map<String, Any> = mapOf(
    "eventBusSubscriberCount" to listeners.size,
    "lastPhysicalEventTimestamp" to lastPhysicalEventTimestamp.get(),
    "lastPhysicalKeyCode" to lastPhysicalKeyCode.get(),
    "totalPhysicalPressesReceived" to totalPhysicalPressesReceived.get()
  )
}

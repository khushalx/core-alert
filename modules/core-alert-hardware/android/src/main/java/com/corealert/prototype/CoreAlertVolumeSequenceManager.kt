package com.corealert.prototype

import android.content.Context
import android.os.SystemClock

data class CoreAlertVolumeSequenceResult(
  val count: Int,
  val triggered: Boolean,
  val duplicate: Boolean = false
)

/**
 * One monotonic physical-button counter shared by MainActivity,
 * AccessibilityService, and diagnostics.
 */
object CoreAlertVolumeSequenceManager {
  const val REQUIRED_PRESSES = 5
  const val PRESS_WINDOW_MS = 3_000L

  private val pressTimes = ArrayDeque<Long>()
  private var lastEventTime = Long.MIN_VALUE

  @Synchronized
  fun recordPress(
    context: Context,
    eventTime: Long = SystemClock.elapsedRealtime()
  ): CoreAlertVolumeSequenceResult {
    if (eventTime == lastEventTime) {
      return CoreAlertVolumeSequenceResult(pressTimes.size, false, duplicate = true)
    }
    lastEventTime = eventTime
    if (
      !CoreAlertProtectionStore.config(context).enabled ||
      CoreAlertProtectionStore.isSosBusy(context)
    ) {
      reset(context)
      return CoreAlertVolumeSequenceResult(0, false)
    }
    while (pressTimes.isNotEmpty() && eventTime - pressTimes.first() > PRESS_WINDOW_MS) {
      pressTimes.removeFirst()
    }
    pressTimes.addLast(eventTime)
    val count = pressTimes.size
    CoreAlertProtectionStore.recordNativePress(context, count, System.currentTimeMillis())
    if (count < REQUIRED_PRESSES) return CoreAlertVolumeSequenceResult(count, false)
    reset(context)
    return CoreAlertVolumeSequenceResult(REQUIRED_PRESSES, true)
  }

  @Synchronized
  fun reset(context: Context) {
    pressTimes.clear()
    CoreAlertProtectionStore.recordNativePress(context, 0, System.currentTimeMillis())
  }
}

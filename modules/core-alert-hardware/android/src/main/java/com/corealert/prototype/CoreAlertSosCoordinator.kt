package com.corealert.prototype

import android.content.Context
import java.util.UUID

/**
 * Native SOS lifecycle authority shared by Activities, services, and the
 * React Native bridge. Transitions are persisted synchronously so a process
 * restart cannot replay a consumed activation.
 */
object CoreAlertSosCoordinator {
  const val IDLE = "idle"
  const val COUNTDOWN = "countdown"
  const val ACTIVATING = "activating"
  const val ACTIVE = "active"
  const val ENDING = "ending"
  const val RESOLVED = "resolved"
  const val ACTIVATION_FAILED = "activation_failed"
  const val ENDING_FAILED = "ending_failed"

  @Synchronized
  fun beginCountdown(
    context: Context,
    source: String,
    activationId: String = UUID.randomUUID().toString()
  ): String? =
    activationId.takeIf {
      CoreAlertProtectionStore.beginPendingActivation(context, it, source)
    }

  @Synchronized
  fun claimActivation(context: Context, activationId: String): Boolean =
    CoreAlertProtectionStore.claimPendingActivation(context, activationId)

  @Synchronized
  fun activated(context: Context, activationId: String, incidentId: String): Boolean =
    CoreAlertProtectionStore.recordActivation(context, incidentId, activationId)

  @Synchronized
  fun activationFailed(context: Context, activationId: String, message: String) {
    if (
      CoreAlertProtectionStore.transitionLifecycle(
        context,
        setOf(ACTIVATING),
        ACTIVATION_FAILED
      )
    ) {
      CoreAlertProtectionStore.recordError(context, message)
      CoreAlertProtectionStore.clearPendingActivation(context, activationId, ACTIVATION_FAILED)
    }
  }

  @Synchronized
  fun cancelCountdown(context: Context, activationId: String?): Boolean {
    val pending = CoreAlertProtectionStore.pendingActivation(context) ?: return false
    if (pending.status != "pending" || state(context) != COUNTDOWN) return false
    if (activationId != null && pending.id != activationId) return false
    return CoreAlertProtectionStore.clearPendingActivation(context, pending.id, IDLE)
  }

  @Synchronized
  fun restoreActive(context: Context, incidentId: String): Boolean {
    val current = CoreAlertProtectionStore.lifecycleState(context)
    if (current == ACTIVE && CoreAlertProtectionStore.activeIncidentId(context) == incidentId) {
      return true
    }
    return CoreAlertProtectionStore.transitionLifecycle(
      context,
      setOf(IDLE, RESOLVED, ACTIVATION_FAILED, ENDING_FAILED, ACTIVE),
      ACTIVE,
      incidentId
    )
  }

  @Synchronized
  fun beginEnding(context: Context, incidentId: String): Boolean =
    CoreAlertProtectionStore.transitionLifecycle(
      context,
      setOf(ACTIVE, ENDING_FAILED),
      ENDING,
      incidentId
    )

  @Synchronized
  fun endingFailed(context: Context, incidentId: String, message: String): Boolean {
    val changed = CoreAlertProtectionStore.transitionLifecycle(
      context,
      setOf(ENDING),
      ENDING_FAILED,
      incidentId
    )
    if (changed) CoreAlertProtectionStore.recordError(context, message)
    return changed
  }

  @Synchronized
  fun resolved(context: Context, incidentId: String): Boolean {
    if (
      !CoreAlertProtectionStore.transitionLifecycle(
        context,
        setOf(ENDING, ACTIVE),
        RESOLVED,
        incidentId
      )
    ) return false
    CoreAlertProtectionStore.clearPendingActivation(context, nextLifecycle = RESOLVED)
    CoreAlertProtectionStore.clearActiveIncident(context)
    return true
  }

  fun state(context: Context): String = CoreAlertProtectionStore.lifecycleState(context)
}

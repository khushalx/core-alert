package com.corealert.prototype

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Settings
import android.util.Base64
import androidx.core.content.ContextCompat
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class CoreAlertProtectionConfig(
  val enabled: Boolean,
  val endpoint: String,
  val anonKey: String,
  val deviceId: String,
  val deviceSecret: String,
  val userId: String,
  val countdownSeconds: Int,
  val demoMode: Boolean
) {
  val cloudConfigured: Boolean
    get() = endpoint.startsWith("https://") &&
      anonKey.isNotBlank() &&
      deviceId.isNotBlank() &&
      deviceSecret.isNotBlank() &&
      userId.isNotBlank()
}

data class CoreAlertPendingActivation(
  val id: String,
  val source: String,
  val createdAt: Long,
  val consumedAt: Long?,
  val status: String
)

/**
 * Process-independent protection state shared by the React Native bridge,
 * AccessibilityService, and foreground location service.
 *
 * The server-issued device secret is encrypted with an Android Keystore key.
 * Supabase credentials and user passwords are never stored here.
 */
object CoreAlertProtectionStore {
  const val PENDING_ACTIVATION_TTL_MS = 60_000L
  private const val PREFERENCES = "core_alert_native_protection"
  private const val KEY_ALIAS = "core_alert_device_secret_v1"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_ENDPOINT = "endpoint"
  private const val KEY_ANON_KEY = "anon_key"
  private const val KEY_DEVICE_ID = "device_id"
  private const val KEY_SECRET = "device_secret"
  private const val KEY_USER_ID = "user_id"
  private const val KEY_COUNTDOWN = "countdown_seconds"
  private const val KEY_DEMO_MODE = "demo_mode"
  private const val KEY_INSTALLATION_ID = "installation_id"
  private const val KEY_ACCESSIBILITY_CONNECTED = "accessibility_connected"
  private const val KEY_ACTIVITY_FOREGROUND = "activity_foreground"
  private const val KEY_NATIVE_PRESS_COUNT = "native_press_count"
  private const val KEY_LAST_NATIVE_PRESS = "last_native_press"
  private const val KEY_COUNTDOWN_ACTIVE = "countdown_active"
  private const val KEY_LAST_ACTIVATION = "last_activation"
  private const val KEY_LAST_ERROR = "last_error"
  private const val KEY_ACTIVE_INCIDENT = "active_incident"
  private const val KEY_SOS_BUSY = "sos_busy"
  private const val KEY_PENDING_ACTIVATION = "pending_activation"
  private const val KEY_PENDING_ACTIVATION_SOURCE = "pending_activation_source"
  private const val KEY_PENDING_ACTIVATION_CREATED = "pending_activation_created"
  private const val KEY_PENDING_ACTIVATION_CONSUMED = "pending_activation_consumed"
  private const val KEY_PENDING_ACTIVATION_STATUS = "pending_activation_status"
  private const val KEY_LAST_CONSUMED_ACTIVATION = "last_consumed_activation"
  private const val KEY_LIFECYCLE_STATE = "sos_lifecycle_state"
  private const val KEY_LAST_LIFECYCLE_STATE = "last_sos_lifecycle_state"
  private const val KEY_LIFECYCLE_UPDATED = "sos_lifecycle_updated"
  private const val KEY_PRACTICE_MODE = "practice_mode"
  private const val KEY_PRACTICE_MODE_UPDATED = "practice_mode_updated"
  private const val KEY_EVIDENCE_STATUS = "evidence_status"
  private const val KEY_EVIDENCE_MODE = "evidence_mode"
  private const val KEY_EVIDENCE_LAST_ERROR = "evidence_last_error"
  private const val KEY_EVIDENCE_PENDING_UPLOADS = "evidence_pending_uploads"

  fun configure(
    context: Context,
    endpoint: String,
    anonKey: String,
    deviceId: String,
    deviceSecret: String,
    userId: String,
    countdownSeconds: Int,
    demoMode: Boolean
  ) {
    preferences(context).edit()
      .putString(KEY_ENDPOINT, endpoint.trimEnd('/'))
      .putString(KEY_ANON_KEY, anonKey)
      .putString(KEY_DEVICE_ID, deviceId)
      .putString(KEY_SECRET, encrypt(deviceSecret))
      .putString(KEY_USER_ID, userId)
      .putInt(KEY_COUNTDOWN, countdownSeconds.coerceIn(5, 30))
      .putBoolean(KEY_DEMO_MODE, demoMode)
      .putBoolean(KEY_ENABLED, true)
      .putString(KEY_LAST_ERROR, "")
      .apply()
  }

  fun updatePreferences(context: Context, enabled: Boolean, countdownSeconds: Int, demoMode: Boolean) {
    preferences(context).edit()
      .putBoolean(KEY_ENABLED, enabled)
      .putInt(KEY_COUNTDOWN, countdownSeconds.coerceIn(5, 30))
      .putBoolean(KEY_DEMO_MODE, demoMode)
      .apply()
  }

  fun clear(context: Context) {
    val installationId = installationId(context)
    preferences(context).edit().clear().putString(KEY_INSTALLATION_ID, installationId).apply()
  }

  fun config(context: Context): CoreAlertProtectionConfig {
    val preferences = preferences(context)
    return CoreAlertProtectionConfig(
      enabled = preferences.getBoolean(KEY_ENABLED, false),
      endpoint = preferences.getString(KEY_ENDPOINT, "") ?: "",
      anonKey = preferences.getString(KEY_ANON_KEY, "") ?: "",
      deviceId = preferences.getString(KEY_DEVICE_ID, "") ?: "",
      deviceSecret = decrypt(preferences.getString(KEY_SECRET, "") ?: ""),
      userId = preferences.getString(KEY_USER_ID, "") ?: "",
      countdownSeconds = preferences.getInt(KEY_COUNTDOWN, 10).coerceIn(5, 30),
      demoMode = preferences.getBoolean(KEY_DEMO_MODE, false)
    )
  }

  fun installationId(context: Context): String {
    val preferences = preferences(context)
    val existing = preferences.getString(KEY_INSTALLATION_ID, null)
    if (!existing.isNullOrBlank()) return existing
    val created = UUID.randomUUID().toString()
    preferences.edit().putString(KEY_INSTALLATION_ID, created).apply()
    return created
  }

  fun isAccessibilityEnabled(context: Context): Boolean {
    val expected = "${context.packageName}/com.corealert.prototype.CoreAlertAccessibilityService"
    val enabled = Settings.Secure.getString(
      context.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false
    return enabled.split(':').any { it.equals(expected, ignoreCase = true) }
  }

  fun setAccessibilityConnected(context: Context, connected: Boolean) {
    preferences(context).edit().putBoolean(KEY_ACCESSIBILITY_CONNECTED, connected).apply()
  }

  fun isAccessibilityConnected(context: Context): Boolean =
    preferences(context).getBoolean(KEY_ACCESSIBILITY_CONNECTED, false)

  fun setActivityForeground(context: Context, foreground: Boolean) {
    preferences(context).edit().putBoolean(KEY_ACTIVITY_FOREGROUND, foreground).apply()
  }

  fun isActivityForeground(context: Context): Boolean =
    preferences(context).getBoolean(KEY_ACTIVITY_FOREGROUND, false)

  fun recordNativePress(context: Context, count: Int, timestamp: Long) {
    preferences(context).edit()
      .putInt(KEY_NATIVE_PRESS_COUNT, count)
      .putLong(KEY_LAST_NATIVE_PRESS, timestamp)
      .apply()
  }

  fun setCountdownActive(context: Context, active: Boolean) {
    preferences(context).edit().putBoolean(KEY_COUNTDOWN_ACTIVE, active).apply()
  }

  @Synchronized
  fun beginPendingActivation(
    context: Context,
    activationId: String,
    source: String = "volume-shortcut",
    createdAt: Long = System.currentTimeMillis()
  ): Boolean {
    val preferences = preferences(context)
    expirePendingActivationLocked(preferences, createdAt)
    val lifecycle = lifecycleStateLocked(preferences)
    if (
      lifecycle !in setOf("idle", "resolved", "activation_failed") ||
      !preferences.getString(KEY_ACTIVE_INCIDENT, "").isNullOrBlank() ||
      activationId == preferences.getString(KEY_LAST_CONSUMED_ACTIVATION, "")
    ) return false
    return preferences.edit()
      .putString(KEY_PENDING_ACTIVATION, activationId)
      .putString(KEY_PENDING_ACTIVATION_SOURCE, source)
      .putLong(KEY_PENDING_ACTIVATION_CREATED, createdAt)
      .putLong(KEY_PENDING_ACTIVATION_CONSUMED, 0L)
      .putString(KEY_PENDING_ACTIVATION_STATUS, "pending")
      .putBoolean(KEY_COUNTDOWN_ACTIVE, true)
      .putBoolean(KEY_SOS_BUSY, true)
      .putString(KEY_LAST_LIFECYCLE_STATE, lifecycle)
      .putString(KEY_LIFECYCLE_STATE, "countdown")
      .putLong(KEY_LIFECYCLE_UPDATED, createdAt)
      .commit()
  }

  @Synchronized
  fun pendingActivation(
    context: Context,
    now: Long = System.currentTimeMillis()
  ): CoreAlertPendingActivation? {
    val preferences = preferences(context)
    expirePendingActivationLocked(preferences, now)
    val id = preferences.getString(KEY_PENDING_ACTIVATION, null)?.takeIf { it.isNotBlank() }
      ?: return null
    return CoreAlertPendingActivation(
      id = id,
      source = preferences.getString(KEY_PENDING_ACTIVATION_SOURCE, "volume-shortcut")
        ?: "volume-shortcut",
      createdAt = preferences.getLong(KEY_PENDING_ACTIVATION_CREATED, 0L),
      consumedAt = preferences.getLong(KEY_PENDING_ACTIVATION_CONSUMED, 0L).takeIf { it > 0L },
      status = preferences.getString(KEY_PENDING_ACTIVATION_STATUS, "pending") ?: "pending"
    )
  }

  fun pendingActivationId(context: Context): String? = pendingActivation(context)?.id

  @Synchronized
  fun claimPendingActivation(
    context: Context,
    activationId: String,
    now: Long = System.currentTimeMillis()
  ): Boolean {
    val preferences = preferences(context)
    expirePendingActivationLocked(preferences, now)
    val pendingId = preferences.getString(KEY_PENDING_ACTIVATION, "") ?: ""
    if (
      pendingId != activationId ||
      preferences.getString(KEY_PENDING_ACTIVATION_STATUS, "pending") != "pending" ||
      preferences.getLong(KEY_PENDING_ACTIVATION_CONSUMED, 0L) > 0L ||
      lifecycleStateLocked(preferences) != "countdown" ||
      preferences.getString(KEY_LAST_CONSUMED_ACTIVATION, "") == activationId
    ) return false
    return preferences.edit()
      .putLong(KEY_PENDING_ACTIVATION_CONSUMED, now)
      .putString(KEY_PENDING_ACTIVATION_STATUS, "consumed")
      .putString(KEY_LAST_CONSUMED_ACTIVATION, activationId)
      .putBoolean(KEY_COUNTDOWN_ACTIVE, false)
      .putString(KEY_LAST_LIFECYCLE_STATE, "countdown")
      .putString(KEY_LIFECYCLE_STATE, "activating")
      .putLong(KEY_LIFECYCLE_UPDATED, now)
      .commit()
  }

  @Synchronized
  fun clearPendingActivation(
    context: Context,
    activationId: String? = null,
    nextLifecycle: String = "idle"
  ): Boolean {
    val preferences = preferences(context)
    if (activationId != null && preferences.getString(KEY_PENDING_ACTIVATION, null) != activationId) {
      return false
    }
    val previous = lifecycleStateLocked(preferences)
    return preferences.edit()
      .putString(KEY_PENDING_ACTIVATION, "")
      .putString(KEY_PENDING_ACTIVATION_SOURCE, "")
      .putLong(KEY_PENDING_ACTIVATION_CREATED, 0L)
      .putLong(KEY_PENDING_ACTIVATION_CONSUMED, 0L)
      .putString(KEY_PENDING_ACTIVATION_STATUS, "cleared")
      .putBoolean(KEY_COUNTDOWN_ACTIVE, false)
      .putBoolean(KEY_SOS_BUSY, nextLifecycle !in setOf("idle", "resolved", "activation_failed"))
      .putString(KEY_LAST_LIFECYCLE_STATE, previous)
      .putString(KEY_LIFECYCLE_STATE, nextLifecycle)
      .putLong(KEY_LIFECYCLE_UPDATED, System.currentTimeMillis())
      .commit()
  }

  @Synchronized
  fun recordActivation(context: Context, incidentId: String?, activationId: String? = null): Boolean {
    if (incidentId.isNullOrBlank()) return false
    val preferences = preferences(context)
    val pendingId = preferences.getString(KEY_PENDING_ACTIVATION, "")
    if (activationId != null && !pendingId.isNullOrBlank() && pendingId != activationId) return false
    return preferences.edit()
      .putLong(KEY_LAST_ACTIVATION, System.currentTimeMillis())
      .putString(KEY_ACTIVE_INCIDENT, incidentId)
      .putBoolean(KEY_SOS_BUSY, true)
      .putString(KEY_LAST_ERROR, "")
      .putString(KEY_PENDING_ACTIVATION, "")
      .putString(KEY_PENDING_ACTIVATION_SOURCE, "")
      .putLong(KEY_PENDING_ACTIVATION_CREATED, 0L)
      .putLong(KEY_PENDING_ACTIVATION_CONSUMED, 0L)
      .putString(KEY_PENDING_ACTIVATION_STATUS, "activated")
      .putBoolean(KEY_COUNTDOWN_ACTIVE, false)
      .putString(KEY_LAST_LIFECYCLE_STATE, lifecycleStateLocked(preferences))
      .putString(KEY_LIFECYCLE_STATE, "active")
      .putLong(KEY_LIFECYCLE_UPDATED, System.currentTimeMillis())
      .commit()
  }

  fun recordError(context: Context, message: String) {
    preferences(context).edit().putString(KEY_LAST_ERROR, message.take(180)).apply()
  }

  fun recordEvidenceState(
    context: Context,
    status: String,
    mode: String = "",
    error: String = ""
  ) {
    preferences(context).edit()
      .putString(KEY_EVIDENCE_STATUS, status.take(40))
      .putString(KEY_EVIDENCE_MODE, mode.take(20))
      .putString(KEY_EVIDENCE_LAST_ERROR, error.take(180))
      .apply()
  }

  fun setEvidencePendingUploads(context: Context, count: Int) {
    preferences(context).edit()
      .putInt(KEY_EVIDENCE_PENDING_UPLOADS, count.coerceAtLeast(0))
      .apply()
  }

  @Synchronized
  fun clearActiveIncident(context: Context) {
    val preferences = preferences(context)
    preferences.edit()
      .putString(KEY_ACTIVE_INCIDENT, "")
      .putBoolean(KEY_SOS_BUSY, false)
      .putString(KEY_LAST_LIFECYCLE_STATE, lifecycleStateLocked(preferences))
      .putString(KEY_LIFECYCLE_STATE, "idle")
      .putLong(KEY_LIFECYCLE_UPDATED, System.currentTimeMillis())
      .commit()
  }

  @Synchronized
  fun setSosBusy(context: Context, busy: Boolean, incidentId: String?) {
    val preferences = preferences(context)
    val editor = preferences.edit().putBoolean(KEY_SOS_BUSY, busy)
    if (incidentId != null) editor.putString(KEY_ACTIVE_INCIDENT, incidentId)
    if (busy && !incidentId.isNullOrBlank()) {
      editor
        .putString(KEY_LAST_LIFECYCLE_STATE, lifecycleStateLocked(preferences))
        .putString(KEY_LIFECYCLE_STATE, "active")
        .putLong(KEY_LIFECYCLE_UPDATED, System.currentTimeMillis())
    } else if (!busy && preferences.getString(KEY_ACTIVE_INCIDENT, "").isNullOrBlank()) {
      editor
        .putString(KEY_LAST_LIFECYCLE_STATE, lifecycleStateLocked(preferences))
        .putString(KEY_LIFECYCLE_STATE, "idle")
        .putLong(KEY_LIFECYCLE_UPDATED, System.currentTimeMillis())
    }
    editor.commit()
  }

  fun isSosBusy(context: Context): Boolean {
    val preferences = preferences(context)
    expirePendingActivationLocked(preferences, System.currentTimeMillis())
    return lifecycleStateLocked(preferences) !in setOf("idle", "resolved", "activation_failed") ||
      preferences.getBoolean(KEY_SOS_BUSY, false) ||
      !preferences.getString(KEY_ACTIVE_INCIDENT, "").isNullOrBlank()
  }

  @Synchronized
  fun transitionLifecycle(
    context: Context,
    expected: Set<String>,
    next: String,
    incidentId: String? = null
  ): Boolean {
    val preferences = preferences(context)
    expirePendingActivationLocked(preferences, System.currentTimeMillis())
    val current = lifecycleStateLocked(preferences)
    if (current !in expected) return false
    val storedIncident = preferences.getString(KEY_ACTIVE_INCIDENT, "")
    if (incidentId != null && !storedIncident.isNullOrBlank() && storedIncident != incidentId) return false
    val busy = next !in setOf("idle", "resolved", "activation_failed")
    val editor = preferences.edit()
      .putString(KEY_LAST_LIFECYCLE_STATE, current)
      .putString(KEY_LIFECYCLE_STATE, next)
      .putLong(KEY_LIFECYCLE_UPDATED, System.currentTimeMillis())
      .putBoolean(KEY_SOS_BUSY, busy)
    if (incidentId != null) editor.putString(KEY_ACTIVE_INCIDENT, incidentId)
    return editor.commit()
  }

  fun lifecycleState(context: Context): String {
    val preferences = preferences(context)
    expirePendingActivationLocked(preferences, System.currentTimeMillis())
    return lifecycleStateLocked(preferences)
  }

  fun activeIncidentId(context: Context): String? =
    preferences(context).getString(KEY_ACTIVE_INCIDENT, null)?.takeIf { it.isNotBlank() }

  fun setPracticeMode(context: Context, enabled: Boolean) {
    preferences(context).edit()
      .putBoolean(KEY_PRACTICE_MODE, enabled)
      .putLong(KEY_PRACTICE_MODE_UPDATED, System.currentTimeMillis())
      .apply()
  }

  fun isPracticeMode(context: Context): Boolean {
    val preferences = preferences(context)
    val fresh =
      System.currentTimeMillis() - preferences.getLong(KEY_PRACTICE_MODE_UPDATED, 0L) < 5 * 60_000L
    return fresh && preferences.getBoolean(KEY_PRACTICE_MODE, false) && isActivityForeground(context)
  }

  fun diagnostics(context: Context): Map<String, Any> {
    val preferences = preferences(context)
    val config = config(context)
    return mapOf(
      "accessibilityEnabled" to isAccessibilityEnabled(context),
      "accessibilityConnected" to isAccessibilityConnected(context),
      "activityForeground" to isActivityForeground(context),
      "protectionEnabled" to config.enabled,
      "cloudConfigured" to config.cloudConfigured,
      "configuredUserId" to config.userId,
      "installationId" to installationId(context),
      "nativePressCount" to preferences.getInt(KEY_NATIVE_PRESS_COUNT, 0),
      "lastNativePressTimestamp" to preferences.getLong(KEY_LAST_NATIVE_PRESS, 0L),
      "nativeCountdownActive" to preferences.getBoolean(KEY_COUNTDOWN_ACTIVE, false),
      "pendingNativeActivationId" to (preferences.getString(KEY_PENDING_ACTIVATION, "") ?: ""),
      "pendingNativeActivationSource" to (preferences.getString(KEY_PENDING_ACTIVATION_SOURCE, "") ?: ""),
      "pendingNativeActivationCreatedAt" to preferences.getLong(KEY_PENDING_ACTIVATION_CREATED, 0L),
      "pendingNativeActivationConsumedAt" to preferences.getLong(KEY_PENDING_ACTIVATION_CONSUMED, 0L),
      "pendingNativeActivationStatus" to (preferences.getString(KEY_PENDING_ACTIVATION_STATUS, "") ?: ""),
      "nativeLifecycleState" to lifecycleState(context),
      "lastNativeLifecycleState" to (preferences.getString(KEY_LAST_LIFECYCLE_STATE, "") ?: ""),
      "nativeLifecycleUpdatedAt" to preferences.getLong(KEY_LIFECYCLE_UPDATED, 0L),
      "lastNativeActivationTimestamp" to preferences.getLong(KEY_LAST_ACTIVATION, 0L),
      "lastNativeError" to (preferences.getString(KEY_LAST_ERROR, "") ?: ""),
      "activeNativeIncidentId" to (preferences.getString(KEY_ACTIVE_INCIDENT, "") ?: ""),
      "nativeSosBusy" to isSosBusy(context),
      "evidenceStatus" to (preferences.getString(KEY_EVIDENCE_STATUS, "idle") ?: "idle"),
      "evidenceMode" to (preferences.getString(KEY_EVIDENCE_MODE, "") ?: ""),
      "evidenceLastError" to (preferences.getString(KEY_EVIDENCE_LAST_ERROR, "") ?: ""),
      "evidencePendingUploads" to preferences.getInt(KEY_EVIDENCE_PENDING_UPLOADS, 0),
      "cameraPermissionGranted" to (
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
          PackageManager.PERMISSION_GRANTED
        ),
      "microphonePermissionGranted" to (
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
          PackageManager.PERMISSION_GRANTED
        )
    )
  }

  private fun preferences(context: Context) =
    context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  private fun lifecycleStateLocked(preferences: android.content.SharedPreferences): String {
    val stored = preferences.getString(KEY_LIFECYCLE_STATE, "") ?: ""
    if (stored.isNotBlank()) return stored
    return when {
      !preferences.getString(KEY_ACTIVE_INCIDENT, "").isNullOrBlank() -> "active"
      !preferences.getString(KEY_PENDING_ACTIVATION, "").isNullOrBlank() -> "countdown"
      else -> "idle"
    }
  }

  private fun expirePendingActivationLocked(
    preferences: android.content.SharedPreferences,
    now: Long
  ) {
    val id = preferences.getString(KEY_PENDING_ACTIVATION, "") ?: ""
    if (id.isBlank()) return
    val createdAt = preferences.getLong(KEY_PENDING_ACTIVATION_CREATED, 0L)
    if (createdAt > 0L && now - createdAt <= PENDING_ACTIVATION_TTL_MS) return
    val current = lifecycleStateLocked(preferences)
    preferences.edit()
      .putString(KEY_PENDING_ACTIVATION, "")
      .putString(KEY_PENDING_ACTIVATION_SOURCE, "")
      .putLong(KEY_PENDING_ACTIVATION_CREATED, 0L)
      .putLong(KEY_PENDING_ACTIVATION_CONSUMED, 0L)
      .putString(KEY_PENDING_ACTIVATION_STATUS, "expired")
      .putBoolean(KEY_COUNTDOWN_ACTIVE, false)
      .putBoolean(KEY_SOS_BUSY, false)
      .putString(KEY_LAST_LIFECYCLE_STATE, current)
      .putString(KEY_LIFECYCLE_STATE, "idle")
      .putLong(KEY_LIFECYCLE_UPDATED, now)
      .commit()
  }

  private fun encryptionKey(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance("AES", "AndroidKeyStore").run {
      init(
        android.security.keystore.KeyGenParameterSpec.Builder(
          KEY_ALIAS,
          android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or
            android.security.keystore.KeyProperties.PURPOSE_DECRYPT
        )
          .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
          .build()
      )
      generateKey()
    }
  }

  private fun encrypt(value: String): String {
    if (value.isBlank()) return ""
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
    val payload = cipher.iv + cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
    return Base64.encodeToString(payload, Base64.NO_WRAP)
  }

  private fun decrypt(value: String): String {
    if (value.isBlank()) return ""
    return runCatching {
      val payload = Base64.decode(value, Base64.NO_WRAP)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), GCMParameterSpec(128, payload.copyOfRange(0, 12)))
      String(cipher.doFinal(payload.copyOfRange(12, payload.size)), StandardCharsets.UTF_8)
    }.getOrDefault("")
  }
}

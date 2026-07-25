package com.corealert.prototype

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference

/**
 * Visible, lock-screen capable boundary between the AccessibilityService and
 * camera/microphone capture. Runtime permission prompts and the evidence
 * disclosure happen here; the AccessibilityService never opens the camera.
 */
class CoreAlertEmergencyCountdownActivity : Activity() {
  private var activationId: String = ""
  private var timer: CountDownTimer? = null
  private lateinit var headingText: TextView
  private lateinit var countdownText: TextView
  private lateinit var supportingText: TextView
  private lateinit var evidenceStatusText: TextView
  private lateinit var cancelButton: Button
  private var completionHandled = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    current = WeakReference(this)
    if (!readValidActivation(intent)) {
      finish()
      return
    }
    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    setContentView(buildContent())
    val config = CoreAlertProtectionStore.config(this)
    updateEvidenceStatus()
    maybeRequestEvidencePermissions()
    startCountdown(config)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    if (!readValidActivation(intent)) {
      finish()
      return
    }
    completionHandled = false
    timer?.cancel()
    val config = CoreAlertProtectionStore.config(this)
    updateEvidenceStatus()
    maybeRequestEvidencePermissions()
    startCountdown(config)
  }

  override fun onDestroy() {
    timer?.cancel()
    timer = null
    if (current?.get() === this) current = null
    super.onDestroy()
  }

  @Deprecated("Deprecated in Android; retained for the native emergency Activity.")
  override fun onBackPressed() {
    cancelSos()
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == REQUEST_EVIDENCE_PERMISSIONS) {
      updateEvidenceStatus()
    }
  }

  private fun startCountdown(config: CoreAlertProtectionConfig) {
    val pending = CoreAlertProtectionStore.pendingActivation(this)
    if (pending?.id != activationId || pending.status != "pending") {
      finish()
      return
    }
    val elapsed = (System.currentTimeMillis() - pending.createdAt).coerceAtLeast(0L)
    val durationMs = (config.countdownSeconds * 1_000L - elapsed).coerceAtLeast(0L)
    if (durationMs == 0L) {
      completeCountdown(config)
      return
    }
    timer = object : CountDownTimer(durationMs, 250L) {
      override fun onTick(millisUntilFinished: Long) {
        val seconds = ((millisUntilFinished + 999L) / 1_000L).coerceAtLeast(1L)
        countdownText.text = seconds.toString()
      }

      override fun onFinish() {
        completeCountdown(config)
      }
    }.start()
  }

  private fun completeCountdown(config: CoreAlertProtectionConfig) {
    if (completionHandled) return
    completionHandled = true
    timer?.cancel()
    headingText.text = "SOS activated"
    countdownText.text = "✓"
    supportingText.text = "Alerting your guardians and starting live protection."
    evidenceStatusText.text = "Starting live location and emergency evidence capture…"
    cancelButton.visibility = View.GONE
    val completed = CoreAlertNativeCountdown.completeFromVisibleActivity(
      this,
      config,
      activationId
    ) {
      CoreAlertEvidenceForegroundService.startFromVisibleActivity(
        this,
        activationId,
        isDemo = config.demoMode
      )
    }
    if (!completed) {
      finish()
      return
    }
    countdownText.postDelayed({ finish() }, 1_100L)
  }

  private fun cancelSos() {
    if (completionHandled) return
    completionHandled = true
    timer?.cancel()
    CoreAlertNativeCountdown.cancel(this)
    finish()
  }

  private fun readValidActivation(sourceIntent: Intent): Boolean {
    val candidate = sourceIntent.getStringExtra(EXTRA_ACTIVATION_ID)
      ?: CoreAlertProtectionStore.pendingActivationId(this)
    val pending = CoreAlertProtectionStore.pendingActivation(this)
    if (
      candidate.isNullOrBlank() ||
      pending?.id != candidate ||
      pending.status != "pending" ||
      pending.consumedAt != null
    ) return false
    activationId = candidate
    return true
  }

  private fun maybeRequestEvidencePermissions() {
    val missing = buildList {
      if (!hasPermission(Manifest.permission.CAMERA)) add(Manifest.permission.CAMERA)
      if (!hasPermission(Manifest.permission.RECORD_AUDIO)) add(Manifest.permission.RECORD_AUDIO)
    }
    if (missing.isEmpty()) return
    val preferences = getSharedPreferences(PERMISSION_PREFERENCES, Context.MODE_PRIVATE)
    if (preferences.getBoolean(KEY_PERMISSION_PROMPTED, false)) return
    preferences.edit().putBoolean(KEY_PERMISSION_PROMPTED, true).apply()
    evidenceStatusText.postDelayed({
      if (!isFinishing && !isDestroyed) {
        requestPermissions(missing.toTypedArray(), REQUEST_EVIDENCE_PERMISSIONS)
      }
    }, 450L)
  }

  private fun updateEvidenceStatus() {
    evidenceStatusText.text = when {
      hasPermission(Manifest.permission.CAMERA) && hasPermission(Manifest.permission.RECORD_AUDIO) ->
        "Video and microphone permission ready. Recording will remain visible in Android."
      hasPermission(Manifest.permission.RECORD_AUDIO) ->
        "Microphone ready. Core Alert will record audio if the camera is unavailable."
      else ->
        "Camera or microphone permission is not ready. SOS will still activate without evidence."
    }
  }

  private fun hasPermission(permission: String): Boolean =
    ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

  private fun buildContent(): View {
    val density = resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(28), dp(48), dp(28), dp(32))
      setBackgroundColor(Color.rgb(5, 8, 17))
    }
    root.addView(TextView(this).apply {
      text = "CORE ALERT EMERGENCY SHORTCUT"
      setTextColor(Color.rgb(166, 178, 196))
      textSize = 12f
      typeface = Typeface.DEFAULT_BOLD
      letterSpacing = 0.08f
      gravity = Gravity.CENTER
    })
    headingText = TextView(this).apply {
      text = "SOS starts in"
      setTextColor(Color.WHITE)
      textSize = 26f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(0, dp(36), 0, 0)
    }
    root.addView(headingText)
    countdownText = TextView(this).apply {
      text = "—"
      setTextColor(Color.rgb(242, 61, 79))
      textSize = 88f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(0, dp(8), 0, dp(12))
    }
    root.addView(countdownText)
    supportingText = TextView(this).apply {
      text = "Linked guardians will be alerted and live location sharing will begin."
      setTextColor(Color.rgb(247, 249, 252))
      textSize = 16f
      gravity = Gravity.CENTER
      setLineSpacing(0f, 1.2f)
    }
    root.addView(supportingText, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ))
    evidenceStatusText = TextView(this).apply {
      setTextColor(Color.rgb(166, 178, 196))
      textSize = 13f
      gravity = Gravity.CENTER
      setLineSpacing(0f, 1.2f)
      setPadding(0, dp(26), 0, dp(26))
    }
    root.addView(evidenceStatusText)
    cancelButton = Button(this).apply {
      text = "CANCEL — I AM SAFE"
      setTextColor(Color.WHITE)
      textSize = 15f
      typeface = Typeface.DEFAULT_BOLD
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(16).toFloat()
        setColor(Color.rgb(17, 27, 43))
        setStroke(dp(1), Color.rgb(51, 68, 91))
      }
      setOnClickListener { cancelSos() }
    }
    root.addView(cancelButton, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      dp(56)
    ))
    root.addView(TextView(this).apply {
      text = "Evidence capture never prevents SOS activation. A persistent notification and Android camera/microphone indicators remain visible while recording."
      setTextColor(Color.rgb(166, 178, 196))
      textSize = 11f
      gravity = Gravity.CENTER
      setLineSpacing(0f, 1.25f)
      setPadding(0, dp(22), 0, 0)
    })
    return root
  }

  companion object {
    private const val EXTRA_ACTIVATION_ID = "core_alert_activation_id"
    private const val REQUEST_EVIDENCE_PERMISSIONS = 7401
    private const val PERMISSION_PREFERENCES = "core_alert_evidence_permissions"
    private const val KEY_PERMISSION_PROMPTED = "prompted"
    private var current: WeakReference<CoreAlertEmergencyCountdownActivity>? = null

    fun launch(context: Context, activationId: String): Boolean = runCatching {
      context.startActivity(
        Intent(context, CoreAlertEmergencyCountdownActivity::class.java)
          .putExtra(EXTRA_ACTIVATION_ID, activationId)
          .addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
              Intent.FLAG_ACTIVITY_CLEAR_TOP or
              Intent.FLAG_ACTIVITY_SINGLE_TOP
          )
      )
      true
    }.getOrDefault(false)

    fun finishVisible() {
      current?.get()?.let { activity ->
        activity.runOnUiThread { activity.finish() }
      }
    }
  }
}

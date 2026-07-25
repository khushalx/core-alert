package com.corealert.prototype
import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (
      event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN &&
      event.action == KeyEvent.ACTION_DOWN &&
      event.repeatCount == 0
    ) {
      val result = CoreAlertVolumeSequenceManager.recordPress(this, event.eventTime)
      if (!result.duplicate) {
        Log.d(CORE_ALERT_VOLUME_TAG, "MainActivity received volume down")
        CoreAlertVolumeEventBus.publishVolumeDown(
          event,
          captureSource = "activity",
          handledByNativeProtection = true,
          nativePressCount = result.count
        )
        if (result.triggered && !CoreAlertProtectionStore.isPracticeMode(this)) {
          CoreAlertNativeCountdown.start(this, CoreAlertProtectionStore.config(this))
        }
      }
    } else if (
      event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN &&
      event.action == KeyEvent.ACTION_DOWN &&
      BuildConfig.DEBUG
    ) {
      Log.d(
        CORE_ALERT_VOLUME_TAG,
        "MainActivity ignored repeat event repeatCount=${event.repeatCount}"
      )
    }

    // Observe the initial press without consuming it, so Android keeps normal
    // media-volume behavior even at the minimum volume.
    return super.dispatchKeyEvent(event)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    // setTheme(R.style.AppTheme);
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
  }

  override fun onResume() {
    super.onResume()
    CoreAlertProtectionStore.setActivityForeground(this, true)
  }

  override fun onPause() {
    CoreAlertProtectionStore.setActivityForeground(this, false)
    super.onPause()
  }

  override fun onDestroy() {
    CoreAlertProtectionStore.setActivityForeground(this, false)
    super.onDestroy()
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }

  companion object {
    private const val CORE_ALERT_VOLUME_TAG = "CoreAlertVolume"
  }
}

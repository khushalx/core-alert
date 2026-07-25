package com.corealert.prototype

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class CoreAlertCountdownCancelReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    CoreAlertNativeCountdown.cancel(context)
  }
}

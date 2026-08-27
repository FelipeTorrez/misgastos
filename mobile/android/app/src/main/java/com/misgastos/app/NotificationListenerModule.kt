package com.misgastos.app

import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NotificationListenerModule(private val reactCtx: ReactApplicationContext) : ReactContextBaseJavaModule(reactCtx) {
  init {
    NotificationListener.reactContext = reactCtx
  }

  override fun getName() = "NotificationListener"

  @ReactMethod
  fun hasPermission(promise: Promise) {
    try {
      val enabled = Settings.Secure.getString(reactCtx.contentResolver, "enabled_notification_listeners") ?: ""
      val pkg = reactCtx.packageName
      val has = enabled.split(":").any { it.contains(pkg) }
      promise.resolve(has)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun requestPermission(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactCtx.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR", e.message ?: "cannot open settings")
    }
  }

  @ReactMethod
  fun startListening(promise: Promise) {
    promise.resolve(null)
  }

  @ReactMethod
  fun resendActive(promise: Promise) {
    try {
      NotificationListener.instance?.resendActiveNotifications()
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR", e.message ?: "resend failed")
    }
  }

  @ReactMethod
  fun setApiUrl(url: String) {
    NotificationListener.apiUrl = url
  }

  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}
}

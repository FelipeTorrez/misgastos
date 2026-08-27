package com.misgastos.app

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class NotificationListener : NotificationListenerService() {
  companion object {
    var instance: NotificationListener? = null
    var reactContext: ReactApplicationContext? = null
    var apiUrl: String? = null

    // Filtro nativo (sin JS): solo reenvía bancos/Wallet/retail. last-segment-based (contains).
    // Match por prefijo de paquete (exacto o sub-app). p.ej. "cl.bancochile" matchea "cl.bancochile.mi_banco".
    val ALLOWLIST = listOf(
      "cl.android",                          // Banco Falabella
      "com.falabella.falabellaApp",          // Falabella retail
      "com.mercadopago.wallet",              // Mercado Pago
      "cl.bancochile",                       // Banco de Chile
      "cl.bci",                              // BCI
      "cl.santander",                        // Santander
      "cl.bancoestado",                      // BancoEstado
      "com.google.android.apps.walletnfcrel",// Google Wallet
      "com.google.android.apps.nbu.paisa",   // Google Wallet (OEM)
      "com.mach",                            // Mach
      "com.tenpo"                            // Tenpo
    )
  }

  fun resendActiveNotifications() {
    val list = try { activeNotifications } catch (_: Exception) { null } ?: return
    Log.d("NotificationListener", "resend ${list.size} active")
    for (sbn in list) onNotificationPosted(sbn)
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    Log.d("NotificationListener", "ENTRY pkg=${sbn.packageName}")
    try {
      val pkg = sbn.packageName ?: return
      if (ALLOWLIST.none { pkg.startsWith(it) }) return

      val extras = sbn.notification.extras
      val title = extras.getCharSequence("android.title")?.toString() ?: ""
      val text = extras.getCharSequence("android.text")?.toString()
        ?: extras.getCharSequence("android.bigText")?.toString() ?: ""
      if (title.isEmpty() && text.isEmpty()) return

      Log.d("NotificationListener", "captured pkg=$pkg title=$title apiUrl=$apiUrl")

      // 1) Reenvío NATIVO: funciona aunque la app esté cerrada/matada.
      apiUrl?.let { base ->
        val extId = "notif-$pkg-${sbn.id}-${sbn.postTime}"
        Thread {
          sendToBackend(base, pkg, title, text, iso(sbn.postTime), extId)
        }.start()
      }

      // 2) Emitir a JS (si la app está viva) para refrescar la UI.
      emitToJs(pkg, title, text, sbn.postTime)
    } catch (e: Exception) {
      Log.w("NotificationListener", "err: ${e.message}")
    }
  }

  // Al (re)conectar, captura las notificaciones que SIGUEN en pantalla (p.ej. tras re-activar acceso).
  override fun onListenerConnected() {
    super.onListenerConnected()
    instance = this
    Log.d("NotificationListener", "onListenerConnected apiUrl=$apiUrl")
    try {
      val base = apiUrl ?: return
      val actives = activeNotifications ?: return
      for (sbn in actives) {
        val pkg = sbn?.packageName ?: continue
        if (ALLOWLIST.none { pkg.startsWith(it) }) continue
        val extras = sbn.notification?.extras ?: continue
        val title = extras.getCharSequence("android.title")?.toString() ?: ""
        val text = extras.getCharSequence("android.text")?.toString()
          ?: extras.getCharSequence("android.bigText")?.toString() ?: ""
        if (title.isEmpty() && text.isEmpty()) continue
        Log.d("NotificationListener", "connected-capture pkg=$pkg title=$title")
        val extId = "notif-$pkg-${sbn.id}-${sbn.postTime}"
        Thread { sendToBackend(base, pkg, title, text, iso(sbn.postTime), extId) }.start()
      }
    } catch (e: Exception) {
      Log.w("NotificationListener", "connected err: ${e.message}")
    }
  }

  override fun onListenerDisconnected() {
    instance = null
    super.onListenerDisconnected()
  }

  private fun emitToJs(pkg: String, title: String, text: String, postTime: Long) {
    if (reactContext == null) return
    val map = Arguments.createMap()
    map.putString("packageName", pkg)
    map.putString("title", title)
    map.putString("text", text)
    map.putString("postedAt", iso(postTime))
    reactContext?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit("onNotificationPosted", map)
  }

  private fun iso(millis: Long): String = try {
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      java.time.Instant.ofEpochMilli(millis).toString()
    } else {
      java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
        timeZone = java.util.TimeZone.getTimeZone("UTC")
      }.format(java.util.Date(millis))
    }
  } catch (_: Exception) { java.util.Date(millis).toString() }

  private fun sendToBackend(base: String, pkg: String, title: String, text: String, postedAt: String, externalId: String) {
    try {
      val body = JSONObject().apply {
        put("raw_content", "$title $text".trim())
        put("sender", pkg)
        put("subject", title)
        put("external_id", externalId)
        put("received_at", postedAt)
      }
      val conn = (URL("$base/v1/ingestion/notification").openConnection() as HttpURLConnection)
      conn.requestMethod = "POST"
      conn.connectTimeout = 8000
      conn.readTimeout = 8000
      conn.doOutput = true
      conn.setRequestProperty("Content-Type", "application/json")
      conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
      val code = conn.responseCode
      Log.d("NotificationListener", "forwarded $pkg ext=$externalId -> HTTP $code")
      conn.disconnect()
    } catch (e: Exception) {
      Log.w("NotificationListener", "forward failed: ${e.message}")
    }
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification?) {}
}

package com.greenrhino.player

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.util.Log

/** 🆕 开机自启 + 网络变化自动重启 MediaHttpServer */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.e("GreenRhino", "📡 BootReceiver received: $action")
        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
            "greenrhino.SERVICE_BOOT" -> {
                Log.e("GreenRhino", "🚀 BootReceiver → MediaHttpServer.start()")
                MediaHttpServer.start(context)
                Log.e("GreenRhino", "✅ MediaHttpServer port=${MediaHttpServer.port}")
            }
            WifiManager.WIFI_STATE_CHANGED_ACTION,
            "android.intent.action.NETWORK_TUNNEL_STATE_CHANGED" -> {
                MediaHttpServer.stop()
                MediaHttpServer.start(context)
            }
        }
    }
}

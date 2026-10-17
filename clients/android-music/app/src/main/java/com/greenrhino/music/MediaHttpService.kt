package com.greenrhino.music

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * 🆕 MediaHttpService — Foreground Service 托管 MediaHttpServer
 * 独立进程，不受 Activity 生命周期影响。START_STICKY 保证被杀自动重启。
 * 开机自启由 BootReceiver 触发。
 */
class MediaHttpService : Service() {

    companion object {
        private const val TAG = "GreenRhino"
        private const val CHANNEL_ID = "greenrhino_media_http"
        private const val NOTIFICATION_ID = 42
        const val ACTION_START = "greenrhino.MEDIA_HTTP_SERVICE_START"
        const val ACTION_STOP = "greenrhino.MEDIA_HTTP_SERVICE_STOP"

        fun start(context: Context) {
            val intent = Intent(context, MediaHttpService::class.java)
            intent.action = ACTION_START
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context? = null) {
            if (context != null) {
                val intent = Intent(context, MediaHttpService::class.java)
                intent.action = ACTION_STOP
                context.startService(intent)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        Log.e(TAG, "✅ MediaHttpService.onCreate()")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        Log.e(TAG, "✅ MediaHttpService.onStartCommand action=$action")

        when (action) {
            ACTION_STOP -> {
                Log.e(TAG, "🛑 MediaHttpService stopping")
                MediaHttpServer.stop()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                // ACTION_START 或首次启动
                // 🆕 先 startForeground（必须 5s 内），再启动 MediaHttpServer（可能慢）
                Log.e(TAG, "✅ MediaHttpService.startForeground() first")
                startForeground(NOTIFICATION_ID, buildNotification(0, ""))
                MediaHttpServer.start(this)
                val port = MediaHttpServer.port
                val lanIp = MediaHttpServer.lanIp
                Log.e(TAG, "🚀 MediaHttpServer started port=$port — updating notification")
                // 更新通知里的真实 port/url
                startForeground(NOTIFICATION_ID, buildNotification(port, lanIp))
            }
        }
        return START_STICKY  // 🆕 被杀自动重启
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        Log.e(TAG, "🛑 MediaHttpService.onDestroy()")
        MediaHttpServer.stop()
        super.onDestroy()
    }

    // ================== 通知 ==================

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                val ch = NotificationChannel(
                    CHANNEL_ID, "绿角犀投屏服务", NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "手机上的视频通过 HTTP 分享到同网电视浏览器"
                    setShowBadge(false)
                }
                nm.createNotificationChannel(ch)
            }
        }
    }

    private fun buildNotification(port: Int, lanIp: String): Notification {
        val url = "http://$lanIp:$port/tv"
        val text = if (port > 0) {
            "电视浏览器访问 → $url"
        } else {
            "启动中…"
        }
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }
        return builder
            .setContentTitle("📺 绿角犀投屏服务运行中")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .setPriority(Notification.PRIORITY_LOW)
            .build()
    }
}

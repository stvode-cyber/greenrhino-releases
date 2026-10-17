// ScreenCaster.kt — Android MediaProjection 抓屏 → JPEG 编码 → ConcurrentLinkedQueue
// 给 MediaHttpServer /screen.mjpg 路由读帧，电视浏览器实时显示手机画面
// 不依赖 WebView / 第三方库，纯 Android API
package com.greenrhino.player

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import kotlin.math.max
import java.io.ByteArrayOutputStream
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean

object ScreenCaster {

    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private val running = AtomicBoolean(false)
    private val frames = ConcurrentLinkedQueue<ByteArray>()

    fun latestFrame(): ByteArray? = frames.peek()
    fun isRunning(): Boolean = running.get()

    fun start(context: Context, resultCode: Int, data: Intent) {
        if (running.getAndSet(true)) return
        try {
            val mpm = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
                ?: return
            projection = mpm.getMediaProjection(resultCode, data) ?: return
            projection?.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() { stop() }
            }, null)

            val dm = context.resources.displayMetrics
            val w = dm.widthPixels; val h = dm.heightPixels
            val scale = 0.5f
            val outW = max(320, (w * scale).toInt())
            val outH = max(240, (h * scale).toInt())

            imageReader = ImageReader.newInstance(outW, outH, PixelFormat.RGBA_8888, 2)
            virtualDisplay = projection?.createVirtualDisplay(
                "GreenRhinoCast", outW, outH, 160,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader?.surface, null, null
            )

            Thread({
                val output = ByteArrayOutputStream()
                val bitmap = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888)
                while (running.get()) {
                    val image = imageReader?.acquireLatestImage()
                    if (image == null) { Thread.sleep(30); continue }
                    try {
                        val planes = image.planes
                        val buf = planes[0].buffer
                        val rowStride = planes[0].rowStride
                        val pixelStride = planes[0].pixelStride
                        buf.rewind()
                        for (y in 0 until outH) {
                            val rowBytes = ByteArray(rowStride)
                            buf.position(y * rowStride); buf.get(rowBytes)
                            for (x in 0 until outW) {
                                val px = x * pixelStride
                                if (px + 3 < rowStride) {
                                    val a = rowBytes[px + 3].toInt() and 0xFF
                                    val r = rowBytes[px].toInt() and 0xFF
                                    val g = rowBytes[px + 1].toInt() and 0xFF
                                    val b = rowBytes[px + 2].toInt() and 0xFF
                                    bitmap.setPixel(x, y, (a shl 24) or (r shl 16) or (g shl 8) or b)
                                }
                            }
                        }
                        output.reset()
                        bitmap.compress(Bitmap.CompressFormat.JPEG, 55, output)
                        if (output.size() > 0) {
                            frames.offer(output.toByteArray())
                            if (frames.size > 3) frames.poll()
                        }
                    } catch (_: Exception) {} finally { image.close() }
                    Thread.sleep(80)
                }
            }, "ScreenCaster-encoder").start()
        } catch (e: Exception) {
            android.util.Log.e("GreenRhino", "ScreenCaster start FAILED: ${e.message}")
            stop()
        }
    }

    fun stop() {
        if (!running.getAndSet(false)) return
        frames.clear()
        try { virtualDisplay?.release() } catch (_: Exception) {}; virtualDisplay = null
        try { imageReader?.close() } catch (_: Exception) {}; imageReader = null
        try { projection?.stop() } catch (_: Exception) {}; projection = null
    }
}

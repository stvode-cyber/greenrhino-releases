// ScreenCaster.kt — Android MediaProjection 抓屏 → JPEG 编码 → ConcurrentLinkedQueue
// 给 MediaHttpServer /screen.mjpg 路由读帧，电视浏览器实时显示手机画面
// 不依赖 WebView / 第三方库，纯 Android API
package com.greenrhino.music

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

/**
 * 手机屏幕 → MJPEG 帧推流（电视浏览器直接 <img src="/screen.mjpg"> 就能看）
 *
 * 使用流程：
 *   1. RhinoBridge 通过 MediaProjectionManager.createScreenCaptureIntent() 起 Launcher
 *   2. 用户系统弹框点「允许」→ Launcher 回调 → ScreenCaster.start(ctx, resultCode, data)
 *   3. MediaHttpServer /screen.mjpg 路由循环读 ScreenCaster.latestFrame() 推流
 *   4. stop() 停止抓屏
 */
object ScreenCaster {

    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private val running = AtomicBoolean(false)
    private val frames = ConcurrentLinkedQueue<ByteArray>()

    /** MediaHttpServer 读最新帧（可能返回 null，消费者自己 sleep 重试） */
    fun latestFrame(): ByteArray? = frames.peek()

    fun isRunning(): Boolean = running.get()

    fun start(context: Context, resultCode: Int, data: Intent) {
        if (running.getAndSet(true)) return
        try {
            val mpm = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
                ?: return
            projection = mpm.getMediaProjection(resultCode, data) ?: return
            projection?.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    stop()
                }
            }, null)

            // 输出分辨率：原分辨率的 50%（省带宽省 CPU，手机电视距离下足够清楚）
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

            // 独立编码线程：Image → Bitmap → JPEG → frames 队列
            Thread({
                val output = ByteArrayOutputStream()
                val bitmap = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888)
                val rowBuf = ByteArray(outW * 4) // 单行 RGBA 缓冲
                var skipped = 0
                while (running.get()) {
                    val image = imageReader?.acquireLatestImage()
                    if (image == null) { Thread.sleep(30); continue }
                    try {
                        val planes = image.planes
                        val buf = planes[0].buffer
                        val rowStride = planes[0].rowStride
                        val pixelStride = planes[0].pixelStride
                        // ImageReader 可能有对齐 padding → 逐行复制避免错位
                        buf.rewind()
                        for (y in 0 until outH) {
                            val offset = y * rowStride
                            buf.position(offset)
                            // 用 ByteBuffer 包装直接读行
                            val rowBytes = ByteArray(rowStride)
                            buf.get(rowBytes)
                            // 逐像素复制到 Bitmap（忽略可能存在的 padding 字节）
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
                            if (frames.size > 3) { frames.poll() } // 只保留最近 3 帧
                        }
                        skipped = 0
                    } catch (e: Exception) { skipped++ }
                    finally { image.close() }
                    Thread.sleep(80) // ~12 fps（MJPEG 足够流畅，CPU 占用低）
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

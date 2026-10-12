// MediaHttpServer.kt — Android content:// → HTTP 代理（ServerSocket 极简实现）
// 作用：起一个绑定 0.0.0.0 的 HTTP server，让 DLNA 电视能通过 http://{lanIp}:port/stream/{id} 访问手机上的 content:// URI 媒体流
// 实现：纯 java.net.ServerSocket + 手写 HTTP/1.1 解析（零外部依赖，无 com.sun.net.httpserver）
package com.greenrhino.music

import android.content.Context
import android.net.Uri
import android.net.wifi.WifiManager
import android.util.Base64
import android.util.Log
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors

/**
 * Android 轻量 HTTP 代理 server（单例，懒启动）
 *
 * 路由：GET /stream/{base64(contentUri)}
 *   → contentResolver.openInputStream(contentUri) → chunk 输出
 *   → Content-Type / Content-Length 从 ContentResolver 查
 *   → 支持 DLNA 电视的 Range: bytes=0- 请求（Seek）
 *
 * 用法：
 *   MediaHttpServer.start(context)             // 首次起 server
 *   MediaHttpServer.publicUrlFor(contentUri)    // 给电视用的局域网 URL
 *   MediaHttpServer.stop()                      // 不需要时停
 */
object MediaHttpServer {

    private const val TAG = "GreenRhino/HTTP"
    private const val ROUTE_PREFIX = "/stream/"
    private const val CHUNK_SIZE = 64 * 1024  // 64KB
    private const val BUF_HEADER = 8192        // HTTP header 读缓冲

    private var serverSocket: ServerSocket? = null
    private var port = -1
    private var lanIp: String = ""
    private var ctx: Context? = null
    private var pool = Executors.newFixedThreadPool(4)
    @Volatile private var running = false

    @Synchronized
    fun start(context: Context) {
        if (running) return
        ctx = context.applicationContext
        try {
            serverSocket = ServerSocket().apply { bind(java.net.InetSocketAddress("0.0.0.0", 0), 4) }
            port = serverSocket!!.localPort
            lanIp = getLanIp(context)
            running = true
            // 后台 accept 循环
            Thread({ acceptLoop() }, "MediaHttpServer-accept").start()
            Log.d(TAG, "🚀 MediaHttpServer started on 0.0.0.0:$port (LAN: http://$lanIp:$port)")
        } catch (e: Exception) {
            Log.e(TAG, "❌ MediaHttpServer start FAILED: ${e.message}")
            serverSocket = null
        }
    }

    @Synchronized
    fun stop() {
        running = false
        try { serverSocket?.close() } catch (_: Exception) {}
        serverSocket = null
        port = -1
        lanIp = ""
    }

    /** 给 DLNA 电视用的局域网 URL（必须在 start() 之后调用） */
    fun publicUrlFor(contentUri: String): String {
        if (!running) {
            Log.e(TAG, "publicUrlFor called before start()")
            return ""
        }
        val encoded = Base64.encodeToString(contentUri.toByteArray(), Base64.NO_WRAP or Base64.URL_SAFE)
        return "http://$lanIp:$port${ROUTE_PREFIX}$encoded"
    }

    /** accept 循环（独立线程） */
    private fun acceptLoop() {
        val ss = serverSocket ?: return
        while (running) {
            try {
                val client = ss.accept()
                pool.execute { handleClient(client) }
            } catch (e: Exception) {
                if (running) Log.w(TAG, "accept error: ${e.message}")
            }
        }
    }

    /** 处理单个 TCP 连接：读 HTTP 请求 → 路由 → 写响应 */
    private fun handleClient(socket: Socket) {
        try {
            socket.soTimeout = 30_000
            val input = socket.getInputStream()
            val output = socket.getOutputStream()

            // 读 HTTP header（直到 \r\n\r\n）
            val reader = BufferedReader(InputStreamReader(input, "ISO-8859-1"), BUF_HEADER)
            val requestLine = reader.readLine() ?: run { socket.close(); return }
            val headers = mutableMapOf<String, String>()
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                if (line!!.isEmpty()) break
                val idx = line!!.indexOf(':')
                if (idx > 0) headers[line!!.substring(0, idx).trim().lowercase()] = line!!.substring(idx + 1).trim()
            }

            // 解析请求行：METHOD PATH HTTP/VER
            val parts = requestLine.split(" ")
            if (parts.size < 2) { sendError(output, 400, "Bad Request"); socket.close(); return }
            val method = parts[0].uppercase()
            val rawPath = parts[1]

            if (method != "GET") { sendError(output, 405, "Method Not Allowed"); socket.close(); return }
            if (!rawPath.startsWith(ROUTE_PREFIX)) { sendError(output, 404, "Not Found"); socket.close(); return }

            // 去掉 query string
            val path = rawPath.substringBefore('?')
            val encoded = path.removePrefix(ROUTE_PREFIX)
            val contentUriStr = String(Base64.decode(encoded, Base64.NO_WRAP or Base64.URL_SAFE))
            val contentUri = Uri.parse(contentUriStr)
            val cr = ctx?.contentResolver ?: run { sendError(output, 500, "No Context"); socket.close(); return }

            // Content-Type + Content-Length
            val mimeType = cr.getType(contentUri) ?: "application/octet-stream"
            val totalSize = queryContentLength(cr, contentUri)

            // Range 解析
            var startByte = 0L
            var endByte = totalSize - 1
            val rangeHeader = headers["range"]
            if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
                val rng = rangeHeader.removePrefix("bytes=").split("-", limit = 2)
                startByte = rng[0].toLongOrNull() ?: 0L
                if (rng.size == 2 && rng[1].isNotEmpty()) endByte = rng[1].toLongOrNull() ?: endByte
                if (totalSize > 0) endByte = endByte.coerceAtMost(totalSize - 1)
            }
            val contentLength = if (totalSize > 0) (endByte - startByte + 1) else 0L

            // 打开 content:// 流
            val contentInput = cr.openInputStream(contentUri)
            if (contentInput == null) { sendError(output, 500, "Cannot open content URI"); socket.close(); return }

            // Skip to range start
            if (startByte > 0) contentInput.skip(startByte)

            // 写 HTTP response header
            val isRange = rangeHeader != null && rangeHeader.startsWith("bytes=")
            val statusCode = if (isRange) 206 else 200
            val statusText = if (isRange) "Partial Content" else "OK"
            writeResponseHeader(output, statusCode, statusText, mimeType, contentLength,
                if (totalSize > 0) "bytes $startByte-$endByte/$totalSize" else null)

            // 流式输出
            val buffer = ByteArray(CHUNK_SIZE)
            var remaining = if (contentLength > 0) contentLength else Long.MAX_VALUE
            while (remaining > 0) {
                val read = contentInput.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
                if (read < 0) break
                output.write(buffer, 0, read)
                output.flush()
                remaining -= read
            }
            contentInput.close()
        } catch (e: Exception) {
            Log.e(TAG, "handleClient ERROR: ${e.message}")
        } finally {
            try { socket.close() } catch (_: Exception) {}
        }
    }

    /** 写 HTTP response header（Content-Length 模式，非 chunked） */
    private fun writeResponseHeader(
        out: OutputStream,
        status: Int,
        statusText: String,
        contentType: String,
        contentLength: Long,
        contentRange: String?   // 非 null 时写 Content-Range
    ) {
        val sb = StringBuilder()
        sb.append("HTTP/1.1 $status $statusText\r\n")
        sb.append("Content-Type: $contentType\r\n")
        sb.append("Accept-Ranges: bytes\r\n")
        sb.append("Access-Control-Allow-Origin: *\r\n")
        sb.append("Connection: close\r\n")
        if (contentLength >= 0) sb.append("Content-Length: $contentLength\r\n")
        if (contentRange != null) sb.append("Content-Range: $contentRange\r\n")
        sb.append("\r\n")
        out.write(sb.toString().toByteArray(charset("ISO-8859-1")))
        out.flush()
    }

    private fun sendError(out: OutputStream, code: Int, text: String) {
        try {
            writeResponseHeader(out, code, text, "text/plain", -1, null)
            out.write("$code $text".toByteArray())
            out.flush()
        } catch (_: Exception) {}
    }

    /** 从 WifiManager 获取手机局域网 IP（如 192.168.1.105） */
    private fun getLanIp(context: Context): String {
        return try {
            val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val ipInt = wm?.connectionInfo?.ipAddress ?: 0
            if (ipInt == 0) {
                Log.w(TAG, "getLanIp: no WifiManager IP, falling back to localhost")
                return "127.0.0.1"
            }
            val b = byteArrayOf(
                (ipInt and 0xFF).toByte(),
                ((ipInt shr 8) and 0xFF).toByte(),
                ((ipInt shr 16) and 0xFF).toByte(),
                ((ipInt shr 24) and 0xFF).toByte()
            )
            b.joinToString(".") { (it.toInt() and 0xFF).toString() }
        } catch (e: Exception) {
            Log.w(TAG, "getLanIp FAILED: ${e.message}, using localhost")
            "127.0.0.1"
        }
    }

    private fun queryContentLength(cr: android.content.ContentResolver, uri: Uri): Long {
        return try {
            cr.query(uri, arrayOf(android.provider.OpenableColumns.SIZE), null, null, null)?.use { cur ->
                if (cur.moveToFirst()) cur.getLong(cur.getColumnIndexOrThrow(android.provider.OpenableColumns.SIZE)) else -1L
            } ?: -1L
        } catch (_: Exception) { -1L }
    }
}

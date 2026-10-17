// MediaHttpServer.kt — Android content:// → HTTP 代理（ServerSocket 极简实现）
// 作用：起一个绑定 0.0.0.0 的 HTTP server，让 DLNA 电视能通过 http://{lanIp}:port/stream/{id} 访问手机上的 content:// URI 媒体流
// 实现：纯 java.net.ServerSocket + 手写 HTTP/1.1 解析（零外部依赖，无 com.sun.net.httpserver）
package com.greenrhino.player

import android.content.Context
import android.net.Uri
import android.net.wifi.WifiManager
import android.provider.MediaStore
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
 *   🆕 GET /list → 返回 Moto 上所有视频文件 JSON（MediaStore 查询 + work profile fallback）
 *   🆕 GET /tv  → 返回电视浏览器极简 HTML 播放页
 *   🆕 GET /    → 302 → /tv
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
    var port = -1
    var lanIp: String = ""
    private var ctx: Context? = null
    private var pool = Executors.newFixedThreadPool(4)
    @Volatile var running = false

    @Synchronized
    fun start(context: Context) {
        // 每次都强制关旧的再重新起——避免进程被杀后 running=true 但 serverSocket 已死
        if (running) {
            try { serverSocket?.close() } catch (_: Exception) {}
            running = false; serverSocket = null; port = -1
        }
        ctx = context.applicationContext
        try {
            serverSocket = ServerSocket().apply { bind(java.net.InetSocketAddress("0.0.0.0", 0), 4) }
            port = serverSocket!!.localPort
            lanIp = getLanIp(context)
            running = true
            Thread({ acceptLoop() }, "MediaHttpServer-accept").start()
            Log.e(TAG, "🚀 MediaHttpServer started on 0.0.0.0:$port (LAN: http://$lanIp:$port)")
        } catch (e: Exception) {
            Log.e(TAG, "❌ MediaHttpServer start FAILED: ${e.message}")
            serverSocket = null; running = false
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
            val path = rawPath.substringBefore('?')

            if (method != "GET") { sendError(output, 405, "Method Not Allowed"); socket.close(); return }

            // 🆕 屏幕镜像：/screen.mjpg → MJPEG 流（电视浏览器 <img src=...> 直接显示）
            if (path == "/screen.mjpg" || path == "/screen.mjpeg") {
                sendMjpeg(output); socket.close(); return
            }
            if (path == "/screen/status") {
                sendJson(output, """{"casting":${com.greenrhino.player.ScreenCaster.isRunning()},"port":$port}"""); socket.close(); return
            }
            // 🆕 /list — 返回 Moto 上所有视频文件（JSON）
            if (path == "/list" || path == "/list/") {
                handleList(output); socket.close(); return
            }
            // 🆕 /tv — 电视浏览器极简播放页
            if (path == "/tv" || path == "/tv/" || path == "/tv.html") {
                handleTv(output); socket.close(); return
            }
            // 🆕 / — 重定向到 /tv
            if (path == "/" || path == "") {
                sendRedirect(output, "/tv"); socket.close(); return
            }
            // 原 /stream/{base64} 路由（保留）
            if (!path.startsWith(ROUTE_PREFIX)) { sendError(output, 404, "Not Found"); socket.close(); return }
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

    /** MJPEG 推流：multipart/x-mixed-replace，浏览器原生支持 */
    private fun sendMjpeg(out: OutputStream) {
        val header = StringBuilder().apply {
            append("HTTP/1.1 200 OK\r\n")
            append("Content-Type: multipart/x-mixed-replace; boundary=frame\r\n")
            append("Cache-Control: no-cache\r\n")
            append("Connection: keep-alive\r\n")
            append("Access-Control-Allow-Origin: *\r\n")
            append("\r\n")
        }.toString()
        out.write(header.toByteArray(charset("ISO-8859-1")))
        out.flush()
        while (com.greenrhino.player.ScreenCaster.isRunning()) {
            val frame = com.greenrhino.player.ScreenCaster.latestFrame()
            if (frame != null) {
                try {
                    out.write("--frame\r\n".toByteArray())
                    out.write("Content-Type: image/jpeg\r\nContent-Length: ${frame.size}\r\n\r\n".toByteArray())
                    out.write(frame)
                    out.write("\r\n".toByteArray())
                    out.flush()
                } catch (e: Exception) { break }
            }
            Thread.sleep(60)
        }
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

    // ================== 🆕 电视浏览器路由 ==================

    /** /list — 返回 Moto 上所有视频文件 JSON（MediaStore 查询 + work profile fallback） */
    private fun handleList(out: OutputStream) {
        val videos = mutableListOf<String>()
        val cr = ctx?.contentResolver ?: run { sendJson(out, "[]"); return }
        // 主用户 + work profile 两个 URI 都查（Moto 多用户隔离）
        val uris = listOf(
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
            Uri.parse("content://media/workprofile/video/media")
        )
        for (uri in uris) {
            try {
                cr.query(uri, arrayOf(
                    MediaStore.Video.Media._ID,
                    MediaStore.Video.Media.DISPLAY_NAME,
                    MediaStore.Video.Media.TITLE
                ), null, null, "${MediaStore.Video.Media.DATE_ADDED} DESC")?.use { cur ->
                    val nameIdx = cur.getColumnIndex(MediaStore.Video.Media.DISPLAY_NAME)
                    val titleIdx = cur.getColumnIndex(MediaStore.Video.Media.TITLE)
                    val idIdx = cur.getColumnIndex(MediaStore.Video.Media._ID)
                    while (cur.moveToNext() && videos.size < 80) {
                        val id = cur.getLong(idIdx)
                        val name = (if (nameIdx >= 0) cur.getString(nameIdx)
                                    else if (titleIdx >= 0) cur.getString(titleIdx)
                                    else "video_$id") ?: "video_$id"
                        val uriStr = "$uri/$id"
                        val encoded = Base64.encodeToString(uriStr.toByteArray(), Base64.NO_WRAP or Base64.URL_SAFE)
                        val streamUrl = "/stream/$encoded"
                        val esc = name.replace("\"", "\\\"").replace("<unknown>", "")
                        videos.add("""{"name":"$esc","url":"$streamUrl"}""")
                    }
                }
            } catch (_: Exception) {}
        }
        sendJson(out, "[${videos.joinToString(",")}]")
    }

    /** /tv — 返回电视浏览器极简 HTML 播放页 */
    private fun handleTv(out: OutputStream) {
        val html = """<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>绿角犀 · 电视投屏</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#000;color:#fff;font-family:sans-serif;padding:16px}
h1{font-size:20px;margin-bottom:12px;color:#FFB03A}
#mirror{width:100%;max-height:45vh;background:#111;border-radius:12px;display:none;object-fit:contain}
#mirror.active{display:block}
#player{width:100%;max-height:55vh;background:#111;border-radius:12px}
#list{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-top:16px}
.item{background:#1a1a1a;padding:10px 12px;border-radius:8px;cursor:pointer;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid #333}
.item:hover{border-color:#FFB03A;background:#222}
#empty{color:#888;padding:32px;text-align:center}
#status{color:#666;font-size:12px;margin-top:8px}
#status.online{color:#FFB03A}
</style>
</head>
<body>
<h1>📺 绿角犀 · 电视投屏</h1>
<img id="mirror" alt="屏幕镜像"/>
<video id="player" controls playsinline></video>
<div id="status">等待手机投屏…</div>
<div id="list"><div id="empty">加载中…</div></div>
<script>
const p=document.getElementById('player'),l=document.getElementById('list'),m=document.getElementById('mirror'),s=document.getElementById('status');
fetch('/list').then(r=>r.json()).then(arr=>{
  if(!arr.length){l.innerHTML='<div id="empty">手机上没找到视频</div>';return}
  l.innerHTML='';arr.forEach(v=>{
    const d=document.createElement('div');d.className='item';d.textContent=v.name;
    d.onclick=()=>{p.src=v.url;p.play()};l.appendChild(d)
  })
}).catch(()=>{l.innerHTML='<div id="empty">加载失败，刷新试试</div>'});
setInterval(async()=>{
  try{const r=await fetch('/screen/status');const j=await r.json();
    if(j.casting){
      if(!m.classList.contains('active')){m.classList.add('active');s.textContent='📱 手机屏幕镜像中';s.classList.add('online')}
    }else{m.classList.remove('active');s.textContent='等待手机投屏…';s.classList.remove('online')}
  }catch(e){}
},2000);
m.src='/screen.mjpg';
</script>
</body></html>"""
        writeResponseHeader(out, 200, "OK", "text/html; charset=utf-8", html.length.toLong(), null)
        out.write(html.toByteArray(charset("UTF-8")))
        out.flush()
    }

    private fun sendJson(out: OutputStream, json: String) {
        writeResponseHeader(out, 200, "OK", "application/json; charset=utf-8", json.length.toLong(), null)
        out.write(json.toByteArray(charset("UTF-8")))
        out.flush()
    }

    private fun sendRedirect(out: OutputStream, location: String) {
        val sb = StringBuilder()
        sb.append("HTTP/1.1 302 Found\r\n")
        sb.append("Location: $location\r\n")
        sb.append("Content-Length: 0\r\n")
        sb.append("Connection: close\r\n\r\n")
        out.write(sb.toString().toByteArray(charset("ISO-8859-1")))
        out.flush()
    }
}

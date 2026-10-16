package com.greenrhino.music

import android.util.Log
import android.content.Context
import android.net.wifi.WifiManager
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap

/**
 * Android DLNA/UPnP 投屏控制器（Kotlin 原生实现，零第三方依赖）。
 *
 * 设计要点（对齐 Windows 侧 DlnaCaster.cs）：
 * ① SSDP UDP 多播发现局域网 MediaRenderer（智能电视/盒子）
 * ② HTTP GET 设备描述 XML → 解析 AVTransport controlURL
 * ③ SOAP POST SetAVTransportURI / Play / Pause / Stop / Seek
 *
 * 所有网络操作都有超时保护，空局域网/设备不支持不会让调用方崩溃。
 *
 * 线程约定：本类内部自己起 Thread，调用方不需要关心。
 */
class DlnaDevice(
    val id: String,        // 稳定标识 = AVTransport 控制地址
    val name: String,      // 友好名（电视型号）
    val controlUrl: String // AVTransport 服务控制地址
)

class DlnaCaster {

    private val _devices = ConcurrentHashMap<String, DlnaDevice>()
    val devices: List<DlnaDevice> get() = _devices.values.toList()

    // ---------- 播放状态轮询（GetPositionInfo SOAP 每 2.5s） ----------
    @Volatile private var pollingRunning = false
    private var pollingThread: Thread? = null
    private var pollingDeviceId: String? = null

    /** 状态回调：(transportState, position HH:MM:SS, duration HH:MM:SS) */
    var statusCallback: ((String, String, String) -> Unit)? = null

    fun get(id: String): DlnaDevice? = _devices[id]

    /**
     * SSDP 发现局域网内 DLNA MediaRenderer 设备。
     * ⚠️ 必须持 WifiManager.MulticastLock 否则 Android 丢多播包！
     */
    fun discover(context: Context, timeoutMs: Int = 4000, onResult: (List<DlnaDevice>) -> Unit) {
        Thread {
            val found = HashMap<String, DlnaDevice>()
            val deadline = System.currentTimeMillis() + maxOf(timeoutMs.toLong(), 3500L)

            // 🔶 MulticastLock：Android 默认丢多播包省电，SSDP 必须拿这个锁
            val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val multicastLock = wifi?.createMulticastLock("GreenRhino-DLNA")?.apply {
                setReferenceCounted(false)
                acquire()
            }
            Log.d("GreenRhino", "DLNA MulticastLock acquired: ${multicastLock?.isHeld}")

            try {
                // SSDP M-SEARCH 多播
                val msearch =
                    "M-SEARCH * HTTP/1.1\r\n" +
                    "HOST: 239.255.255.250:1900\r\n" +
                    "MAN: \"ssdp:discover\"\r\n" +
                    "MX: 3\r\n" +
                    "ST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n\r\n"

                DatagramSocket().use { udp ->
                    try { udp.reuseAddress = true } catch (_: Exception) {}
                    try { udp.soTimeout = 1200 } catch (_: Exception) {}
                    val sendData = msearch.toByteArray(StandardCharsets.US_ASCII)
                    try {
                        udp.send(
                            DatagramPacket(sendData, sendData.size,
                                InetAddress.getByName("239.255.255.250"), 1900)
                        )
                    } catch (e: Exception) {
                        Log.w("GreenRhino", "DLNA SSDP send failed: ${e.message}")
                        return@Thread
                    }

                    while (System.currentTimeMillis() < deadline) {
                        val buf = ByteArray(8192)
                        val pkt = DatagramPacket(buf, buf.size)
                        try {
                            udp.receive(pkt)
                            val text = String(pkt.data, 0, pkt.length, StandardCharsets.US_ASCII)
                            val location = parseHeader(text, "LOCATION")
                            if (location != null && !found.containsKey(location)) {
                                parseDevice(location)?.let { found[it.id] = it }
                            }
                        } catch (e: java.net.SocketTimeoutException) {
                            // 预期行为：SSDP MX=3，设备在 3s 内陆续响应
                        } catch (e: Exception) {
                            Log.w("GreenRhino", "DLNA SSDP recv: ${e.message}")
                        }
                    }
                }
            } finally {
                multicastLock?.release()
                Log.d("GreenRhino", "DLNA MulticastLock released")
            }

            _devices.clear()
            _devices.putAll(found)
            Log.d("GreenRhino", "DLNA discover done: ${found.size} devices")

            // 回调到主线程
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                onResult(found.values.toList())
            }
        }.start()
    }

    private fun parseHeader(text: String, key: String): String? {
        val keyUpper = key.uppercase()
        for (line in text.split("\r\n", "\n")) {
            val idx = line.indexOf(':')
            if (idx > 0 && line.substring(0, idx).trim().uppercase() == keyUpper) {
                return line.substring(idx + 1).trim()
            }
        }
        return null
    }

    private fun parseDevice(location: String): DlnaDevice? {
        return try {
            val conn = URL(location).openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 4000
            conn.readTimeout = 4000
            if (conn.responseCode != 200) return null
            val xml = conn.inputStream.bufferedReader(StandardCharsets.UTF_8).use { it.readText() }

            var friendlyName = ""
            var controlUrl = ""
            var inDevice = false
            var inService = false
            var serviceType = ""

            val factory = XmlPullParserFactory.newInstance()
            factory.isNamespaceAware = false
            val parser = factory.newPullParser()
            parser.setInput(xml.reader())
            while (parser.eventType != XmlPullParser.END_DOCUMENT) {
                when (parser.eventType) {
                    XmlPullParser.START_TAG -> {
                        when (parser.name) {
                            "device" -> inDevice = true
                            "friendlyName" -> if (inDevice) friendlyName = parser.nextText()
                            "service" -> { inService = true; serviceType = "" }
                            "serviceType" -> if (inService) serviceType = parser.nextText()
                            "controlURL" -> if (inService && serviceType.contains("AVTransport")) {
                                controlUrl = parser.nextText()
                            }
                        }
                    }
                    XmlPullParser.END_TAG -> {
                        when (parser.name) {
                            "device" -> inDevice = false
                            "service" -> inService = false
                        }
                    }
                }
                parser.next()
            }

            if (controlUrl.isBlank()) return null
            // controlURL 可能是相对路径，需要拼上 location 的 scheme + host
            val absUrl = if (controlUrl.startsWith("http://") || controlUrl.startsWith("https://")) {
                controlUrl
            } else {
                val base = URL(location)
                "${base.protocol}://${base.host}${if (base.port > 0) ":${base.port}" else ""}$controlUrl"
            }
            val id = absUrl
            val name = friendlyName.ifBlank { URL(absUrl).host }
            DlnaDevice(id, name, absUrl)
        } catch (e: Exception) {
            Log.w("GreenRhino", "DLNA parseDevice failed: ${e.message}")
            null
        }
    }

    // ---------- 播放控制（SOAP / UPnP AVTransport） ----------

    fun play(deviceId: String, mediaUri: String) {
        val d = get(deviceId) ?: return
        Thread {
            // 先 SetAVTransportURI，再 Play，然后开轮询
            val safeUri = escapeXml(mediaUri)
            soap(d.controlUrl, "SetAVTransportURI",
                "<InstanceID>0</InstanceID><CurrentURI>$safeUri</CurrentURI><CurrentURIMetadata></CurrentURIMetadata>")
            soap(d.controlUrl, "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>")
            startPolling(deviceId)
        }.start()
    }

    fun stop(deviceId: String) {
        val d = get(deviceId) ?: return
        stopPolling() // 停轮询（stop 后不再需要）
        Thread {
            soap(d.controlUrl, "Stop", "<InstanceID>0</InstanceID>")
        }.start()
    }

    fun pause(deviceId: String) {
        val d = get(deviceId) ?: return
        Thread {
            soap(d.controlUrl, "Pause", "<InstanceID>0</InstanceID>")
            // 不 stopPolling：paused 状态仍在 AVTransport 里，继续轮询
        }.start()
    }

    /** 跳转到相对时间，格式 HH:MM:SS（如 00:01:30） */
    fun seek(deviceId: String, relTime: String) {
        val d = get(deviceId) ?: return
        Thread {
            val t = escapeXml(relTime.ifBlank { "00:00:00" })
            soap(d.controlUrl, "Seek",
                "<InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>$t</Target>")
        }.start()
    }

    // ---------- SOAP 底层：返回 body 的版本 + 忽略返回的版本 ----------

    /** SOAP POST，返回响应 XML body（用于 GetPositionInfo 轮询等需要读返回值的场景） */
    private fun soapWithResponse(controlUrl: String, action: String, bodyInner: String): String? {
        return try {
            val soap =
                "<?xml version=\"1.0\"?>" +
                "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
                "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">" +
                "<s:Body>" +
                "<u:$action xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">$bodyInner</u:$action>" +
                "</s:Body></s:Envelope>"

            val conn = URL(controlUrl).openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.connectTimeout = 6000
            conn.readTimeout = 6000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "text/xml; charset=\"utf-8\"")
            conn.setRequestProperty("SOAPACTION", "\"urn:schemas-upnp-org:service:AVTransport:1#$action\"")
            conn.setRequestProperty("User-Agent", "GreenRhino/16-DLNA")
            conn.outputStream.use { it.write(soap.toByteArray(StandardCharsets.UTF_8)) }
            val code = conn.responseCode
            val body = try {
                if (code in 200..299)
                    conn.inputStream.bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
                else
                    conn.errorStream?.bufferedReader(StandardCharsets.UTF_8)?.use { it.readText() }
            } catch (_: Exception) { null }
            Log.d("GreenRhino", "DLNA SOAP $action → HTTP $code")
            body
        } catch (e: Exception) {
            Log.w("GreenRhino", "DLNA SOAP $action failed: ${e.message}")
            null
        }
    }

    /** SOAP POST，忽略返回（SetAVTransportURI/Play/Pause/Stop） */
    private fun soap(controlUrl: String, action: String, bodyInner: String) {
        soapWithResponse(controlUrl, action, bodyInner)
    }

    // ---------- GetPositionInfo 解析 + 轮询 ----------

    /** 解析 SOAP GetPositionInfo 响应 → Triple(TransportState, TrackPosition HH:MM:SS, TrackDuration HH:MM:SS) */
    private fun parsePositionInfo(xml: String): Triple<String, String, String> {
        var state = "UNKNOWN"
        var pos = "00:00:00"
        var dur = "00:00:00"
        try {
            val factory = XmlPullParserFactory.newInstance()
            factory.isNamespaceAware = false
            val parser = factory.newPullParser()
            parser.setInput(xml.reader())
            while (parser.eventType != XmlPullParser.END_DOCUMENT) {
                if (parser.eventType == XmlPullParser.START_TAG) {
                    when (parser.name) {
                        "TransportState" -> state = parser.nextText()
                        "TrackPosition" -> pos = parser.nextText()
                        "TrackDuration" -> dur = parser.nextText()
                    }
                }
                parser.next()
            }
        } catch (e: Exception) {
            // XML 解析失败 → 保留默认值
        }
        return Triple(state, pos, dur)
    }

    /** 单次 GetPositionInfo，返回 null 表示电视不支持或已断开 */
    private fun getPositionInfo(deviceId: String): Triple<String, String, String>? {
        val d = get(deviceId) ?: return null
        val xml = soapWithResponse(d.controlUrl, "GetPositionInfo",
            "<InstanceID>0</InstanceID><Channel>Master</Channel>"
        ) ?: return null
        return parsePositionInfo(xml)
    }

    /** 开始每 2.5s 轮询，推 statusCallback */
    private fun startPolling(deviceId: String) {
        stopPolling() // 先停旧的
        pollingDeviceId = deviceId
        pollingRunning = true
        pollingThread = Thread {
            while (pollingRunning) {
                val did = pollingDeviceId ?: run { stopPolling(); return@Thread }
                val info = getPositionInfo(did)
                if (info != null) {
                    val (state, pos, dur) = info
                    Log.d("GreenRhino", "DLNA poll: state=$state pos=$pos dur=$dur")
                    statusCallback?.invoke(state, pos, dur)
                } else {
                    Log.d("GreenRhino", "DLNA poll: no response, retry")
                }
                // 分帧等，响应 pollingRunning 立刻停（每 250ms 检查一次）
                var waited = 0
                while (pollingRunning && waited < 2500) {
                    Thread.sleep(250)
                    waited += 250
                }
            }
            Log.d("GreenRhino", "DLNA polling stopped")
        }
        pollingThread?.name = "DLNA-Polling-$deviceId"
        pollingThread?.isDaemon = true
        pollingThread?.start()
    }

    private fun stopPolling() {
        pollingRunning = false
        pollingThread = null
        pollingDeviceId = null
    }

    private fun escapeXml(s: String): String {
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;")
    }

    // ---------- Android Miracast 整屏镜像 ----------
    // 不同 Android 版本 Wi-Fi Display 设置入口名不同：
    //   Android 12+: Settings.ACTION_WIFI_DISPLAY_SETTINGS（公开）
    //   旧版: 隐藏常量 ACTION_WIFI_DISPLAY_SETTINGS / WifiDisplayActivity
    // 策略：先反射拿公开常量，再 fallback ComponentName 直开 Settings$WifiDisplayActivity
    fun mirror(context: Context, onResult: (ok: Boolean, msg: String) -> Unit) {
        try {
            val action = try {
                val f = android.provider.Settings::class.java.getField("ACTION_WIFI_DISPLAY_SETTINGS")
                f.get(null) as String
            } catch (_: Exception) {
                "android.settings.WIFI_DISPLAY_SETTINGS"
            }
            val intent = android.content.Intent(action)
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP)
            context.startActivity(intent)
            Log.d("GreenRhino", "DLNA mirror: ACTION=$action OK")
            onResult(true, "")
        } catch (e: Exception) {
            // Fallback: 直接 ComponentName 打开 Settings$WifiDisplayActivity
            try {
                val cn = android.content.ComponentName("com.android.settings", "com.android.settings.Settings\$WifiDisplayActivity")
                val intent = android.content.Intent()
                intent.component = cn
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                Log.d("GreenRhino", "DLNA mirror: fallback ComponentName OK")
                onResult(true, "")
            } catch (e2: Exception) {
                Log.w("GreenRhino", "DLNA mirror failed: ${e2.message}")
                onResult(false, "系统无线显示面板打开失败：${e2.message}")
            }
        }
    }
}

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
            // 先 SetAVTransportURI，再 Play
            val safeUri = escapeXml(mediaUri)
            soap(d.controlUrl, "SetAVTransportURI",
                "<InstanceID>0</InstanceID><CurrentURI>$safeUri</CurrentURI><CurrentURIMetadata></CurrentURIMetadata>")
            soap(d.controlUrl, "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>")
        }.start()
    }

    fun stop(deviceId: String) {
        val d = get(deviceId) ?: return
        Thread {
            soap(d.controlUrl, "Stop", "<InstanceID>0</InstanceID>")
        }.start()
    }

    fun pause(deviceId: String) {
        val d = get(deviceId) ?: return
        Thread {
            soap(d.controlUrl, "Pause", "<InstanceID>0</InstanceID>")
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

    private fun soap(controlUrl: String, action: String, bodyInner: String) {
        try {
            val soap =
                "<?xml version=\"1.0\"?>" +
                "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
                "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">" +
                "<s:Body>" +
                "<u:$action xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">$bodyInner</u:$action>" +
                "</s:Body></s:Envelope>"

            val conn = URL(controlUrl).openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "text/xml; charset=\"utf-8\"")
            conn.setRequestProperty("SOAPACTION", "\"urn:schemas-upnp-org:service:AVTransport:1#$action\"")
            conn.setRequestProperty("User-Agent", "GreenRhino/16-DLNA")
            conn.outputStream.use { it.write(soap.toByteArray(StandardCharsets.UTF_8)) }
            val code = conn.responseCode
            Log.d("GreenRhino", "DLNA SOAP $action → HTTP $code")
            // 不抛异常：部分设备返回 500 但仍正常播放
        } catch (e: Exception) {
            Log.w("GreenRhino", "DLNA SOAP $action failed: ${e.message}")
        }
    }

    private fun escapeXml(s: String): String {
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&apos;")
    }
}

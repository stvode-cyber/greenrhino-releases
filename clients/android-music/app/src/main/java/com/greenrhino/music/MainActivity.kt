package com.greenrhino.music

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.annotation.SuppressLint
import android.Manifest
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.MediaStore
import android.util.Log
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * 绿角犀音乐 · Android WebView 壳（路线 A）
 *
 * 设计要点：
 * 1. 全屏沉浸式（无标题栏、隐藏系统 UI）
 * 2. PWA 资源打进 APK 的 assets/pwa/ → file:///android_asset/pwa/index.html
 * 3. ES Module + importmap → WebView 全开
 * 4. 原生文件选择桥接 → WebChromeClient.onShowFileChooser
 * 5. 返回键 → 网页历史优先，再退出
 */
class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var fileChooserLauncher: androidx.activity.result.ActivityResultLauncher<Intent>

    // 🔶 后台播放：JS 端调 setPlaying(true/false) 来同步，onPause 时据此决定是否暂停 WebView
    @Volatile private var isPlaying = false
    private val wakeLock by lazy {
        (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK, "GreenRhinoMusic:Playback"
        ).apply { setReferenceCounted(false) }
    }

    // 🔶 DLNA 投屏：单例 DlnaCaster（SSDP 发现 + SOAP AVTransport 控制）
    private val dlnaCaster = DlnaCaster()

    // 🔶 RhinoBridge 实例（同时用于 WebView 注册 + Debug BroadcastReceiver）
    private val rhinoBridge = RhinoBridge()

    // 🔶 ISS-20261009-018: Music App 也需要 MediaStore.Audio 扫描！
    // 之前只有 Player 版有 MediaStore 扫描逻辑，Music 版完全是空壳 → 自动扫描按钮静默失败
    private val mediaPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { perms ->
        val granted = perms.values.any { it }
        Toast.makeText(this, if (granted) "权限已授予，扫描音频中..." else "权限被拒绝", Toast.LENGTH_SHORT).show()
        if (granted) scanMediaStore()
        else webView.evaluateJavascript(
            "if(window.__mediaImported) window.__mediaImported([], 'permission_denied')", null
        )
    }


    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.e("GreenRhino", "🟢 MainActivity.onCreate CALLED! pid=${android.os.Process.myPid()} user=${android.os.Process.myUserHandle()}")

        // 沉浸式全屏
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        // 容器
        val container = FrameLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(getColor(R.color.splash_background))
        }

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        container.addView(webView)
        setContentView(container)

        // 🔶 预启动 MediaHttpServer（content:// → HTTP 代理），让 DLNA 电视能拉到局域网流
        MediaHttpServer.start(this)
        // 🔶 Debug BroadcastReceiver: adb shell am broadcast -a greenrhino.CAST_SCAN / CAST_PLAY / CAST_STOP
        setupDebugReceiver()
        setupWebView()
        // 🔶 WebView 缓存铁律：禁用所有缓存，每次加载都加版本戳强制刷新
        webView.settings.cacheMode = WebSettings.LOAD_NO_CACHE
        webView.clearCache(true)
        // 🔶 云同步：通过 URL 参数告诉前端本机局域网后端地址（优先级 2，见 cloud.js getCloudBase()）
        // 换网络后 IP 会变，改这一行即可。默认 192.168.1.132 是当前开发机
        val cloudBase = "http://192.168.1.132:8787"
        webView.loadUrl("file:///android_asset/pwa/index.html?v=16.${System.currentTimeMillis()}&cloud=$cloudBase")
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true
            mediaPlaybackRequiresUserGesture = false
            loadsImagesAutomatically = true
            useWideViewPort = true
            loadWithOverviewMode = true
            userAgentString = "${userAgentString} GreenRhino/16"
            cacheMode = WebSettings.LOAD_DEFAULT
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url.toString()
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    if (!url.contains("android_asset")) {
                        Log.d("GreenRhino", "External URL intercepted: $url")
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        return true
                    }
                }
                return false
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: android.webkit.WebResourceError?
            ) {
                Log.e("GreenRhino", "onReceivedError: ${request?.url} → ${error?.description} (code=${error?.errorCode})")
                super.onReceivedError(view, request, error)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // 🔶 ISS-001 已修复：RhinoBridge.getLyric 暴露正常，返回 1088 chars LRC（周杰伦-晴天）
                // 保留这条方法列表探针（单次 evaluateJavascript，不触发秒退），方便后续新增 @JavascriptInterface 方法时验证
                view?.evaluateJavascript(
                    "(function(){" +
                    "var r=window.RhinoBridge;" +
                    "var keys=[];if(r){for(var m in r){keys.push(m);}}" +
                    "var out={" +
                    "role:window.__winRole," +
                    "rbExists:!!r," +
                    "rbKeys:keys," +
                    "getLyricType:typeof(r&&r.getLyric)," +
                    "castScanType:typeof(r&&r.castScan)" +
                    "};" +
                    "return JSON.stringify(out);" +
                    "})()"
                ) { result ->
                    Log.d("GreenRhino", "🔧 RB PROBE: $result")
                }
            }
        }

// 🔶 ISS-20261009-017: 现代 ActivityResultLauncher（替代废弃的 startActivityForResult）
        fileChooserLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val uris = mutableListOf<Uri>()
            if (result.resultCode == RESULT_OK) {
                result.data?.data?.let { uris.add(it) }
                result.data?.clipData?.let { clip ->
                    for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri)
                }
            }
            filePathCallback?.onReceiveValue(uris.toTypedArray())
            filePathCallback = null
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                if (consoleMessage != null) {
                    val tag = "GreenRhino/JS"
                    val msg = "[${consoleMessage.lineNumber()}] ${consoleMessage.message()}"
                    when (consoleMessage.messageLevel()) {
                        ConsoleMessage.MessageLevel.ERROR -> Log.e(tag, msg)
                        ConsoleMessage.MessageLevel.WARNING -> Log.w(tag, msg)
                        ConsoleMessage.MessageLevel.DEBUG -> Log.d(tag, msg)
                        ConsoleMessage.MessageLevel.LOG -> Log.i(tag, msg)
                        else -> Log.d(tag, msg)
                    }
                }
                return true
            }

            override fun onShowFileChooser(
                webView: WebView,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                // 🔶 诊断：WebView 实际传了什么 acceptTypes
                val rawAccept = params?.acceptTypes?.joinToString(",") ?: "(null)"
                val mode = params?.mode ?: 0  // 0=open 1=open_multiple
                Log.d("GreenRhino", "onShowFileChooser acceptTypes=[$rawAccept] mode=$mode title=${params?.title}")

                // 🔶 强制构建严格的音乐 SAF Intent —— 绕开 params.createIntent() 的松散类型
                val acceptTypes = params?.acceptTypes
                val wantAudioOnly = acceptTypes != null && acceptTypes.any {
                    it == "audio/*" || it.equals("audio", ignoreCase = true)
                }
                val wantVideoOnly = acceptTypes != null && acceptTypes.any {
                    it == "video/*" || it.equals("video", ignoreCase = true)
                }

                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    // 默认 type + 精确 MIME 列表，让 SAF 自动锁定到对应 tab
                    when {
                        wantAudioOnly -> {
                            type = "audio/*"
                            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(
                                "audio/mpeg", "audio/mp3", "audio/flac", "audio/wav",
                                "audio/mp4", "audio/aac", "audio/ogg", "audio/opus",
                                "audio/x-ms-wma", "audio/x-mp3", "audio/x-aiff",
                                "audio/aacp", "audio/mp1", "audio/mp2", "audio/m4a"
                            ))
                            Log.d("GreenRhino", "SAF 严格锁定 audio-only MIME 列表")
                        }
                        wantVideoOnly -> {
                            type = "video/*"
                            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(
                                "video/mp4", "video/x-matroska", "video/webm", "video/quicktime",
                                "video/x-msvideo", "video/mp2t", "video/3gpp", "video/x-ms-wmv"
                            ))
                            Log.d("GreenRhino", "SAF 严格锁定 video-only MIME 列表")
                        }
                        else -> {
                            putExtras(params?.createIntent()?.extras ?: Bundle())
                            type = when {
                                acceptTypes?.contains("image/*") == true -> "image/*"
                                acceptTypes?.contains("video/*") == true -> "video/*"
                                else -> "*/*"
                            }
                            Log.d("GreenRhino", "SAF 兜底 type=$type")
                        }
                    }
                }
                try {
                    fileChooserLauncher.launch(intent)
                } catch (e: Exception) {
                    Log.e("GreenRhino", "SAF launch failed: ${e.message}", e)
                    filePathCallback = null
                    return false
                }
                return true
            }

            override fun onReceivedTitle(view: WebView?, title: String?) {
                super.onReceivedTitle(view, title)
                setTitle(title)
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(
                (0 != applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)
            )
        }

        // ⚠️ 必须用 inner class！匿名 object 上的 @JavascriptInterface 在 targetSdk 34+ 某些设备不生效
        webView.addJavascriptInterface(rhinoBridge, "RhinoBridge")
        Log.d("GreenRhino", "RhinoBridge registered OK (music)")
        // 🔶 DEC-20261009-002: 彻底砍掉自动扫描——用户必须手动点工具栏「📥 自动扫描」或「📁 选择文件」导入
        // 不再有任何 postDelayed / SharedPreferences 标记 / 首次启动自动触发
    }

    

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    override fun onPause() {
        super.onPause()
        // 🔶 后台播放关键：在播时不暂停 WebView（pauseTimers 全删，onPause 也跳过）
        // HTML5 audio 需要 JS 定时器驱动播放事件，pauseTimers 会一刀切停掉
        if (isPlaying) {
            Log.d("GreenRhino", "onPause: isPlaying=true → keep WebView alive for background playback")
            // PARTIAL_WAKE_LOCK 防止 CPU 休眠导致播放卡死
            if (!wakeLock.isHeld) wakeLock.acquire(30 * 60 * 1000L) // 30min 兜底
        } else {
            webView.onPause()
        }
    }

    override fun onResume() {
        super.onResume()
        // 🔶 ISS-20261009-019: 必须先检查 isHeld 再 release！
        // onPause 时若 isPlaying=false 不会 acquire，onResume 直接 release 会抛
        // "WakeLock under-locked" RuntimeException 导致 App 崩溃
        if (wakeLock.isHeld) wakeLock.release()
        if (!isPlaying) webView.onResume()
    }

    override fun onDestroy() {
        MediaHttpServer.stop()
        try { unregisterReceiver(debugReceiver) } catch (_: Exception) {}
        webView.stopLoading()
        webView.removeAllViews()
        webView.destroy()
        super.onDestroy()
    }

    // 🔶 Debug-only broadcast receiver for testing DLNA via adb shell
    // Moto 铁律：Log.d 被彻底屏蔽 → 入口日志必须用 Log.e（Error 级别能漏出来）
    private var debugReceiver: BroadcastReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            val action = intent.action ?: ""
            Log.e("GreenRhino", "📺 [DEBUG] BroadcastReceiver onReceive: $action")
            when (action) {
                "greenrhino.CAST_SCAN" -> {
                    Log.e("GreenRhino", "📺 [DEBUG] CAST_SCAN → rhinoBridge.castScan()")
                    rhinoBridge.castScan()
                }
                "greenrhino.CAST_PLAY" -> {
                    val deviceId = intent.getStringExtra("deviceId") ?: ""
                    val uri = intent.getStringExtra("uri") ?: ""
                    Log.e("GreenRhino", "📺 [DEBUG] CAST_PLAY device=$deviceId uri=$uri")
                    rhinoBridge.castPlay(deviceId, uri)
                }
                "greenrhino.CAST_STOP" -> {
                    val deviceId = intent.getStringExtra("deviceId") ?: ""
                    Log.e("GreenRhino", "📺 [DEBUG] CAST_STOP device=$deviceId")
                    rhinoBridge.castStop(deviceId)
                }
                "greenrhino.CAST_MIRROR" -> {
                    Log.e("GreenRhino", "📺 [DEBUG] CAST_MIRROR → rhinoBridge.castMirror()")
                    rhinoBridge.castMirror()
                }
                "greenrhino.MEDIA_HTTP_TEST" -> {
                    val uri = intent.getStringExtra("uri") ?: "content://media/external/audio/media/1000028670"
                    MediaHttpServer.start(ctx)
                    Log.e("GreenRhino", "📺 [DEBUG] MEDIA_HTTP_TEST url=${MediaHttpServer.publicUrlFor(uri)}")
                }
                "greenrhino.CLOUD_SYNC" -> {
                    Log.e("GreenRhino", "☁️ [DEBUG] CLOUD_SYNC → trigger window.__GR_SYNC.syncAll()")
                    webView.evaluateJavascript(
                        "(async()=>{" +
                        "try{" +
                        "const g=window.__GR_SYNC;" +
                        "const s=g?.loadSession?.();" +
                        "console.error('[cloud] eval CLOUD_BASE:', g?.CLOUD_BASE);" +
                        "console.error('[cloud] eval session:', JSON.stringify(s)); " +
                        "const r=await g?.syncAll?.();" +
                        "console.error('[cloud] syncAll DONE:', JSON.stringify(r).slice(0,300));" +
                        "}catch(e){console.error('[cloud] syncAll FAIL:', e.message, e.stack?.slice(0,200));}" +
                        "})()",
                        null
                    )
                }
            }
        }
    }

    private fun setupDebugReceiver() {
        val filter = IntentFilter().apply {
            addAction("greenrhino.CAST_SCAN")
            addAction("greenrhino.CAST_PLAY")
            addAction("greenrhino.CAST_STOP")
            addAction("greenrhino.CAST_MIRROR")
            addAction("greenrhino.MEDIA_HTTP_TEST")
            addAction("greenrhino.CLOUD_SYNC")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // 🔶 Android 13+ 必须显式 EXPORTED，否则 adb shell broadcast 收不到
            registerReceiver(debugReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            registerReceiver(debugReceiver, filter)
        }
        Log.e("GreenRhino", "📺 [DEBUG] BroadcastReceiver registered. Actions: CAST_SCAN/PLAY/STOP/MIRROR + MEDIA_HTTP + CLOUD_SYNC")
    }

    // 🔶 ISS-20261009-018: Music App 完整 MediaStore.Audio 扫描（之前缺失）
    // 与 Player 版 scanMediaStore() 结构相同，但：
    //   - 查 MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
    //   - MIN_SIZE = 1MB（音频普遍比视频小得多）
    //   - Audio 表有 ARTIST / ALBUM 列，一起查出来
    private fun scanMediaStore() {
        Thread {
            val audios = JSONArray()
            try {
                val proj = arrayOf(
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.DISPLAY_NAME,
                    MediaStore.Audio.Media.DURATION,
                    MediaStore.Audio.Media.SIZE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM
                )
                // 音频 MIN_SIZE 设 1MB（视频是 500MB），过滤掉录音/短提示音
                val minSize = 1L * 1024L * 1024L
                val selection = "${MediaStore.Audio.Media.SIZE} >= ?"
                val selectionArgs = arrayOf(minSize.toString())
                val sort = "${MediaStore.Audio.Media.DATE_ADDED} DESC"
                contentResolver.query(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                    proj, selection, selectionArgs, sort
                )?.use { cur ->
                    val idxId = cur.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                    val idxName = cur.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
                    val idxDur = cur.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
                    val idxSize = cur.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
                    val idxArtist = cur.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
                    val idxAlbum = cur.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
                    while (cur.moveToNext()) {
                        val id = cur.getLong(idxId)
                        val name = cur.getString(idxName) ?: "audio_$id"
                        val dur = cur.getLong(idxDur)
                        val size = cur.getLong(idxSize)
                        var artist = cur.getString(idxArtist) ?: ""
                        var album = cur.getString(idxAlbum) ?: ""
                        // 🔶 ISS-20261016-010: MediaStore 对无 TAG 文件返回字面量 "<unknown>"（不是 null）
                        // Kotlin cur.getString() 拿到的是字符串 "<unknown>" 而非 null
                        // ?: "" 兜底只对 null 生效，所以要显式清洗 ROM 级占位符
                        if (artist.equals("<unknown>", ignoreCase = true) || artist.equals("Unknown Artist", ignoreCase = true)) artist = ""
                        if (album.equals("<unknown>", ignoreCase = true) || album.equals("Unknown Album", ignoreCase = true)) album = ""
                        val uri = Uri.parse("${MediaStore.Audio.Media.EXTERNAL_CONTENT_URI}/$id")
                        // 文件系统存在性校验（MediaStore 可能有僵尸条目）
                        val fd = try { contentResolver.openFileDescriptor(uri, "r") } catch (_: Exception) { null }
                        if (fd == null) { continue }
                        try { fd.close() } catch (_: Exception) {}
                        val obj = org.json.JSONObject().apply {
                            put("id", id); put("name", name); put("uri", uri.toString())
                            put("duration", dur); put("size", size)
                            put("artist", artist); put("album", album)
                        }
                        audios.put(obj)
                    }
                }
            } catch (e: Exception) {
                Log.e("GreenRhino", "scanMediaStore(audio) EXCEPTION: ${e.message}", e)
            }
            Log.d("GreenRhino", "scanMediaStore(audio): FINISHED count=${audios.length()}")
            runOnUiThread {
                val batchSize = 50
                var idx = 0
                while (idx < audios.length()) {
                    val end = minOf(idx + batchSize, audios.length())
                    val batch = JSONArray()
                    for (i in idx until end) batch.put(audios.getJSONObject(i))
                    val js = "if(window.__mediaBatch) window.__mediaBatch(${batch})"
                    webView.evaluateJavascript(js, null)
                    idx = end
                }
                webView.evaluateJavascript(
                    "if(window.__mediaImported) window.__mediaImported([], 'ok')", null
                )
            }
        }.start()
    }

    private fun requestMediaPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            mediaPermissionLauncher.launch(arrayOf(Manifest.permission.READ_MEDIA_AUDIO))
        } else {
            mediaPermissionLauncher.launch(arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE))
        }
    }

    // ⚠️ inner class！匿名 object 的 @JavascriptInterface 在 targetSdk 34+ 某些设备不生效
    inner class RhinoBridge {
        @android.webkit.JavascriptInterface
        fun toggleFullscreen() {
            Log.d("GreenRhino", "RhinoBridge.toggleFullscreen()")
            runOnUiThread {
                val wic = WindowInsetsControllerCompat(window, window.decorView)
                if (wic.isAppearanceLightStatusBars) {
                    wic.hide(WindowInsetsCompat.Type.systemBars())
                } else {
                    wic.show(WindowInsetsCompat.Type.systemBars())
                }
            }
        }

        // 🔶 后台播放：JS 端 player.play()/pause() 时主动上报状态
        // 存到 @Volatile var isPlaying，供 onPause() 同步读取
        @android.webkit.JavascriptInterface
        fun setPlaying(playing: Boolean) {
            isPlaying = playing
            Log.d("GreenRhino", "RhinoBridge.setPlaying($playing)")
            if (playing && !wakeLock.isHeld) wakeLock.acquire(30 * 60 * 1000L)
            else if (!playing && wakeLock.isHeld) wakeLock.release()
        }

        @android.webkit.JavascriptInterface
        fun requestAutoImport() {
            Log.d("GreenRhino", "RhinoBridge.requestAutoImport() (music → audio scan)")
            runOnUiThread { requestMediaPermission() }
        }

        @android.webkit.JavascriptInterface
        fun lookupMediaUri(name: String, size: Long): String {
            // 🔶 ISS-20261009-018: Music 版查 MediaStore.Audio 表
            val sel = "${MediaStore.Audio.Media.DISPLAY_NAME} = ? AND ${MediaStore.Audio.Media.SIZE} = ?"
            val selArgs = arrayOf(name, size.toString())
            val proj = arrayOf(MediaStore.Audio.Media._ID, MediaStore.Audio.Media.DURATION)
            try {
                contentResolver.query(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                    proj, sel, selArgs, null
                )?.use { cur ->
                    if (cur.moveToFirst()) {
                        val idIdx = cur.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                        val durIdx = cur.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
                        val id = cur.getLong(idIdx)
                        val dur = cur.getLong(durIdx)
                        if (dur > 0) {
                            val uri = "${MediaStore.Audio.Media.EXTERNAL_CONTENT_URI}/$id"
                            Log.d("GreenRhino", "lookupMediaUri(audio): name=$name → $uri (dur=$dur)")
                            return uri
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e("GreenRhino", "lookupMediaUri(audio) EXCEPTION: ${e.message}")
            }
            return ""
        }

        // 🔶 Android 本地歌词代理：双源聚合 LRCLIB（国际） + 歌词迷 gecimi（国内兜底）
        // 避免 WebView 直接请求 lrclib.net 被跨域/国内网络拦截
        @android.webkit.JavascriptInterface
        fun getLyric(title: String, artist: String): String {
            if (title.isBlank()) return ""
            Log.d("GreenRhino", "🎤 getLyric(title=$title, artist=$artist)")
            // 在后台线程执行网络请求（@JavascriptInterface 不阻塞 JS 调用线程）
            val result = java.util.concurrent.CompletableFuture<String>()
            Thread {
                try {
                    // ① LRCLIB（开源，时间轴完整）
                    val lrc = fetchLrclib(title, artist)
                    if (lrc.isNotBlank()) {
                        Log.d("GreenRhino", "✅ getLyric: LRCLIB hit (${lrc.length} chars)")
                        result.complete(lrc.trim())
                        return@Thread
                    }
                    // ② 歌词迷 gecimi（国内兜底）
                    val lrc2 = fetchGecimi(title, artist)
                    if (lrc2.isNotBlank()) {
                        Log.d("GreenRhino", "✅ getLyric: gecimi hit (${lrc2.length} chars)")
                        result.complete(lrc2.trim())
                        return@Thread
                    }
                    Log.d("GreenRhino", "❌ getLyric: both sources missed for '$title'")
                    result.complete("")
                } catch (e: Exception) {
                    Log.e("GreenRhino", "❌ getLyric EXCEPTION: ${e.message}")
                    result.complete("")
                }
            }.start()
            val ret = try { result.get(8, java.util.concurrent.TimeUnit.SECONDS) } catch (e: Exception) { "" }
            Log.d("GreenRhino", "🎤 getLyric returning ${if (ret.isBlank()) "EMPTY" else "${ret.length} chars"}")
            return ret
        }

        private fun fetchLrclib(title: String, artist: String): String {
            return try {
                val q = StringBuilder("https://lrclib.net/api/search?track_name=")
                q.append(URLEncoder.encode(title, "UTF-8"))
                if (artist.isNotBlank()) q.append("&artist_name=").append(URLEncoder.encode(artist, "UTF-8"))
                val arr = httpGetJsonArray(q.toString()) ?: return ""
                for (i in 0 until arr.length()) {
                    val it = arr.getJSONObject(i)
                    val synced = it.optString("syncedLyrics", "")
                    if (synced.isNotBlank()) return synced
                    val plain = it.optString("plainLyrics", "")
                    if (plain.isNotBlank()) return plain
                }
                ""
            } catch (e: Exception) { "" }
        }

        private fun fetchGecimi(title: String, artist: String): String {
            return try {
                val u = StringBuilder("http://gecimi.com/api/lyric/").append(URLEncoder.encode(title, "UTF-8"))
                if (artist.isNotBlank()) u.append("/").append(URLEncoder.encode(artist, "UTF-8"))
                val root = httpGetJsonObject(u.toString()) ?: return ""
                val arr = root.optJSONArray("result") ?: return ""
                for (i in 0 until arr.length()) {
                    val it = arr.getJSONObject(i)
                    val lrcUrl = it.optString("lrc", "")
                    if (lrcUrl.isNotBlank()) {
                        val content = httpGetText(lrcUrl)
                        if (content.isNotBlank()) return content
                    }
                }
                ""
            } catch (e: Exception) { "" }
        }

        private fun httpGetText(urlStr: String): String {
            return try {
                val conn = URL(urlStr).openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.connectTimeout = 6000
                conn.readTimeout = 6000
                conn.setRequestProperty("User-Agent", "GreenRhino/16")
                if (conn.responseCode != 200) return ""
                val bytes = conn.inputStream.readBytes()
                // 尝试 UTF-8，有乱码 fallback GBK
                val s = String(bytes, StandardCharsets.UTF_8)
                if (s.contains('\uFFFD')) {
                    try { return String(bytes, java.nio.charset.Charset.forName("GBK")) } catch (_: Exception) {}
                }
                s
            } catch (e: Exception) { "" }
        }

        private fun httpGetJsonArray(urlStr: String): JSONArray? {
            val txt = httpGetText(urlStr)
            if (txt.isBlank()) return null
            return try { JSONArray(txt) } catch (e: Exception) { null }
        }

        private fun httpGetJsonObject(urlStr: String): JSONObject? {
            val txt = httpGetText(urlStr)
            if (txt.isBlank()) return null
            return try { JSONObject(txt) } catch (e: Exception) { null }
        }

        // ========== 🆕 DLNA 投屏桥接（前端 cast.js 调用） ==========
        // 设计：@JavascriptInterface 必须同步返回，扫描是异步的
        //   → castScan() 立即返回 void，扫描完成后通过 evaluateJavascript
        //     回调前端 window.__castCb(JSON) 把设备列表推过去
        //   → castPlay/castStop/castPause 也是 void，立即返回，内部起线程执行 SOAP

        @android.webkit.JavascriptInterface
        fun castScan() {
            Log.d("GreenRhino", "📺 castScan() called")
            dlnaCaster.discover(this@MainActivity) { devices ->
                val arr = JSONArray()
                for (d in devices) {
                    arr.put(JSONObject().apply {
                        put("id", d.id)
                        put("name", d.name)
                        put("controlUrl", d.controlUrl)
                    })
                }
                val json = arr.toString()
                runOnUiThread {
                    // ISS-004: 这条是用户触发的，不是 onPageFinished，所以安全
                    webView.evaluateJavascript(
                        "if(window.__castCb)window.__castCb({type:'cast:devices',devices:$json})", null
                    )
                }
            }
        }

        /** 对指定 DLNA 设备播放媒体。uri 必须是局域网可访问的 http(s):// URL */
        @android.webkit.JavascriptInterface
        fun castPlay(deviceId: String, anyUri: String) {
            Log.d("GreenRhino", "📺 castPlay(device=$deviceId, uri=$anyUri)")
            if (deviceId.isBlank() || anyUri.isBlank()) {
                Log.w("GreenRhino", "castPlay: deviceId or uri blank, abort")
                return
            }
            // 🔶 content:// → HTTP 代理（DLNA 电视需要 http(s)://）
            val httpUri = when {
                anyUri.startsWith("http://") || anyUri.startsWith("https://") -> anyUri
                anyUri.startsWith("content://") -> {
                    // 起 MediaHttpServer（零依赖 HttpServer，绑定 0.0.0.0）
                    MediaHttpServer.start(this@MainActivity)
                    val url = MediaHttpServer.publicUrlFor(anyUri)
                    Log.d("GreenRhino", "📺 content:// → proxy: $url")
                    url
                }
                else -> {
                    Log.w("GreenRhino", "castPlay: unsupported uri scheme: $anyUri")
                    return
                }
            }
            dlnaCaster.statusCallback = { state, pos, dur ->
                runOnUiThread {
                    val js = "if(window.__castCb)window.__castCb({type:'cast:status',state:'$state',position:'$pos',duration:'$dur',deviceId:'$deviceId'})"
                    webView.evaluateJavascript(js, null)
                }
            }
            dlnaCaster.play(deviceId, httpUri)
        }

        @android.webkit.JavascriptInterface
        fun castStop(deviceId: String) {
            Log.d("GreenRhino", "📺 castStop(device=$deviceId)")
            dlnaCaster.stop(deviceId)
        }

        @android.webkit.JavascriptInterface
        fun castPause(deviceId: String) {
            Log.d("GreenRhino", "📺 castPause(device=$deviceId)")
            dlnaCaster.pause(deviceId)
        }

        /** 唤起系统 Miracast 无线显示面板（整屏镜像） */
        @android.webkit.JavascriptInterface
        fun castMirror() {
            Log.d("GreenRhino", "📺 castMirror() called")
            dlnaCaster.mirror(this@MainActivity) { ok, msg ->
                runOnUiThread {
                    val js = if (ok) {
                        "if(window.__castCb)window.__castCb({type:'cast:mirror',ok:true})"
                    } else {
                        val safe = msg.replace("'", "\\'")
                        "if(window.__castCb)window.__castCb({type:'cast:mirror',ok:false,msg:'$safe'})"
                    }
                    webView.evaluateJavascript(js, null)
                }
            }
        }
    }
}






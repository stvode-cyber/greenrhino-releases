package com.greenrhino.music

import android.annotation.SuppressLint
import android.Manifest
import android.content.Intent
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

        setupWebView()
        // 🔶 WebView 缓存铁律：禁用所有缓存，每次加载都加版本戳强制刷新
        webView.settings.cacheMode = WebSettings.LOAD_NO_CACHE
        webView.clearCache(true)
        webView.loadUrl("file:///android_asset/pwa/index.html?v=16.${System.currentTimeMillis()}")
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
                    val level = when (consoleMessage.messageLevel()) {
                        ConsoleMessage.MessageLevel.ERROR -> "E"
                        ConsoleMessage.MessageLevel.WARNING -> "W"
                        ConsoleMessage.MessageLevel.DEBUG -> "D"
                        else -> "D"
                    }
                    Log.println(
                        level[0].code,
                        "GreenRhino/JS",
                        "[${consoleMessage.lineNumber()}] ${consoleMessage.message()}"
                    )
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
        webView.addJavascriptInterface(RhinoBridge(), "RhinoBridge")
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
        webView.stopLoading()
        webView.removeAllViews()
        webView.destroy()
        super.onDestroy()
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
                        val artist = cur.getString(idxArtist) ?: ""
                        val album = cur.getString(idxAlbum) ?: ""
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
    }
}






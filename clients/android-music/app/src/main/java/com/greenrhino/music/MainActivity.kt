package com.greenrhino.music

import android.annotation.SuppressLint
import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
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
        webView.loadUrl("file:///android_asset/pwa/index.html")
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
                val intent: Intent? = params?.createIntent()
                try {
                    intent?.let {
                        it.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                        it.addCategory(Intent.CATEGORY_OPENABLE)
                        // 🔶 ISS-20261009-017：music role 只允许音频，展开 audio/* → 具体 MIME
                        val acceptTypes = params?.acceptTypes
                        if (acceptTypes != null && acceptTypes.any { it == "audio/*" }) {
                            it.type = "*/*"
                            it.putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(
                                "audio/mpeg", "audio/mp3", "audio/flac", "audio/wav",
                                "audio/mp4", "audio/aac", "audio/ogg", "audio/opus",
                                "audio/x-ms-wma", "audio/x-mp3", "audio/itt", "audio/x-aiff"
                            ))
                        }
                        fileChooserLauncher.launch(it)
                    } ?: run { filePathCallback = null; return false }
                } catch (e: Exception) {
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
        webView.onPause()
        webView.pauseTimers()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
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






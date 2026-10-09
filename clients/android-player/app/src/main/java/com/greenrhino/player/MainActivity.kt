package com.greenrhino.player

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONArray

/**
 * 绿角犀播放器 · Android WebView 壳（路线 A）
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
    private lateinit var container: FrameLayout
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private val FILE_CHOOSER_REQUEST = 1001
    private var immersive = false  // 🔶 初始非沉浸式（toggle 切换：false→true=进入全屏）

    // 🔶 MediaStore 自动扫描：权限请求 + 全盘查询
    private val mediaPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { perms ->
        val granted = perms.values.any { it }
        Toast.makeText(this, if (granted) "权限已授予，扫描视频中..." else "权限被拒绝", Toast.LENGTH_SHORT).show()
        if (granted) scanMediaStore()
        else webView.evaluateJavascript(
            "if(window.__mediaImported) window.__mediaImported([], 'permission_denied')", null
        )
    }

    private fun scanMediaStore() {
        Thread {
            val videos = JSONArray()
            try {
                val proj = arrayOf(
                    MediaStore.Video.Media._ID,
                    MediaStore.Video.Media.DISPLAY_NAME,
                    MediaStore.Video.Media.DURATION,
                    MediaStore.Video.Media.SIZE
                )
                // 🔶 ISS-20261009-002：只扫 800MB 以上的大视频（小视频如微信/抖音缓存让用户手动导入）
                // Kotlin 里 Long 字面量 L 后缀：800 * 1024 * 1024 = 838860800
                val minSize = 800L * 1024L * 1024L
                val selection = "${MediaStore.Video.Media.SIZE} >= ?"
                val selectionArgs = arrayOf(minSize.toString())
                val sort = "${MediaStore.Video.Media.DATE_ADDED} DESC"
                contentResolver.query(
                    MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                    proj, selection, selectionArgs, sort
                )?.use { cur ->
                    val idxId = cur.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
                    val idxName = cur.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME)
                    val idxDur = cur.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION)
                    val idxSize = cur.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE)
                    while (cur.moveToNext()) {
                        val id = cur.getLong(idxId)
                        val name = cur.getString(idxName) ?: "video_$id"
                        val dur = cur.getLong(idxDur)
                        val size = cur.getLong(idxSize)
                        val uriStr = Uri.parse("${MediaStore.Video.Media.EXTERNAL_CONTENT_URI}/$id").toString()
                        val obj = org.json.JSONObject().apply {
                            put("id", id); put("name", name); put("uri", uriStr)
                            put("duration", dur); put("size", size)
                        }
                        videos.put(obj)
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("GreenRhino", "scanMediaStore EXCEPTION: ${e.javaClass.name}: ${e.message}", e)
            }
            android.util.Log.e("GreenRhino", "scanMediaStore: FINISHED videos.length=${videos.length()}")
            runOnUiThread {
                android.util.Log.e("GreenRhino", "runOnUiThread: evaluateJavascript batches start, total=${videos.length()}")
                val batchSize = 50
                var idx = 0
                var bn = 0
                while (idx < videos.length()) {
                    val end = minOf(idx + batchSize, videos.length())
                    val batch = JSONArray()
                    for (i in idx until end) batch.put(videos.getJSONObject(i))
                    val status = if (end == videos.length()) "ok" else "batch"
                    // 🔶 用 batch.toString() 确保 JSON 正确转义；去掉 if guard 直接调
                    val js = "try{window.__mediaBatch(${batch.toString()},'$status')}catch(e){'ERR:'+e.message}"
                    bn++
                    android.util.Log.e("GreenRhino", "evalJS batch#$bn size=${batch.length()} status=$status jsLen=${js.length}")
                    webView.evaluateJavascript(js) { r ->
                        android.util.Log.e("GreenRhino", "evalJS batch#$bn result=$r")
                    }
                    idx = end
                }
                // 额外测试：直接 evaluate 一个简单表达式
                webView.evaluateJavascript("window.__mediaBatch ? 'EXISTS' : 'MISSING'") { r ->
                    android.util.Log.e("GreenRhino", "direct check __mediaBatch = $r")
                }
                // 🔶 诊断 DOM 尺寸链：vp-page / lib.el / #view / #main
                webView.evaluateJavascript("(function(){var r=[];var sels=['#app','#main','#view','.vp-page','.vp-page .media-lib','.vp-page .media-grid'];for(var s of sels){var e=document.querySelector(s);if(e){var rct=e.getBoundingClientRect();r.push(s+': '+Math.round(rct.width)+'x'+Math.round(rct.height)+' display='+getComputedStyle(e).display+' vis='+getComputedStyle(e).visibility+' op='+getComputedStyle(e).opacity)}}return r.join(' | ')})()") { r ->
                    android.util.Log.e("GreenRhino", "DOM size chain: $r")
                }
            }
        }.start()
    }

    private fun requestMediaPermission() {
        // 🔶 无条件直接 scan：pm grant 已预授权；Motorola 拦截权限请求链路
        android.util.Log.e("GreenRhino", "requestMediaPermission -> scanMediaStore() (force)")
        scanMediaStore()
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
        container = FrameLayout(this).apply {
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
        // 🔶 强制清缓存 —— 避免 CSS/JS 改了但 WebView 用旧的！
        webView.clearCache(true)
        webView.clearHistory()
        android.util.Log.d("GreenRhino", "Loading index.html (cache cleared)")
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
            cacheMode = WebSettings.LOAD_NO_CACHE  // 🔶 调试期：禁缓存，每次从 assets 重读
        }

        // 🔶 JS Bridge：让 JS 能调 Android 原生功能（全屏、日志）
        // ⚠️ 必须用 inner class！匿名 object 上的 @JavascriptInterface 在 targetSdk 34+ 某些设备不生效
        webView.addJavascriptInterface(RhinoBridge(), "RhinoBridge")
        android.util.Log.d("GreenRhino", "RhinoBridge registered OK")

        webView.webViewClient = object : WebViewClient() {
            // 🔶 拦截 content:// URI → ContentResolver.openInputStream → WebResourceResponse
            // WebView 不认识 content://，必须代理给 Android ContentResolver
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url?.toString() ?: return null
                if (url.startsWith("content://")) {
                    return try {
                        val input = contentResolver.openInputStream(Uri.parse(url)) ?: return null
                        val mime = contentResolver.getType(Uri.parse(url)) ?: "video/mp4"
                        android.util.Log.e("GreenRhino", "intercept content:// mime=$mime url=${url.take(60)}")
                        WebResourceResponse(mime, null, input)
                    } catch (e: Exception) {
                        android.util.Log.e("GreenRhino", "intercept content:// FAIL: ${e.message}")
                        null
                    }
                }
                return super.shouldInterceptRequest(view, request)
            }
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url.toString()
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    if (!url.contains("android_asset")) {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        return true
                    }
                }
                return false
            }
            // 🔶 页面加载完 → 染 topbar 亮红 + dump 所有层位置
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                android.util.Log.d("GreenRhino", "onPageFinished: $url")
                // 🔶 页面加载完 → 延迟 2s 自动扫描 MediaStore（等 main.js 初始化）
                webView.postDelayed({ requestMediaPermission() }, 2000)
            }

        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                val intent: Intent? = params?.createIntent()
                try {
                    intent?.let { startActivityForResult(it, FILE_CHOOSER_REQUEST) } ?: run { filePathCallback = null; return false }
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

            // 🔶 JS console → Android logcat（便于调试，兼容 minSdk 21）
            @Suppress("OVERRIDE_DEPRECATION")
            override fun onConsoleMessage(message: String?, lineNumber: Int, sourceID: String?) {
                android.util.Log.d("GreenRhino", "[console] $message ($sourceID:$lineNumber)")
            }

            // 🔶 HTML5 Fullscreen → Android 原生全屏（WebView requestFullscreen 需要这个回调）
            private var customView: android.view.View? = null
            private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
            override fun onShowCustomView(view: android.view.View?, callback: WebChromeClient.CustomViewCallback?) {
                super.onShowCustomView(view, callback)
                android.util.Log.d("GreenRhino", "onShowCustomView called! view=$view")
                if (customView != null) onHideCustomView()
                customView = view
                fullscreenCallback = callback
                view?.let {
                    // 🔶 强制铺满 + 黑底（WebView 传进来的 customView 默认尺寸可能不对）
                    it.layoutParams = FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                    )
                    it.setBackgroundColor(android.graphics.Color.BLACK)
                    container.addView(it)
                }
                webView.visibility = android.view.View.GONE
            }
            override fun onHideCustomView() {
                super.onHideCustomView()
                android.util.Log.d("GreenRhino", "onHideCustomView called")
                (customView ?: return).let {
                    container.removeView(it)
                    customView = null
                }
                // 通知 WebView 我们已经退出全屏了
                fullscreenCallback?.onCustomViewHidden()
                fullscreenCallback = null
                webView.visibility = android.view.View.VISIBLE
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(
                (0 != applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)
            )
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_CHOOSER_REQUEST) {
            val result = if (resultCode == RESULT_OK && data != null) {
                WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            } else null
            filePathCallback?.onReceiveValue(result)
            filePathCallback = null
        }
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

    // 🔶 原生沉浸式全屏切换（JS Bridge 调这个）
    @SuppressLint("NewApi")
    fun toggleImmersive() {
        immersive = !immersive
        android.util.Log.d("GreenRhino", "toggleImmersive: immersive=$immersive")
        // 1. 隐藏/显示 system bars
        WindowInsetsControllerCompat(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            if (immersive) hide(WindowInsetsCompat.Type.systemBars())
            else show(WindowInsetsCompat.Type.systemBars())
        }
        // 2. 切横屏/恢复（configChanges 在 manifest，不重建 Activity）
        // 🔶 SCREEN_ORIENTATION_LANDSCAPE 硬锁横屏——不依赖系统传感器！
        //    不管用户开不开自动旋转开关，强制切横屏。退出用 UNSPECIFIED 让系统接管。
        val target = if (immersive)
            android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        else
            android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        requestedOrientation = target
        android.util.Log.d("GreenRhino", "requestedOrientation set to=$target")
    }

    // 🔶 旋转后强制 WebView 重新布局（解决旋转时左边黑块问题）
    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        val orient = when (newConfig.orientation) {
            android.content.res.Configuration.ORIENTATION_LANDSCAPE -> "LANDSCAPE"
            android.content.res.Configuration.ORIENTATION_PORTRAIT -> "PORTRAIT"
            else -> "OTHER"
        }
        android.util.Log.d("GreenRhino", "onConfigurationChanged → $orient")
        // 🔶 强制 WebView 重新测量：post 到 UI 线程下一帧，确保配置已生效
        webView.post {
            webView.requestLayout()
            webView.invalidate()
            // 🔶 通知 JS 层刷新全屏尺寸（解决 vp-page 100vw/100vh 缓存问题）
            try {
                webView.evaluateJavascript(
                    "if(window.__onOrientationChange) window.__onOrientationChange(); " +
                    "else { var e=new Event('orientationchange'); window.dispatchEvent(e); }",
                    null
                )
            } catch (_: Exception) {}
        }
    }

    override fun onDestroy() {
        webView.stopLoading()
        webView.removeAllViews()
        webView.destroy()
        super.onDestroy()
    }

    // 🔶 JS Bridge inner class（必须是独立类，不能匿名！）
    inner class RhinoBridge {
        @JavascriptInterface
        fun toggleFullscreen() {
            android.util.Log.d("GreenRhino", "RhinoBridge.toggleFullscreen() called from JS")
            runOnUiThread { toggleImmersive() }
        }
        @JavascriptInterface
        fun log(msg: String) {
            android.util.Log.d("GreenRhino", "[JS] $msg")
        }
        @JavascriptInterface
        fun requestAutoImport() {
            android.util.Log.d("GreenRhino", "RhinoBridge.requestAutoImport() from JS")
            runOnUiThread { requestMediaPermission() }
        }
    }
}



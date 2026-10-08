package com.greenrhino.player

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

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
    private var immersive = true  // 初始就是沉浸式

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

        // 🔶 JS Bridge：让 JS 能调 Android 原生功能（全屏、文件选择、console 日志）
        webView.addJavascriptInterface(object : Any() {
            @JavascriptInterface
            fun toggleFullscreen() { runOnUiThread { toggleImmersive() } }
            @JavascriptInterface
            fun log(msg: String) { android.util.Log.d("GreenRhino", "[JS] $msg") }
        }, "RhinoBridge")

        webView.webViewClient = object : WebViewClient() {
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
        // 2. 切横屏/竖屏（configChanges 在 manifest，不重建 Activity）
        // 🔶 SCREEN_ORIENTATION_LANDSCAPE 比 SENSOR_LANDSCAPE 更强制
        val target = if (immersive)
            android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        else
            android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        requestedOrientation = target
        android.util.Log.d("GreenRhino", "requestedOrientation set to=$target")
    }

    // 🔶 确认系统有没有应用我们的旋转请求
    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        val orient = when (newConfig.orientation) {
            android.content.res.Configuration.ORIENTATION_LANDSCAPE -> "LANDSCAPE"
            android.content.res.Configuration.ORIENTATION_PORTRAIT -> "PORTRAIT"
            else -> "OTHER"
        }
        android.util.Log.d("GreenRhino", "onConfigurationChanged → $orient")
    }

    override fun onDestroy() {
        webView.stopLoading()
        webView.removeAllViews()
        webView.destroy()
        super.onDestroy()
    }
}



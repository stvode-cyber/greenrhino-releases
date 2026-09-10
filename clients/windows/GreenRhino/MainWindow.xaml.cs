using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Microsoft.Win32;

namespace GreenRhino
{
    public partial class MainWindow : Window
    {
        private readonly WindowRole _role;
        // 影像窗全屏：记录进入全屏前的窗口样式/尺寸，退出时还原
        private bool _videoFullscreen;
        private WindowStyle _fsPrevStyle;
        private ResizeMode _fsPrevResize;
        private WindowState _fsPrevState;
        private double _fsPrevLeft, _fsPrevTop, _fsPrevWidth, _fsPrevHeight;

        /// <summary>窗口是否已真正关闭（仅托盘「退出」时变 true）。隐藏到托盘不算关闭。</summary>
        public bool IsClosed { get; private set; }

        // 系统托盘/服务/WebView2 环境由进程级 WindowHost 集中持有：多窗口共享一份，
        // 同进程对同一 user-data-folder 只能创建一个 WebView2 环境（否则各窗一套 IndexedDB）。

        // 支持双击/默认打开的音频与视频扩展名
        private static readonly HashSet<string> MediaExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            ".mp3", ".flac", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".wma", ".mp2", ".mp1", ".aiff", ".mka", ".ape",
            ".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v", ".ogv", ".ts", ".flv", ".wmv"
        };

        // 待交给页面播放的文件（含兄弟 .lrc）。
        // 页面加载完成前先入队，加载完成后统一 flush；
        // 后续实例经管道转发过来的文件也走这里，所以不能只在启动时读一次命令行。
        private readonly List<string> _pendingFiles = new();
        private bool _pageReady;

        // 原生视频兜底（WebView2 黑屏有声音时由 C# 用 MediaElement 直接播放本地文件）
        private bool _nativeActive;
        private bool _nativePlaying;
        private bool _nativeDragging;
        private DispatcherTimer _nativeTimer;

        // Blob 视频（库内/拖入，无本地路径）兜底：web 把字节分片传来，C# 写入临时文件后交给原生 MediaElement。
        // 每次传输都写唯一文件名，避免复用被前一个（MediaElement 持锁的）文件导致 "being used by another process"。
        private class VideoBlobWrite { public string Path = ""; public FileStream Fs = null; }
        private readonly Dictionary<string, VideoBlobWrite> _videoBlobWriters = new Dictionary<string, VideoBlobWrite>();
        private static string VideoCacheDir() =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GreenRhino", "video-cache");
        // 清理过期的 blob 临时视频文件（>24h 的 blob_*），避免唯一文件名方案下缓存无限累积
        private static void CleanVideoCache()
        {
            try
            {
                var dir = VideoCacheDir();
                if (!Directory.Exists(dir)) return;
                var cutoff = DateTime.Now.AddHours(-24);
                foreach (var f in Directory.GetFiles(dir, "blob_*"))
                    try { if (System.IO.File.GetLastWriteTime(f) < cutoff) System.IO.File.Delete(f); } catch { }
            }
            catch { /* 清理失败不影响播放 */ }
        }

        public MainWindow(WindowRole role)
        {
            _role = role;
            InitializeComponent();
            Title = role == WindowRole.Hub ? "影音先锋"
                : role == WindowRole.Music ? "绿角犀播放器 · 音乐"
                : "绿角犀播放器 · 视频";
            // 托盘/服务/WebView2 环境均已迁到进程级 WindowHost，由首个窗口（通常是 Hub）统一初始化。
            // 注意：命令行媒体文件在 App.OnStartup 已按类型 RouteExternalFiles 直开对应窗口，
            // 这里【不再】读命令行为启动窗口入队，避免文件被重复添加。
            // 原生视频兜底层控制条接线（各窗独立，只处理本窗 WebView2 的画面兜底）
            WireNativeVideo();
            if (role == WindowRole.Video)
            {
                // 影像窗：普通窗口即可，内容在页面内铺满；双击画面/按 Esc 进入或退出全屏（用户主动触发，非默认全屏）
                KeyDown += (s, e) =>
                {
                    if (e.Key == System.Windows.Input.Key.Escape && _role == WindowRole.Video)
                        ToggleVideoFullscreen();
                };
            }
        }

        // 进入/退出影像窗全屏（无边框、铺满全屏；退出后还原此前窗口态）
        private void EnterVideoFullscreen()
        {
            if (_role != WindowRole.Video || _videoFullscreen) return;
            _fsPrevStyle = WindowStyle; _fsPrevResize = ResizeMode; _fsPrevState = WindowState;
            _fsPrevLeft = Left; _fsPrevTop = Top; _fsPrevWidth = Width; _fsPrevHeight = Height;
            _videoFullscreen = true;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            WindowState = WindowState.Normal;
            Left = SystemParameters.VirtualScreenLeft;
            Top = SystemParameters.VirtualScreenTop;
            Width = SystemParameters.FullPrimaryScreenWidth;
            Height = SystemParameters.FullPrimaryScreenHeight;
        }
        private void ToggleVideoFullscreen()
        {
            if (!_videoFullscreen) { EnterVideoFullscreen(); }
            else
            {
                _videoFullscreen = false;
                WindowStyle = _fsPrevStyle; ResizeMode = _fsPrevResize; WindowState = _fsPrevState;
                Left = _fsPrevLeft; Top = _fsPrevTop; Width = _fsPrevWidth; Height = _fsPrevHeight;
            }
        }

        /// <summary>把路径过滤成可播放的媒体文件（并带上同名 .lrc）后入队。</summary>
        private void EnqueuePaths(IEnumerable<string> paths)
        {
            foreach (var a in paths ?? Enumerable.Empty<string>())
            {
                try
                {
                    if (File.Exists(a) && MediaExts.Contains(Path.GetExtension(a)))
                    {
                        _pendingFiles.Add(a);
                        // 顺带带上同名 .lrc（离线歌词自动匹配复用 importFiles 逻辑）
                        var lrc = Path.ChangeExtension(a, ".lrc");
                        if (File.Exists(lrc)) _pendingFiles.Add(lrc);
                    }
                }
                catch { /* 忽略无法访问的路径 */ }
            }
        }

        protected override async void OnSourceInitialized(EventArgs e)
        {
            base.OnSourceInitialized(e);

            // 内嵌服务 / WebView2 环境由进程级 WindowHost 懒加载且只建一次（各窗共享）。
            int port = WindowHost.EnsureServer();
            App.Log(Title + " 内嵌服务已启动 port=" + port);
            try
            {
                // 共享同一个 CoreWebView2Environment（唯一）→ 同 user-data-folder → 各窗读写同一套
                // IndexedDB / localStorage / Service Worker。GPU/视频解码参数（如 --disable-gpu 花屏兜底）
                // 已在 WindowHost.BuildEnvAsync 统一配置，这里直接复用，不再逐窗重复创建。
                var env = await WindowHost.GuaranteeEnvAsync();
                if (env != null) await webView.EnsureCoreWebView2Async(env);
                else await webView.EnsureCoreWebView2Async();
                App.Log(Title + " CoreWebView2 初始化完成");
            }
            catch (Exception ex)
            {
                App.Log("WebView2 初始化失败: " + ex.Message);
                MessageBox.Show(
                    "WebView2 初始化失败：\n" + ex.Message + "\n\n详细日志见 %LOCALAPPDATA%\\GreenRhino\\greenrhino.log",
                    "绿角犀播放器", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }
            // 允许 PWA 的 beforeinstallprompt / 媒体权限
            webView.CoreWebView2.Settings.IsWebMessageEnabled = true;
            webView.CoreWebView2.Settings.AreDefaultScriptDialogsEnabled = true;
            webView.CoreWebView2.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            // web -> 原生 消息（如「设为默认播放器」）
            webView.CoreWebView2.WebMessageReceived += OnWebMessage;
            // 让 web 端「我的云盘」指向内嵌本机服务（同源，零 CORS）；GR_HOST 标记原生壳。
            // 诊断脚本只安装一次（window.__grDbg 守卫，幂等）：console 转发 + onerror/unhandledrejection 上报。
            // 注意：绝不能在此之后再覆盖 console（双重包裹在某些 WebView2 下会引发
            // "Maximum call stack size exceeded"，导致 ES module 全部加载失败、界面黑屏）。
            _ = webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                "window.GR_CLOUD_BASE='http://127.0.0.1:" + port + "';window.GR_HOST=true;" +
                "window.__winRole='" + (_role == WindowRole.Hub ? "hub" : _role == WindowRole.Music ? "music" : "video") + "';" +
                "(function(){if(window.__grDbg)return;window.__grDbg=1;" +
                // 关键：必须在覆盖前把原始方法 bind 出来快照。不能用 var _c=console——
                // console 是可变对象，覆盖后 _c.log 指向的还是新函数，会无限递归自调用，
                // 每个调用栈层都 catch 后 postMessage 一次，日志被刷爆（几十万行）。
                "var _log=console.log.bind(console);var _warn=console.warn.bind(console);var _err=console.error.bind(console);" +
                "var _s=function(m){try{if(window.chrome&&window.chrome.webview)window.chrome.webview.postMessage(JSON.stringify({type:'__dbg',msg:m}))}catch(e){}};" +
                "console.log=function(){try{_log.apply(null,arguments)}catch(e){}_s(Array.prototype.slice.call(arguments).join(' '))};" +
                "console.warn=function(){try{_warn.apply(null,arguments)}catch(e){}_s('WARN:'+Array.prototype.slice.call(arguments).join(' '))};" +
                "console.error=function(){try{_err.apply(null,arguments)}catch(e){}_s('ERR:'+Array.prototype.slice.call(arguments).join(' '))};" +
                "window.addEventListener('error',function(e){_s('WINDOWERR:'+(e.message||'')+' @ '+(e.filename||'')+':'+(e.lineno||''))},true);" +
                "window.addEventListener('unhandledrejection',function(e){_s('REJECT:'+String((e.reason&&e.reason.stack)||e.reason||''))},true);" +
                "setTimeout(function(){_s('hostOpen@3s: '+(typeof window.__hostOpen))},3000);" +
                "setTimeout(function(){_s('hostOpen@8s: '+(typeof window.__hostOpen))},8000);" +
                "_s('__hostOpen defined: ' + (typeof window.__hostOpen) + ', GR_HOST: ' + (typeof window.GR_HOST));})();");
            // 页面加载完成后，把双击传入的文件交给 web 层打开并播放
            webView.CoreWebView2.NavigationCompleted += OnNavigationCompleted;
            webView.Source = new Uri($"http://127.0.0.1:{port}/");
        }

        private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            _pageReady = true;
            // 诊断：console 转发 / onerror / hostOpen 状态已在 AddScriptToExecuteOnDocumentCreatedAsync 安装一次，
            // 这里【不再覆盖 console】（重复包裹会导致 "Maximum call stack size exceeded"，令 ES module 加载失败）。
            FlushPendingFiles();
            // 首次运行就自动注册为默认播放器（用户要求"装好即默认"），只尝试一次（进程级，多窗不重复）
            if (WindowHost.AutoCheckedTestAndSet())
            {
                AutoRegisterDefaultOnce();
            }
        }

        /// <summary>
        /// 首次运行时自动把本程序设为默认播放器。
        /// 用注册表标志保证"只做一次"——否则用户后来手动换回别的播放器，
        /// 每次启动又被改回来，就成了流氓行为。
        /// 失败时不写标志，下次启动会再试一次。
        /// </summary>
        private void AutoRegisterDefaultOnce()
        {
            try
            {
                using var k = Registry.CurrentUser.CreateSubKey(@"Software\GreenRhino\Player");
                if (!string.IsNullOrEmpty(k.GetValue("AutoRegisteredDefault") as string)) return;

                var (ok, _err) = SetAsDefaultPlayer();
                if (!ok) return;   // 失败不落标志，留待下次再试

                k.SetValue("AutoRegisteredDefault", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
            }
            catch { /* 自动注册失败不该影响正常使用 */ }
        }

        /// <summary>把待播放文件登记进 LocalServer 白名单，并让页面打开播放。</summary>
        private void FlushPendingFiles()
        {
            if (_pendingFiles.Count == 0) return;
            var files = _pendingFiles.ToList();
            _pendingFiles.Clear();
            try
            {
                var items = WindowHost.Server.RegisterExternalFiles(files);
                if (items.Count == 0) return;
                var json = System.Text.Json.JsonSerializer.Serialize(items);
                App.Log("FlushPendingFiles: " + items.Count + " 个文件 -> " + json);
                // 页面为 ES module，NavigationCompleted 时模块脚本可能尚未执行完毕，
                // window.__hostOpen 可能还没定义。轮询等待其就绪后再调用（最长 10s），
                // 避免因竞态导致双击文件被静默丢弃（界面全黑、什么都不播）。
                // json 由 System.Text.Json 生成：非 ASCII 已转义为 \uXXXX、路径反斜杠已转义为 \\，
                // 二者均为合法 JS 字符串字面量转义，直接内嵌即可。
                // 【不要】再手动 Replace 转义：那会把 C:\ 变成字面 C:\\、把 \uXXXX 变成字面文本，
                // 导致 web 端拿到损坏路径，File.Exists 判定失败、转码永远不启动。
                var data = json;
                var script = "(function(){var data=" + data + ";var n=0;(function poll(){"
                    + "if(typeof window.__hostOpen==='function'){try{window.__hostOpen(data)}catch(e){console.error('hostOpen:',e)}}"
                    + "else if(++n<50){setTimeout(poll,200)}"
                    + "else{console.warn('__hostOpen 10s 内未就绪，文件被丢弃');}})()})()";
                _ = webView.CoreWebView2.ExecuteScriptAsync(script);
            }
            catch { /* 页面尚未就绪等异常不应拖垮主窗口 */ }
        }

        /// <summary>
        /// 供 App 在收到后续实例经管道转发来的文件时调用。
        /// 页面已就绪就立刻播放；否则先入队，等 NavigationCompleted 再统一播放。
        /// </summary>
        public void OpenExternalFiles(IEnumerable<string> paths)
        {
            EnqueuePaths(paths);
            if (_pageReady) FlushPendingFiles();
        }

        /// <summary>把窗口切到前台（最小化时先还原）。</summary>
        public void BringToFront()
        {
            try
            {
                // 管道回调在 UI 线程，但双击启动等路径可能在别的线程
                if (!Dispatcher.CheckAccess()) { Dispatcher.Invoke(BringToFront); return; }
                if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
                Show();
                Activate();
                var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
                if (hwnd != IntPtr.Zero) { ShowWindow(hwnd, SW_RESTORE); SetForegroundWindow(hwnd); }
            }
            catch { /* 激活失败不影响文件已送达 */ }
        }

        // web 请求「设为系统默认播放器」/ 投屏控制
        private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            var msg = e.TryGetWebMessageAsString();
            if (string.IsNullOrEmpty(msg)) return;
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(msg);
                var root = doc.RootElement;
                if (!root.TryGetProperty("type", out var t)) return;
                var type = t.GetString();

                if (type == "__dbg")
                {
                    // 页面 console 诊断转发
                    App.Log("web> " + Str(root, "msg"));
                }
                else if (type == "openWindow")
                {
                    // 前端「打开音乐/视频弹窗」「回主窗」：打开对应角色窗口（已存在则聚焦）
                    var roleStr = Str(root, "role");
                    var target = roleStr == "music" ? WindowRole.Music
                        : roleStr == "video" ? WindowRole.Video
                        : WindowRole.Hub;
                    WindowHost.OpenOrFocus(target);
                }
                else if (type == "fullscreen")
                {
                    // 影像窗全屏/退出全屏（web 端双击画面或按 Esc 触发）
                    ToggleVideoFullscreen();
                }
                else if (type == "setDefault")
                {
                    var (ok, err) = SetAsDefaultPlayer();
                    PostCast(new
                    {
                        type = "setDefaultResult",
                        ok,
                        msg = err ?? "已设为默认播放器，可双击音频/视频文件直接打开"
                    });
                }
                else if (type == "cast:scan")
                {
                    _ = Task.Run(async () =>
                    {
                        var devs = await WindowHost.Caster.DiscoverAsync(4000);
                        PostCast(new
                        {
                            type = "cast:devices",
                            devices = devs.Select(d => new { id = d.Id, name = d.Name }).ToArray()
                        });
                    });
                }
                else if (type == "cast:play")
                {
                    string uri = Str(root, "uri");
                    string deviceId = Str(root, "deviceId");
                    _ = Task.Run(async () =>
                    {
                        await WindowHost.Caster.Play(deviceId, uri);
                        PostCast(new { type = "cast:status", deviceId, state = "playing" });
                    });
                }
                else if (type == "cast:stop")
                {
                    string deviceId = Str(root, "deviceId");
                    _ = Task.Run(async () =>
                    {
                        await WindowHost.Caster.Stop(deviceId);
                        PostCast(new { type = "cast:status", deviceId, state = "stopped" });
                    });
                }
                else if (type == "cast:pause")
                {
                    string deviceId = Str(root, "deviceId");
                    _ = Task.Run(async () =>
                    {
                        await WindowHost.Caster.Pause(deviceId);
                        PostCast(new { type = "cast:status", deviceId, state = "paused" });
                    });
                }
                else if (type == "cast:seek")
                {
                    string deviceId = Str(root, "deviceId");
                    string pos = Str(root, "pos");
                    _ = Task.Run(async () =>
                    {
                        await WindowHost.Caster.Seek(deviceId, pos);
                        PostCast(new { type = "cast:status", deviceId, state = "seeked" });
                    });
                }
                else if (type == "cast:mirror")
                {
                    // 系统无线显示（Miracast，等效 Win+K）：唤起系统「连接到无线显示器」面板，
                    // 用户在面板里点电视即整屏镜像。比 WinRT ProjectionManager 风险低、零互操作坑。
                    _ = Task.Run(() =>
                    {
                        try
                        {
                            var psi = new System.Diagnostics.ProcessStartInfo(
                                "explorer.exe", "ms-settings-connectabledevices:devicediscovery");
                            psi.UseShellExecute = true;
                            System.Diagnostics.Process.Start(psi);
                            PostCast(new { type = "cast:mirror", ok = true });
                        }
                        catch (Exception ex)
                        {
                            PostCast(new { type = "cast:mirror", ok = false, msg = ex.Message });
                        }
                    });
                }
                else if (type == "videoKick")
                {
                    // WebView2 黑屏有声音的二次保险：视频开播/切到视频页时让宿主强制重绘。
                    // 先做一次 1px 尺寸微抖（WPF WebView2 黑屏的经典修复），再 InvalidateVisual。
                    Dispatcher.Invoke(() =>
                    {
                        try
                        {
                            var w = webView.ActualWidth;
                            if (w > 0)
                            {
                                webView.Width = w - 1;
                                webView.UpdateLayout();
                                webView.Width = double.NaN; // 恢复自动宽度，避免钉死视频区
                            }
                            webView.InvalidateVisual();
                        }
                        catch { }
                    });
                }
                else if (type == "videoNoFrame")
                {
                    // WebView2 视频黑屏有声音：web 看门狗确认无帧（且非解码错误）后通知 C#。
                    // 若当前视频是本地文件（双击/外部打开），直接用原生 MediaElement 播放，绕开 WebView2 overlay。
                    string p = Str(root, "path");
                    string diag = Str(root, "diag");
                    App.Log("视频黑屏(overlay 未提交) 诊断: path=" + p + " diag=" + diag);
                    if (!string.IsNullOrEmpty(p) && File.Exists(p) && MediaExts.Contains(Path.GetExtension(p)))
                    {
                        Dispatcher.Invoke(() => ShowNativeVideo(p));
                        PostCast(new { type = "nativeShown" });
                    }
                    else
                    {
                        PostCast(new { type = "noNative" }); // web 端会自行 reload
                    }
                }
                else if (type == "videoDecodeError" || type == "videoTranscode")
                {
                    // 视频轨解码失败（HEVC/10bit 等编码不支持）：编码问题，C# 原生 MediaElement 同样救不了，
                    // 用内置 ffmpeg 转码为 H.264 后原生播放；库内 Blob 无本地路径时走 videoBlobEnd 的转码分支。
                    string p = Str(root, "path");
                    string diag = Str(root, "diag");
                    App.Log("视频解码失败(编码不支持，转码兜底): path=" + p + " diag=" + diag);
                    if (!string.IsNullOrEmpty(p) && File.Exists(p) && MediaExts.Contains(Path.GetExtension(p)))
                    {
                        PostCast(new { type = "nativePauseWeb" }); // 立即暂停 web 黑屏视频的音频，避免转码期间双声轨
                        _ = Task.Run(() => TranscodeAndPlay(p));
                    }
                    else { App.Log("转码兜底无法定位源文件: exists=" + File.Exists(p) + " ext=" + Path.GetExtension(p) + " p=" + p); PostCast(new { type = "transcodeFailed", reason = "视频编码不支持且无法定位源文件转码，请改用 H.264 编码的 MP4。" }); }
                }
                else if (type == "videoBlobChunk")
                {
                    // 库内/拖入的 Blob 视频：web 分片传来字节，C# 追加写入临时文件
                    string id = Str(root, "id");
                    string ext = Str(root, "ext");
                    string data = Str(root, "data");
                    if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(data)) return;
                    try
                    {
                        var dir = VideoCacheDir();
                        Directory.CreateDirectory(dir);
                        CleanVideoCache();
                        var blobExt = string.IsNullOrEmpty(Str(root, "ext")) ? ".mp4" : "." + Str(root, "ext").TrimStart('.').ToLowerInvariant();
                        var bytes = Convert.FromBase64String(data);
                        if (!_videoBlobWriters.TryGetValue(id, out var w))
                        {
                            // 唯一临时文件名：即使上一次同 id 的视频仍被原生 MediaElement 持锁，也不会覆盖冲突
                            var fname = $"blob_{DateTime.Now:HHmmssfff}_{Guid.NewGuid():N}{blobExt}";
                            w = new VideoBlobWrite { Path = Path.Combine(dir, fname) };
                            w.Fs = new FileStream(w.Path, FileMode.Create, FileAccess.Write);
                            _videoBlobWriters[id] = w;
                        }
                        w.Fs.Write(bytes, 0, bytes.Length);
                    }
                    catch (Exception ex) { App.Log("videoBlobChunk 写入失败: " + ex.Message); }
                }
                else if (type == "videoBlobEnd")
                {
                    // 字节传完：关闭临时文件；带转码标志则先转 H.264 再原生播放，否则直接原生播放
                    string id = Str(root, "id");
                    string ext = Str(root, "ext");
                    string tr = Str(root, "transcode");
                    bool wantTranscode = tr == "true" || tr == "1";
                    if (string.IsNullOrEmpty(id)) return;
                    try
                    {
                        string path = "";
                        if (_videoBlobWriters.TryGetValue(id, out var w))
                        {
                            try { w.Fs.Dispose(); } catch { }
                            path = w.Path;
                            _videoBlobWriters.Remove(id);
                        }
                        if (!string.IsNullOrEmpty(path) && File.Exists(path) && MediaExts.Contains(Path.GetExtension(path)))
                        {
                            if (wantTranscode)
                            {
                                PostCast(new { type = "nativePauseWeb" });
                                _ = Task.Run(() => TranscodeAndPlay(path));
                            }
                            else
                            {
                                Dispatcher.Invoke(() => ShowNativeVideo(path));
                                PostCast(new { type = "nativeShown" });
                            }
                        }
                        else PostCast(new { type = "noNative" });
                    }
                    catch (Exception ex) { App.Log("videoBlobEnd 处理失败: " + ex.Message); PostCast(new { type = "noNative" }); }
                }
                else if (type == "clip")
                {
                    // 视频片段剪辑：用内置 ffmpeg 从本地视频切出 [start,end) 片段，重编码为 H.264 保证可播。
                    // 仅支持带本地路径的视频（双击/外部打开）；库内 Blob/在线预览无本地文件，前端已禁用。
                    string p = Str(root, "path");
                    string start = Str(root, "start");
                    string end = Str(root, "end");
                    _ = Task.Run(() => MakeClip(p, start, end));
                }
            }
            catch { /* 忽略无法解析的消息 */ }
        }

        private static string Str(System.Text.Json.JsonElement root, string name)
        {
            if (root.TryGetProperty(name, out var v))
            {
                switch (v.ValueKind)
                {
                    case System.Text.Json.JsonValueKind.String: return v.GetString() ?? "";
                    case System.Text.Json.JsonValueKind.True: return "true";
                    case System.Text.Json.JsonValueKind.False: return "false";
                    case System.Text.Json.JsonValueKind.Number: return v.GetRawText();
                }
            }
            return "";
        }

        private void PostCast(object obj)
        {
            try
            {
                var json = System.Text.Json.JsonSerializer.Serialize(obj);
                webView.CoreWebView2?.PostWebMessageAsString(json);
            }
            catch { /* 页面未就绪等异常忽略 */ }
        }

        // ---------- 原生视频兜底 ----------
        private void WireNativeVideo()
        {
            NativePlayPause.Click += (s, e) =>
            {
                if (_nativePlaying) { try { NativeVideo.Pause(); } catch { } _nativePlaying = false; NativePlayPause.Content = "▶"; }
                else { try { NativeVideo.Play(); } catch { } _nativePlaying = true; NativePlayPause.Content = "⏸"; }
            };
            NativeClose.Click += (s, e) => HideNativeVideo();
            NativeVideo.MediaOpened += (s, e) => { _nativePlaying = true; NativePlayPause.Content = "⏸"; App.Log("原生视频已打开"); };
            NativeVideo.MediaEnded += (s, e) => { _nativePlaying = false; NativePlayPause.Content = "▶"; };
            NativeVideo.MediaFailed += (s, e) => App.Log("原生视频 MediaFailed: " + (e.ErrorException?.Message ?? "未知"));

            NativeSeek.PreviewMouseDown += (s, e) => _nativeDragging = true;
            NativeSeek.PreviewMouseUp += (s, e) => _nativeDragging = false;
            NativeSeek.ValueChanged += (s, e) =>
            {
                if (!_nativeDragging) return;
                var d = NativeVideo.NaturalDuration.HasTimeSpan ? NativeVideo.NaturalDuration.TimeSpan : TimeSpan.Zero;
                try { NativeVideo.Position = TimeSpan.FromSeconds(d.TotalSeconds * e.NewValue); } catch { }
            };

            _nativeTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(250) };
            _nativeTimer.Tick += (s, e) =>
            {
                if (NativeVideo.Visibility != Visibility.Visible) return;
                var pos = NativeVideo.Position;
                var dur = NativeVideo.NaturalDuration.HasTimeSpan ? NativeVideo.NaturalDuration.TimeSpan : TimeSpan.Zero;
                if (dur.TotalSeconds > 0) NativeSeek.Value = pos.TotalSeconds / dur.TotalSeconds;
                NativeTime.Text = $"{Fmt(pos)} / {Fmt(dur)}";
            };
            _nativeTimer.Start();
        }

        private void ShowNativeVideo(string path)
        {
            try
            {
                _nativeActive = true;
                // 先彻底停止并置空 Source，释放旧文件句柄，避免新/旧视频用同一缓存文件时被锁
                try { NativeVideo.Stop(); } catch { }
                try { NativeVideo.Source = null; } catch { }
                NativeVideo.ClearValue(MediaElement.SourceProperty);
                NativeVideo.Source = new Uri(path);
                NativeVideo.Visibility = Visibility.Visible;
                NativeBar.Visibility = Visibility.Visible;
                NativeVideo.Play();
                App.Log("原生视频兜底启用: " + path);
                // 让 web 端暂停它的黑屏视频，避免双声轨
                PostCast(new { type = "nativePauseWeb" });
            }
            catch (Exception ex) { App.Log("原生视频启动失败: " + ex.Message); }
        }

        private void HideNativeVideo()
        {
            try { NativeVideo.Stop(); NativeVideo.Source = null; } catch { }
            NativeVideo.Visibility = Visibility.Collapsed;
            NativeBar.Visibility = Visibility.Collapsed;
            _nativeActive = false;
            _nativePlaying = false;
            NativePlayPause.Content = "⏸";
        }

        private static string Fmt(TimeSpan t)
        {
            int s = (int)t.TotalSeconds;
            int m = s / 60; s %= 60;
            int h = m / 60; m %= 60;
            return h > 0 ? $"{h:D2}:{m:D2}:{s:D2}" : $"{m:D2}:{s:D2}";
        }

        // ---------- HEVC/10bit 等不兼容编码自动转码（内置 ffmpeg → H.264） ----------
        // 在后台线程转码，完成后切到 UI 线程用原生 MediaElement 播放；成功/失败都回传 web 端。
        // 同一源文件并发去重（进程级，多窗亦不重复）：web 端黑屏看门狗可能在转码期间反复上报
        // videoTranscode，若每个消息都启动一个 ffmpeg 进程，同一文件会同时转码几十遍，CPU 拉满。
        private void TranscodeAndPlay(string src)
        {
            if (!WindowHost.BeginTranscode(src)) return; // 已在转码中（进程级去重），忽略并发重复请求
            // 边转边播：转码到首个进度（约1%）就回传 ready，前端立刻播放已转好的片段，
            // 后续进度继续累加，真正 100% 完成时再发 transcodeDone 隐藏进度提示。
            int readySent = 0;
            try
            {
                var dst = TranscodeToH264(src, url =>
                {
                    try
                    {
                        // stdout 线程回调；跨到 UI 线程回传，避免 PostCast 跨线程
                        Dispatcher.Invoke(() => PostCast(new { type = "transcodeReady", url = url, path = src }));
                        System.Threading.Volatile.Write(ref readySent, 1);
                    }
                    catch { }
                });
                Dispatcher.Invoke(() =>
                {
                    if (string.IsNullOrEmpty(dst))
                    {
                        PostCast(new { type = "transcodeFailed", reason = "视频转码失败，请改用 H.264 编码的 MP4。" });
                        return;
                    }
                    if (System.Threading.Volatile.Read(ref readySent) == 0)
                    {
                        // 极小的文件可能还没走到首个进度回调就转完了：这里补发 ready
                        var url = RegisterTranscodedUrl(dst);
                        if (string.IsNullOrEmpty(url))
                        {
                            PostCast(new { type = "transcodeFailed", reason = "视频转码后无法登记播放，请改用 H.264 编码的 MP4。" });
                            return;
                        }
                        PostCast(new { type = "transcodeReady", url = url, path = dst });
                    }
                    // 转码真正完成：让前端收起「正在转码」进度提示
                    PostCast(new { type = "transcodeDone", ok = true });
                });
            }
            finally
            {
                WindowHost.EndTranscode(src);
            }
        }

        // 把转码产物登记进内嵌服务，返回可由 web <video> 播放的完整 URL
        private string RegisterTranscodedUrl(string dst)
        {
            var token = WindowHost.Server?.RegisterExternalFile(dst);
            if (string.IsNullOrEmpty(token)) return null;
            return $"http://127.0.0.1:{WindowHost.Server.Port}/api/external?t={token}";
        }

        private string TranscodeToH264(string src, Action<string> onReady = null)
        {
            try
            {
                var ff = EnsureFfmpeg();
                if (string.IsNullOrEmpty(ff)) { App.Log("转码跳过：未找到内置 ffmpeg"); return null; }
                var dir = Path.Combine(Path.GetTempPath(), "GreenRhino", "transcode");
                Directory.CreateDirectory(dir);
                var dst = Path.Combine(dir, HashName(src) + ".h264.mp4");
                if (File.Exists(dst) && new FileInfo(dst).Length > 0) { App.Log("转码命中缓存: " + dst); return dst; }
                var psi = new System.Diagnostics.ProcessStartInfo(ff)
                {
                    UseShellExecute = false,
                    RedirectStandardError = true,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true
                };
                // ArgumentList 自动处理含空格/中文路径的引号
                psi.ArgumentList.Add("-y");
                psi.ArgumentList.Add("-hide_banner");
                psi.ArgumentList.Add("-loglevel");
                psi.ArgumentList.Add("info");   // info 才能在 stderr 拿到 Duration: 与 time= 用于进度
                psi.ArgumentList.Add("-i");
                psi.ArgumentList.Add(src);
                psi.ArgumentList.Add("-c:v");
                psi.ArgumentList.Add("libx264");
                psi.ArgumentList.Add("-preset");
                psi.ArgumentList.Add("veryfast");
                psi.ArgumentList.Add("-crf");
                psi.ArgumentList.Add("23");
                psi.ArgumentList.Add("-pix_fmt");
                psi.ArgumentList.Add("yuv420p");
                psi.ArgumentList.Add("-c:a");
                psi.ArgumentList.Add("aac");
                // 分片 MP4（moov 前置 + 逐段 moof）：文件边写边可被 <video> 解析播放。
                // 结合「边转边播」让大文件在首段转完即可开播，不必等全量 100%。
                psi.ArgumentList.Add("-movflags");
                psi.ArgumentList.Add("+frag_keyframe+empty_moov+default_base_moof");
                psi.ArgumentList.Add("-progress");
                psi.ArgumentList.Add("pipe:1");   // 以换行键值对输出进度（out_time_*），可实时解析
                psi.ArgumentList.Add(dst);
                using var proc = System.Diagnostics.Process.Start(psi);
                if (proc == null) return null;
                double dur = 0;
                int lastPct = -1;
                int readyFlag = 0; // 边转边播：首个进度已回传 ready 的标记（进程并发安全）
                var log = new System.Text.StringBuilder();

                // stdout：-progress pipe:1 输出以换行分隔的键值对 → 实时解析 out_time_* 折算百分比
                // 不能依赖 stderr 的 time=（ffmpeg 用 \r 刷新不换行，ReadLine 读不到中间进度）
                proc.OutputDataReceived += (s, ev) =>
                {
                    string line = ev?.Data;
                    if (string.IsNullOrEmpty(line)) return;
                    if (line.StartsWith("progress=end")) { SendTranscodeProgress(100); return; }
                    double cur = -1;
                    var cm = System.Text.RegularExpressions.Regex.Match(line,
                        @"out_time_ms=(\d+)|out_time_us=(\d+)|out_time=(\d+):(\d+):(\d+(?:\.\d+)?)");
                    if (cm.Success)
                    {
                        try
                        {
                            var ci = System.Globalization.CultureInfo.InvariantCulture;
                            if (cm.Groups[1].Success) cur = double.Parse(cm.Groups[1].Value, ci) / 1000.0;            // 毫秒→秒
                            else if (cm.Groups[2].Success) cur = double.Parse(cm.Groups[2].Value, ci) / 1000000.0;    // 微秒→秒
                            else cur = double.Parse(cm.Groups[3].Value, ci) * 3600 + double.Parse(cm.Groups[4].Value, ci) * 60 + double.Parse(cm.Groups[5].Value, ci);
                        }
                        catch { cur = -1; }
                    }
                    if (dur > 0 && cur >= 0)
                    {
                        var pct = (int)Math.Min(99, cur / dur * 100);
                        if (pct > lastPct) { lastPct = pct; SendTranscodeProgress(pct); }
                        // 边转边播：首个进度且文件已落盘 → 回传 ready，前端立刻播放已转好的分片
                        if (pct >= 1 && File.Exists(dst) && new FileInfo(dst).Length > 0 &&
                            System.Threading.Interlocked.CompareExchange(ref readyFlag, 1, 0) == 0)
                        {
                            try
                            {
                                var url = RegisterTranscodedUrl(dst);
                                if (!string.IsNullOrEmpty(url)) { App.Log("边转边播 ready @ " + pct + "% : " + url); onReady?.Invoke(url); }
                            }
                            catch (Exception ex) { App.Log("边转边播 ready 异常: " + ex.Message); }
                        }
                    }
                };
                proc.BeginOutputReadLine();

                // stderr：读取 Duration 作为总时长，并收集完整 stderr 供失败诊断
                string e;
                while ((e = proc.StandardError.ReadLine()) != null)
                {
                    var dm = System.Text.RegularExpressions.Regex.Match(e, @"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)");
                    if (dm.Success) { dur = ParseHms(dm); continue; }
                    if (!string.IsNullOrEmpty(e)) log.AppendLine(e);
                }
                if (!proc.WaitForExit(300000))
                {
                    try { proc.Kill(); } catch { }
                    App.Log("ffmpeg 转码超时: " + src);
                    return null;
                }
                var err = log.ToString();
                if (proc.ExitCode == 0 && File.Exists(dst) && new FileInfo(dst).Length > 0)
                {
                    App.Log("转码完成: " + dst);
                    SendTranscodeProgress(100); // 真正成功才推满
                    return dst;
                }
                App.Log("ffmpeg 转码失败(" + proc.ExitCode + "): " + (err ?? "").Trim());
                return null;
            }
            catch (Exception ex) { App.Log("转码异常: " + ex.Message); return null; }
        }

        private static string HashName(string src)
        {
            try
            {
                var fi = new FileInfo(src);
                using var sha = System.Security.Cryptography.SHA256.Create();
                var bytes = sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(src + "|" + fi.Length + "|" + fi.LastWriteTimeUtc.Ticks));
                return Convert.ToHexString(bytes).Substring(0, 24).ToLowerInvariant();
            }
            catch { return Guid.NewGuid().ToString("N").Substring(0, 16); }
        }

        // 把 "HH:MM:SS(.cc)" 时间组解析成秒；失败返回 0
        private static double ParseHms(System.Text.RegularExpressions.Match m)
        {
            try
            {
                var ci = System.Globalization.CultureInfo.InvariantCulture;
                double h = double.Parse(m.Groups[1].Value, ci);
                double mm = double.Parse(m.Groups[2].Value, ci);
                double s = double.Parse(m.Groups[3].Value, ci);
                return h * 3600 + mm * 60 + s;
            }
            catch { return 0; }
        }

        // 回传转码进度（跨到 UI 线程调用 PostCast）
        private void SendTranscodeProgress(int pct)
        {
            try { Dispatcher.Invoke(() => PostCast(new { type = "transcodeProgress", pct })); }
            catch { /* 线程竞态等忽略，进度非关键路径 */ }
        }

        // 内置 ffmpeg.exe 从嵌入资源懒释放到临时目录（首次转码时执行）
        private static string EnsureFfmpeg()
        {
            try
            {
                var dir = Path.Combine(Path.GetTempPath(), "GreenRhino");
                Directory.CreateDirectory(dir);
                var dst = Path.Combine(dir, "ffmpeg.exe");
                if (File.Exists(dst) && new FileInfo(dst).Length > 100000) return dst;
                var asm = System.Reflection.Assembly.GetExecutingAssembly();
                using var s = asm.GetManifestResourceStream("GreenRhino.ffmpeg.exe");
                if (s == null) { App.Log("内嵌 ffmpeg 资源缺失"); return null; }
                using var f = new FileStream(dst, FileMode.Create, FileAccess.Write);
                s.CopyTo(f);
                App.Log("已释放内置 ffmpeg: " + dst);
                return dst;
            }
            catch (Exception ex) { App.Log("ffmpeg 释放失败: " + ex.Message); return null; }
        }

        // ---------- 视频片段剪辑（前端「生成片段」） ----------
        // 用内置 ffmpeg 从本地视频按 [start,end) 秒重编码切段，保存到「视频/影音先锋剪辑」，成功后回传路径。
        private void MakeClip(string src, string start, string end)
        {
            try
            {
                if (string.IsNullOrEmpty(src) || !File.Exists(src))
                {
                    PostCast(new { type = "clipResult", ok = false, msg = "无法定位源文件，仅支持本地视频生成片段" });
                    return;
                }
                var ci = CultureInfo.InvariantCulture;
                if (!double.TryParse(start, NumberStyles.Float, ci, out var a) ||
                    !double.TryParse(end, NumberStyles.Float, ci, out var b) || b <= a)
                {
                    PostCast(new { type = "clipResult", ok = false, msg = "请先设置有效的 A/B 点" });
                    return;
                }
                var ff = EnsureFfmpeg();
                if (string.IsNullOrEmpty(ff)) { PostCast(new { type = "clipResult", ok = false, msg = "未找到内置 ffmpeg" }); return; }

                var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyVideos), "影音先锋剪辑");
                Directory.CreateDirectory(dir);
                var outPath = Path.Combine(dir,
                    $"片段_{Path.GetFileNameWithoutExtension(src)}_{DateTime.Now:yyyyMMdd_HHmmss}.mp4");

                var args = $"-y -ss {a.ToString("0.###", ci)} -to {b.ToString("0.###", ci)} -i \"{src}\" " +
                           $"-c:v libx264 -preset veryfast -crf 23 -c:a aac -movflags +faststart \"{outPath}\"";
                App.Log("clip: " + args);
                var psi = new System.Diagnostics.ProcessStartInfo(ff, args)
                {
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };
                using var proc = System.Diagnostics.Process.Start(psi);
                proc.BeginOutputReadLine(); // 排空 stdout，避免管道缓冲填满阻塞
                var err = proc.StandardError.ReadToEnd();
                if (!proc.WaitForExit(120000))
                {
                    try { proc.Kill(); } catch { }
                    PostCast(new { type = "clipResult", ok = false, msg = "片段生成超时" });
                    return;
                }
                if (proc.ExitCode != 0 || !File.Exists(outPath))
                {
                    App.Log("clip 失败: " + (err ?? "").Trim());
                    PostCast(new { type = "clipResult", ok = false, msg = "片段生成失败，请检查视频是否损坏" });
                    return;
                }
                PostCast(new { type = "clipResult", ok = true, path = outPath, size = new FileInfo(outPath).Length });
            }
            catch (Exception ex)
            {
                App.Log("clip 异常: " + ex.Message);
                PostCast(new { type = "clipResult", ok = false, msg = "片段生成异常: " + ex.Message });
            }
        }

        // ---------- 注册为系统默认媒体播放器 ----------
        private (bool ok, string error) SetAsDefaultPlayer()
        {
            try
            {
                // 单文件发布时 Assembly.Location 返回空字符串，必须用 Environment.ProcessPath 取真实 exe 路径
                var exe = Environment.ProcessPath ?? (AppContext.BaseDirectory.TrimEnd('\\') + "\\GreenRhino.exe");
                var progId = "GreenRhino.MediaFile";

                // 1) 写 ProgID + 打开命令 + 图标 + Capabilities（结构注册，必须）
                using (var pk = Registry.CurrentUser.CreateSubKey(@"Software\Classes\" + progId))
                {
                    pk.SetValue("", "绿角犀媒体文件");
                    pk.SetValue("FriendlyTypeName", "绿角犀媒体文件");
                    pk.SetValue("DefaultIcon", "\"" + exe + "\",0");
                    using (var cmd = pk.CreateSubKey(@"shell\open\command"))
                        cmd.SetValue("", "\"" + exe + "\" \"%1\"");
                    using (var cap = pk.CreateSubKey("Capabilities"))
                    {
                        cap.SetValue("ApplicationName", "绿角犀播放器");
                        cap.SetValue("ApplicationDescription", "离线音乐/视频播放器");
                        using (var fa = cap.CreateSubKey("FileAssociations"))
                            foreach (var ext in MediaExts) fa.SetValue(ext, progId);
                    }
                }
                using (var reg = Registry.CurrentUser.CreateSubKey(@"Software\RegisteredApplications"))
                    reg.SetValue("GreenRhino", @"Software\Classes\" + progId + @"\Capabilities");
                // 2) 注册到「打开方式」列表。
                // Windows 的"打开方式"主要读 Applications\<exe> + 各扩展名的
                // OpenWithList / OpenWithProgids；只写扩展名默认值是不够的——
                // 那样双击可能生效，但"打开方式"里压根看不到本程序。
                var exeName = Path.GetFileName(exe);   // GreenRhino.exe
                using (var app = Registry.CurrentUser.CreateSubKey(@"Software\Classes\Applications\" + exeName))
                {
                    app.SetValue("FriendlyAppName", "绿角犀播放器");
                    app.SetValue("DefaultIcon", "\"" + exe + "\",0");
                    using (var cmd = app.CreateSubKey(@"shell\open\command"))
                        cmd.SetValue("", "\"" + exe + "\" \"%1\"");
                    using (var st = app.CreateSubKey("SupportedTypes"))
                        foreach (var ext in MediaExts) st.SetValue(ext, "");
                }

                // 3) 每个扩展名：默认值指向 ProgID（无 UserChoice 时即生效），
                //    并加进 OpenWithList / OpenWithProgids 让它出现在"打开方式"里
                foreach (var ext in MediaExts)
                {
                    using var ek = Registry.CurrentUser.CreateSubKey(@"Software\Classes\" + ext);
                    ek.SetValue("", progId);
                    using (var owl = ek.CreateSubKey("OpenWithList"))
                        owl.SetValue(exeName, "");
                    using (var owp = ek.CreateSubKey("OpenWithProgids"))
                        owp.SetValue(progId, "");
                }

                // 4) 用官方 COM 接口设为默认（正确处理 UserChoice 哈希，覆盖已设默认的情况）
                try { SetAppAsDefaultViaCom("GreenRhino"); }
                catch (Exception ex) { System.Diagnostics.Debug.WriteLine("SetAppAsDefault COM 失败: " + ex.Message); }

                NotifyShell();
                return (true, null);
            }
            catch (Exception ex)
            {
                return (false, "注册失败：" + ex.Message);
            }
        }

        [ComImport, Guid("4e530b0a-e611-4c77-a3ac-9031d922e753"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IApplicationAssociationRegistration
        {
            // IUnknown 的前三个方法（QueryInterface/AddRef/Release）由运行时隐式提供
            void SetAppAsDefault([MarshalAs(UnmanagedType.LPWStr)] string pszAppRegistryName,
                                  [MarshalAs(UnmanagedType.LPWStr)] string pszAppMode,
                                  int atSetType);
            // 一次性把本程序在 Capabilities/FileAssociations 中声明的所有扩展设为默认（正确处理 UserChoice 哈希）
            void SetAppAsDefaultAll([MarshalAs(UnmanagedType.LPWStr)] string pszAppRegistryName);
        }

        private static void SetAppAsDefaultViaCom(string appName)
        {
            var type = Type.GetTypeFromProgID("ApplicationAssociationRegistration");
            if (type == null) throw new InvalidOperationException("找不到 ApplicationAssociationRegistration");
            var obj = Activator.CreateInstance(type);
            var reg = (IApplicationAssociationRegistration)obj;
            try { reg.SetAppAsDefaultAll(appName); }
            catch { reg.SetAppAsDefault(appName, "", 0); } // 兜底：旧系统无 SetAppAsDefaultAll 时回退
        }

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        private const int SW_RESTORE = 9;

        [DllImport("shell32.dll")]
        private static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
        private static void NotifyShell()
        {
            try { SHChangeNotify(0x08000000 /*SHCNE_ASSOCCHANGED*/, 0, IntPtr.Zero, IntPtr.Zero); } catch { }
        }

        // ---------- 窗口关闭语义 ----------
        // 任一窗点 ✕ 只最小化到托盘（后台继续放歌/放片）；只有托盘「退出」经 WindowHost.ExitAll
        // 置 ForceClose 后才真正逐窗关闭、进程退出。
        protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
        {
            if (!WindowHost.ForceClose)
            {
                e.Cancel = true;
                Hide();
                // 只由 Hub 提示一次托盘即将常驻，避免多个窗口同时弹气球条
                if (_role == WindowRole.Hub)
                {
                    try
                    {
                        WindowHost.Tray?.ShowBalloonTip(3000, "绿角犀播放器",
                            "已最小化到后台，点击托盘图标可恢复窗口", System.Windows.Forms.ToolTipIcon.Info);
                    }
                    catch { }
                }
                return;
            }
            base.OnClosing(e);
        }

        protected override void OnClosed(EventArgs e)
        {
            IsClosed = true;
            // 仅清理本窗口自身的资源：blob 写入器、原生视频、WebView2、注册表登记。
            // 共享的 LocalServer / 托盘 / WebView2 环境由进程级 WindowHost 统一持有，
            // 在 App.OnExit 一次性收尾（最后一个窗口关闭前绝不能停，否则其它窗口立刻失效）。
            try { foreach (var w in _videoBlobWriters.Values) { try { w.Fs?.Dispose(); } catch { } } } catch { }
            _videoBlobWriters.Clear();
            try { NativeVideo.Stop(); NativeVideo.Source = null; } catch { }
            try { webView.Dispose(); } catch { }
            WindowHost.Unregister(_role, this);
            base.OnClosed(e);
        }
    }
}

using System;
using System.Collections.Generic;
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
        private readonly LocalServer _server = new LocalServer();
        private readonly DlnaCaster _caster = new DlnaCaster();

        // 系统托盘图标（关闭窗口时最小化到后台，只有托盘菜单「退出」才真正关闭）
        private System.Windows.Forms.NotifyIcon _tray;
        private bool _forceClose;

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

        // Blob 视频（库内/拖入，无本地路径）兜底：web 把字节分片传来，C# 写入临时文件后交给原生 MediaElement
        private readonly Dictionary<string, FileStream> _videoBlobWriters = new Dictionary<string, FileStream>();
        private static string VideoCacheDir() =>
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GreenRhino", "video-cache");

        public MainWindow()
        {
            InitializeComponent();
            // 解析命令行参数：系统双击文件会以 "GreenRhino.exe \"路径\"" 启动
            EnqueuePaths(Environment.GetCommandLineArgs().Skip(1));
            // 初始化系统托盘（关闭 -> 最小化到后台）
            SetupTray();
            // 原生视频兜底层控制条接线
            WireNativeVideo();
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

            // 单文件发布下，WebView2Loader.dll 位于 runtimes/win-x64/native 或根目录，
            // 需加入 PATH 才能被 WebView2 控件加载（否则静默失败、窗口空白）
            var baseDir = (AppContext.BaseDirectory ?? ".").TrimEnd('\\');
            var nativeDir = Path.Combine(baseDir, "runtimes", "win-x64", "native");
            var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
            var add = "";
            if (Directory.Exists(nativeDir) && !pathEnv.Contains(nativeDir, StringComparison.OrdinalIgnoreCase))
                add += nativeDir + ";";
            if (Directory.Exists(baseDir) && !pathEnv.Contains(baseDir, StringComparison.OrdinalIgnoreCase))
                add += baseDir + ";";
            if (add.Length > 0)
                Environment.SetEnvironmentVariable("PATH", add + pathEnv);

            int port = _server.Start();                 // 启动内嵌本地服务（托管 wwwroot 中的 PWA）
            App.Log("内嵌服务已启动 port=" + port);
            try
            {
                // 视频黑屏有声音根因：WebView2 视频用独立 DirectComposition overlay 表面，在 WPF 下常不被提交到窗口。
                // 默认启用硬件渲染（Intel Arc 等真显卡 + 现代 WebView2 下最可靠）；
                // 命令行加 --disable-gpu / --no-gpu 可退回软件合成（个别无 GPU / 虚拟机环境渲染异常时用）。
                // 另禁用 CalculateNativeWinOcclusion：该特性在窗口被遮挡（如远程/虚拟显示器）时
                // 会错误停用视频合成层，是「有声音无画面」的已知元凶。
                // 视频「花屏」修复：默认加 --disable-accelerated-video-decode 禁用硬件视频解码。
                // Intel Arc + Oray 虚拟显示器（向日葵等远程）组合下，GPU 硬解的视频帧经虚拟显示
                // 合成会渲染成花屏/花屏噪点；改用软件解码（FFmpeg）稳定，1080p 解码开销可忽略。
                // 视频花屏最终兜底：本机为 Intel Arc + Oray 虚拟显示器（向日葵等远程）组合，
                // GPU 硬件合成与硬解都会花屏，整体禁用 GPU（--disable-gpu）退回纯软件渲染最可靠。
                // （软件渲染 1080p 视频无压力，代价仅是合成略耗 CPU。）
                string gpuArg = " --disable-gpu";
                string featArg = " --disable-features=CalculateNativeWinOcclusion";
                string vdecArg = " --disable-accelerated-video-decode";
                App.Log("GPU 模式：禁用 GPU 纯软件渲染（Intel Arc + 虚拟显示器花屏兜底）");
                var opts = new CoreWebView2EnvironmentOptions
                {
                    AdditionalBrowserArguments = "--autoplay-policy=no-user-gesture-required" + gpuArg + featArg + vdecArg
                };
                var userData = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "GreenRhino", "wv2data");
                CoreWebView2Environment env = null;

                // 优先用随附的 webview2-runtime 文件夹（文件夹版发布时一并发放，彻底不依赖系统 WebView2）；
                // 没有就从内嵌资源解压；再没有就用系统 WebView2。
                var rt = ExtractWebView2Runtime();
                if (rt != null)
                {
                    try
                    {
                        env = await CoreWebView2Environment.CreateAsync(rt, userData, opts);
                        App.Log("WebView2 环境：使用随附/内嵌运行时 " + rt);
                    }
                    catch (Exception ex) { App.Log("随附运行时创建失败: " + ex.Message); env = null; }
                }
                if (env == null)
                {
                    try
                    {
                        env = await CoreWebView2Environment.CreateAsync(null, userData, opts);
                        App.Log("WebView2 环境：使用系统运行时");
                    }
                    catch (Exception ex) { App.Log("系统 WebView2 创建失败: " + ex.Message); env = null; }
                }

                if (env != null) await webView.EnsureCoreWebView2Async(env);
                else await webView.EnsureCoreWebView2Async();
                App.Log("CoreWebView2 初始化完成");
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

        /// <summary>
        /// 解析 WebView2 运行时目录：
        /// 1) 优先用 exe 同级的 webview2-runtime 文件夹（文件夹版发布随附，最稳）；
        /// 2) 否则从内嵌 webview2rt.zip 解压到本地缓存（单文件版）；
        /// 3) 都没有返回 null（调用方退回系统 WebView2）。
        /// </summary>
        private static string ExtractWebView2Runtime()
        {
            try
            {
                // 1) 同级文件夹
                var sibling = Path.Combine(AppContext.BaseDirectory, "webview2-runtime");
                if (Directory.Exists(sibling) && File.Exists(Path.Combine(sibling, "msedge.exe")))
                {
                    App.Log("wvrt: 使用同级文件夹 " + sibling);
                    return sibling;
                }
                // 2) 内嵌资源解压（单文件版）
                var baseDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "GreenRhino", "wvrt");
                var marker = Path.Combine(baseDir, "version.txt");
                var asm = System.Reflection.Assembly.GetExecutingAssembly();
                var resName = asm.GetManifestResourceNames()
                    .FirstOrDefault(n => n.EndsWith("webview2rt.zip", StringComparison.OrdinalIgnoreCase));
                if (resName == null) { App.Log("wvrt: 无内嵌运行时资源，退回系统"); return null; }
                if (File.Exists(marker))
                {
                    App.Log("wvrt: 已解压，复用 " + baseDir);
                    return baseDir;
                }
                App.Log("wvrt: 首次解压内嵌运行时 -> " + baseDir);
                Directory.CreateDirectory(baseDir);
                using var stream = asm.GetManifestResourceStream(resName);
                if (stream == null) { App.Log("wvrt: 资源流为空"); return null; }
                using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
                archive.ExtractToDirectory(baseDir);
                File.WriteAllText(marker, "151.0.4129.107");
                App.Log("wvrt: 解压完成");
                return baseDir;
            }
            catch (Exception ex) { App.Log("wvrt 解析失败: " + ex.Message); return null; }
        }

        private bool _autoRegisterChecked;

        private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            _pageReady = true;
            // 诊断：console 转发 / onerror / hostOpen 状态已在 AddScriptToExecuteOnDocumentCreatedAsync 安装一次，
            // 这里【不再覆盖 console】（重复包裹会导致 "Maximum call stack size exceeded"，令 ES module 加载失败）。
            FlushPendingFiles();
            // 首次运行就自动注册为默认播放器（用户要求"装好即默认"），只尝试一次
            if (!_autoRegisterChecked)
            {
                _autoRegisterChecked = true;
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
                var items = _server.RegisterExternalFiles(files);
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
                        var devs = await _caster.DiscoverAsync(4000);
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
                        await _caster.Play(deviceId, uri);
                        PostCast(new { type = "cast:status", deviceId, state = "playing" });
                    });
                }
                else if (type == "cast:stop")
                {
                    string deviceId = Str(root, "deviceId");
                    _ = Task.Run(async () =>
                    {
                        await _caster.Stop(deviceId);
                        PostCast(new { type = "cast:status", deviceId, state = "stopped" });
                    });
                }
                else if (type == "cast:pause")
                {
                    string deviceId = Str(root, "deviceId");
                    _ = Task.Run(async () =>
                    {
                        await _caster.Pause(deviceId);
                        PostCast(new { type = "cast:status", deviceId, state = "paused" });
                    });
                }
                else if (type == "cast:seek")
                {
                    string deviceId = Str(root, "deviceId");
                    string pos = Str(root, "pos");
                    _ = Task.Run(async () =>
                    {
                        await _caster.Seek(deviceId, pos);
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
                        var safeId = new string(id.Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_').ToArray());
                        if (string.IsNullOrEmpty(safeId)) safeId = "vid";
                        var fname = safeId + (string.IsNullOrEmpty(ext) ? ".mp4" : "." + ext.TrimStart('.').ToLowerInvariant());
                        var path = Path.Combine(dir, fname);
                        var bytes = Convert.FromBase64String(data);
                        FileStream fs;
                        if (!_videoBlobWriters.TryGetValue(id, out fs))
                        {
                            fs = new FileStream(path, FileMode.Create, FileAccess.Write);
                            _videoBlobWriters[id] = fs;
                        }
                        fs.Write(bytes, 0, bytes.Length);
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
                        if (_videoBlobWriters.TryGetValue(id, out var fs))
                        {
                            fs.Dispose();
                            _videoBlobWriters.Remove(id);
                        }
                        var dir = VideoCacheDir();
                        var safeId = new string(id.Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_').ToArray());
                        if (string.IsNullOrEmpty(safeId)) safeId = "vid";
                        var fname = safeId + (string.IsNullOrEmpty(ext) ? ".mp4" : "." + ext.TrimStart('.').ToLowerInvariant());
                        var path = Path.Combine(dir, fname);
                        if (File.Exists(path) && MediaExts.Contains(Path.GetExtension(path)))
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
            }
            catch { /* 忽略无法解析的消息 */ }
        }

        private static string Str(System.Text.Json.JsonElement root, string name)
        {
            if (root.TryGetProperty(name, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.String) return v.GetString();
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
                NativeVideo.Stop();
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
        // 同一源文件并发去重：web 端黑屏看门狗可能在转码期间反复上报 videoTranscode，
        // 若每个消息都启动一个 ffmpeg 进程，同一文件会同时转码几十遍，CPU 直接被拉满。
        private static readonly HashSet<string> _transcoding = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private static readonly object _transLock = new object();

        private void TranscodeAndPlay(string src)
        {
            lock (_transLock)
            {
                if (_transcoding.Contains(src)) return; // 已在转码中（或刚完成），忽略并发重复请求
                _transcoding.Add(src);
            }
            try
            {
                var dst = TranscodeToH264(src);
                Dispatcher.Invoke(() =>
                {
                    if (string.IsNullOrEmpty(dst))
                    {
                        PostCast(new { type = "transcodeFailed", reason = "视频转码失败，请改用 H.264 编码的 MP4。" });
                        return;
                    }
                    // 转码成功：把 H.264 文件登记进内嵌服务，交由 web 端 <video> 直接播放。
                    // 【不再用原生 MediaElement】：WebView2 的 HWND 永远盖在 WPF 控件之上（airspace），
                    // 原生视频即使打开也会被遮挡，表现为「有声音、无画面」；而转码后的 H.264
                    // WebView2 原生可解码，在页面内播放即可正常出图。
                    var token = _server.RegisterExternalFile(dst);
                    if (!string.IsNullOrEmpty(token))
                    {
                        var url = $"http://127.0.0.1:{_server.Port}/api/external?t={token}";
                        App.Log("转码完成，交由 web 播放: " + url);
                        PostCast(new { type = "transcodeReady", url, path = dst });
                    }
                    else
                    {
                        App.Log("转码完成但登记失败: " + dst);
                        PostCast(new { type = "transcodeFailed", reason = "视频转码后无法登记播放，请改用 H.264 编码的 MP4。" });
                    }
                });
            }
            finally
            {
                lock (_transLock) _transcoding.Remove(src);
            }
        }

        private string TranscodeToH264(string src)
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
                psi.ArgumentList.Add("error");
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
                psi.ArgumentList.Add("-movflags");
                psi.ArgumentList.Add("+faststart");
                psi.ArgumentList.Add(dst);
                using var proc = System.Diagnostics.Process.Start(psi);
                if (proc == null) return null;
                var errTask = proc.StandardError.ReadToEndAsync();
                if (!proc.WaitForExit(300000))
                {
                    try { proc.Kill(); } catch { }
                    App.Log("ffmpeg 转码超时: " + src);
                    return null;
                }
                var err = errTask.Result;
                if (proc.ExitCode == 0 && File.Exists(dst) && new FileInfo(dst).Length > 0)
                {
                    App.Log("转码完成: " + dst);
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

        // ---------- 系统托盘：关闭窗口 -> 最小化到后台 ----------
        private void SetupTray()
        {
            try
            {
                var exe = Environment.ProcessPath ?? (AppContext.BaseDirectory.TrimEnd('\\') + "\\GreenRhino.exe");
                System.Drawing.Icon icon = null;
                try { icon = System.Drawing.Icon.ExtractAssociatedIcon(exe); } catch { icon = null; }

                _tray = new System.Windows.Forms.NotifyIcon
                {
                    Icon = icon,
                    Text = "绿角犀播放器",
                    Visible = true
                };

                var menu = new System.Windows.Forms.ContextMenuStrip();
                var showItem = new System.Windows.Forms.ToolStripMenuItem("显示窗口");
                showItem.Click += (s, e) => Dispatcher.Invoke(BringToFront);
                var exitItem = new System.Windows.Forms.ToolStripMenuItem("退出");
                exitItem.Click += (s, e) => { _forceClose = true; Close(); };
                menu.Items.Add(showItem);
                menu.Items.Add(exitItem);
                _tray.ContextMenuStrip = menu;

                // 左键 / 双击托盘图标：恢复窗口
                _tray.MouseClick += (s, e) =>
                {
                    if (e.Button == System.Windows.Forms.MouseButtons.Left) Dispatcher.Invoke(BringToFront);
                };
                _tray.DoubleClick += (s, e) => Dispatcher.Invoke(BringToFront);
            }
            catch { /* 托盘创建失败不应影响主功能 */ }
        }

        protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
        {
            // 非真正退出：取消关闭，隐藏到后台（任务栏按钮也消失，只留托盘图标）
            if (!_forceClose)
            {
                e.Cancel = true;
                Hide();
                try { _tray?.ShowBalloonTip(3000, "绿角犀播放器", "已最小化到后台，点击托盘图标可恢复", System.Windows.Forms.ToolTipIcon.Info); } catch { }
                return;
            }
            base.OnClosing(e);
        }

        protected override void OnClosed(EventArgs e)
        {
            try { foreach (var fs in _videoBlobWriters.Values) { try { fs.Dispose(); } catch { } } } catch { }
            try { _tray?.Dispose(); } catch { }
            _server.Stop();
            base.OnClosed(e);
        }
    }
}

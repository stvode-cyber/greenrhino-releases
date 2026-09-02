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
                // 默认 --disable-gpu 强制软件合成，视频帧落到页面软件合成层正常显示。
                // 命令行加 --gpu / --enable-gpu 可切回硬件渲染（极少数机器软件渲染异常时用）。
                var cli = Environment.GetCommandLineArgs();
                bool enableGpu = cli.Any(a => a == "--gpu" || a == "--enable-gpu");
                string gpuArg = enableGpu ? "" : " --disable-gpu";
                if (enableGpu) App.Log("GPU 模式：用户以 --gpu 显式启用硬件渲染");
                else App.Log("GPU 模式：默认禁用(--disable-gpu)，软件合成以修复视频黑屏");
                var opts = new CoreWebView2EnvironmentOptions
                {
                    AdditionalBrowserArguments = "--autoplay-policy=no-user-gesture-required" + gpuArg
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
            // 让 web 端「我的云盘」指向内嵌本机服务（同源，零 CORS）；GR_HOST 标记原生壳
            _ = webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                "window.GR_CLOUD_BASE='http://127.0.0.1:" + port + "';window.GR_HOST=true;");
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
                _ = webView.CoreWebView2.ExecuteScriptAsync("window.__hostOpen && window.__hostOpen(" + json + ")");
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

                if (type == "setDefault")
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
                    // WebView2 视频黑屏有声音：web 看门狗确认无帧后通知 C#。
                    // 若当前视频是本地文件（双击/外部打开），直接用原生 MediaElement 播放，绕开 WebView2 overlay。
                    string p = Str(root, "path");
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
            try { _tray?.Dispose(); } catch { }
            _server.Stop();
            base.OnClosed(e);
        }
    }
}

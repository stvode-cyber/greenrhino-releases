using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Microsoft.Win32;

namespace GreenRhino
{
    public partial class MainWindow : Window
    {
        private readonly LocalServer _server = new LocalServer();

        // 支持双击/默认打开的音频与视频扩展名
        private static readonly HashSet<string> MediaExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            ".mp3", ".flac", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".wma", ".mp2", ".mp1", ".aiff", ".mka",
            ".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v", ".ogv", ".ts", ".flv", ".wmv"
        };

        // 待交给页面播放的文件（含兄弟 .lrc）。
        // 页面加载完成前先入队，加载完成后统一 flush；
        // 后续实例经管道转发过来的文件也走这里，所以不能只在启动时读一次命令行。
        private readonly List<string> _pendingFiles = new();
        private bool _pageReady;

        public MainWindow()
        {
            InitializeComponent();
            // 解析命令行参数：系统双击文件会以 "GreenRhino.exe \"路径\"" 启动
            EnqueuePaths(Environment.GetCommandLineArgs().Skip(1));
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
            try
            {
                // 允许双击打开文件后自动播放（避免自动播放策略拦截）
                CoreWebView2Environment env = null;
                try
                {
                    var opts = new CoreWebView2EnvironmentOptions
                    {
                        AdditionalBrowserArguments = "--autoplay-policy=no-user-gesture-required"
                    };
                    env = await CoreWebView2Environment.CreateAsync(null, null, opts);
                }
                catch { env = null; }
                if (env != null) await webView.EnsureCoreWebView2Async(env);
                else await webView.EnsureCoreWebView2Async();
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "WebView2 初始化失败。请先安装 WebView2 运行时（约一次，Win11 通常已自带）：\n" +
                    "https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/\n\n" +
                    "错误详情：" + ex.Message,
                    "绿角犀播放器", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }
            // 允许 PWA 的 beforeinstallprompt / 媒体权限
            webView.CoreWebView2.Settings.IsWebMessageEnabled = true;
            webView.CoreWebView2.Settings.AreDefaultScriptDialogsEnabled = true;
            webView.CoreWebView2.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            // web -> 原生 消息（如「设为默认播放器」）
            webView.CoreWebView2.WebMessageReceived += OnWebMessage;
            // 页面加载完成后，把双击传入的文件交给 web 层打开并播放
            webView.CoreWebView2.NavigationCompleted += OnNavigationCompleted;
            webView.Source = new Uri($"http://127.0.0.1:{port}/");
        }

        private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            _pageReady = true;
            FlushPendingFiles();
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

        // web 请求「设为系统默认播放器」
        private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            var msg = e.TryGetWebMessageAsString();
            if (string.IsNullOrEmpty(msg)) return;
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(msg);
                if (doc.RootElement.TryGetProperty("type", out var t) && t.GetString() == "setDefault")
                {
                    var (ok, err) = SetAsDefaultPlayer();
                    var res = System.Text.Json.JsonSerializer.Serialize(new
                    {
                        type = "setDefaultResult",
                        ok,
                        msg = err ?? "已设为默认播放器，可双击音频/视频文件直接打开"
                    });
                    webView.CoreWebView2.PostWebMessageAsString(res);
                }
            }
            catch { /* 忽略无法解析的消息 */ }
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

        protected override void OnClosed(EventArgs e)
        {
            _server.Stop();
            base.OnClosed(e);
        }
    }
}

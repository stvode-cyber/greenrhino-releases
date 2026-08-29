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

        // 启动参数中传入的媒体文件（含兄弟 .lrc），双击文件时填充
        private readonly List<string> _launchFiles = new();

        public MainWindow()
        {
            InitializeComponent();
            // 解析命令行参数：系统双击文件会以 "GreenRhino.exe \"路径\"" 启动
            var args = Environment.GetCommandLineArgs().Skip(1).ToArray();
            foreach (var a in args)
            {
                try
                {
                    if (File.Exists(a) && MediaExts.Contains(Path.GetExtension(a)))
                    {
                        _launchFiles.Add(a);
                        // 顺带带上同名 .lrc（离线歌词自动匹配复用 importFiles 逻辑）
                        var lrc = Path.ChangeExtension(a, ".lrc");
                        if (File.Exists(lrc)) _launchFiles.Add(lrc);
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
            if (_launchFiles.Count == 0) return;
            var items = _server.RegisterExternalFiles(_launchFiles);
            if (items.Count == 0) return;
            var json = System.Text.Json.JsonSerializer.Serialize(items);
            _ = webView.CoreWebView2.ExecuteScriptAsync("window.__hostOpen && window.__hostOpen(" + json + ")");
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
                // 直接把每个扩展名默认指向我们的 ProgID（无 UserChoice 时即生效）
                foreach (var ext in MediaExts)
                {
                    using var ek = Registry.CurrentUser.CreateSubKey(@"Software\Classes\" + ext);
                    ek.SetValue("", progId);
                }

                // 2) 用官方 COM 接口设为默认（正确处理 UserChoice 哈希，覆盖已设默认的情况）
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

using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace GreenRhino
{
    /// <summary>
    /// 进程级共享单例：多窗口共用同一个 LocalServer / 托盘 / WebView2 环境 / 转码去重。
    /// 所有窗口必须经 GuaranteeEnvAsync 拿到同一个 CoreWebView2Environment（同进程对同一
    /// user-data-folder 只能创建一个），从而共享媒体库 / 设置 / 播放进度。
    /// </summary>
    public static class WindowHost
    {
        private static readonly object _lock = new object();
        private static readonly object _serverLock = new object();

        // ---- 共享服务（只启动/停一次） ----
        private static LocalServer _server = new LocalServer();
        private static DlnaCaster _caster = new DlnaCaster();
        private static bool _serverStarted;
        private static int _port;
        public static LocalServer Server => _server;
        public static DlnaCaster Caster => _caster;
        public static int Port => _port;
        public static int EnsureServer()
        {
            lock (_serverLock)
            {
                if (!_serverStarted) { _serverStarted = true; _port = _server.Start(); }
            }
            return _port;
        }
        public static void StopServer()
        {
            try { _server.Stop(); } catch { }
        }

        // ---- 共享 WebView2 环境（唯一） ----
        private static Task<CoreWebView2Environment> _envTask;
        private static bool _envStarted;
        public static Task<CoreWebView2Environment> GuaranteeEnvAsync()
        {
            lock (_lock)
            {
                if (!_envStarted) { _envStarted = true; _envTask = BuildEnvAsync(); }
            }
            return _envTask;
        }

        private static async Task<CoreWebView2Environment> BuildEnvAsync()
        {
            try
            {
                // 单文件发布：WebView2Loader.dll 位于 runtimes/win-x64/native 或根目录，需加入 PATH
                var baseDir = (AppContext.BaseDirectory ?? ".").TrimEnd('\\');
                var nativeDir = Path.Combine(baseDir, "runtimes", "win-x64", "native");
                var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
                var add = "";
                if (Directory.Exists(nativeDir) && !pathEnv.Contains(nativeDir, StringComparison.OrdinalIgnoreCase)) add += nativeDir + ";";
                if (Directory.Exists(baseDir) && !pathEnv.Contains(baseDir, StringComparison.OrdinalIgnoreCase)) add += baseDir + ";";
                if (add.Length > 0) Environment.SetEnvironmentVariable("PATH", add + pathEnv);

                var userData = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GreenRhinoMusic", "wv2data");
                var opts = new CoreWebView2EnvironmentOptions
                {
                    AdditionalBrowserArguments =
                        "--autoplay-policy=no-user-gesture-required --disable-gpu --disable-features=CalculateNativeWinOcclusion --disable-accelerated-video-decode"
                };
                App.Log("GPU 模式：禁用 GPU 纯软件渲染（Intel Arc + 虚拟显示器花屏兜底）");

                var rt = ExtractWebView2Runtime();
                if (rt != null)
                {
                    try { return await CoreWebView2Environment.CreateAsync(rt, userData, opts); }
                    catch (Exception ex) { App.Log("随附运行时创建失败: " + ex.Message); }
                }
                try { return await CoreWebView2Environment.CreateAsync(null, userData, opts); }
                catch (Exception ex) { App.Log("系统 WebView2 创建失败: " + ex.Message); }
                return null;
            }
            catch (Exception ex) { App.Log("WebView2 环境初始化失败: " + ex.Message); return null; }
        }

        /// <summary>解析 WebView2 运行时目录（优先级：同级文件夹 > 内嵌资源 > null）。</summary>
        private static string ExtractWebView2Runtime()
        {
            try
            {
                var sibling = Path.Combine(AppContext.BaseDirectory, "webview2-runtime");
                if (Directory.Exists(sibling) && File.Exists(Path.Combine(sibling, "msedge.exe")))
                {
                    App.Log("wvrt: 使用同级文件夹 " + sibling);
                    return sibling;
                }
                var baseDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GreenRhinoMusic", "wvrt");
                var marker = Path.Combine(baseDir, "version.txt");
                var asm = System.Reflection.Assembly.GetExecutingAssembly();
                var resName = asm.GetManifestResourceNames()
                    .FirstOrDefault(n => n.EndsWith("webview2rt.zip", StringComparison.OrdinalIgnoreCase));
                if (resName == null) { App.Log("wvrt: 无内嵌运行时资源，退回系统"); return null; }
                if (File.Exists(marker)) { App.Log("wvrt: 已解压，复用 " + baseDir); return baseDir; }
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

        // ---- 托盘 / 退出 ----
        private static System.Windows.Forms.NotifyIcon _tray;
        public static bool ForceClose;
        public static System.Windows.Forms.NotifyIcon Tray => _tray;
        public static MainWindow HubWindow;

        public static void SetupTray()
        {
            try
            {
                var exe = Environment.ProcessPath ?? (AppContext.BaseDirectory.TrimEnd('\\') + "\\GreenRhinoMusic.exe");
                System.Drawing.Icon icon = null;
                try { icon = System.Drawing.Icon.ExtractAssociatedIcon(exe); } catch { icon = null; }

                _tray = new System.Windows.Forms.NotifyIcon
                {
                    Icon = icon,
                    Text = "绿角犀音乐",
                    Visible = true
                };

                var menu = new System.Windows.Forms.ContextMenuStrip();
                var showItem = new System.Windows.Forms.ToolStripMenuItem("显示窗口");
                showItem.Click += (s, e) => DispatcherInvoke(() => { if (HubWindow != null) HubWindow.BringToFront(); });
                var exitItem = new System.Windows.Forms.ToolStripMenuItem("退出");
                exitItem.Click += (s, e) => ExitAll();
                menu.Items.Add(showItem);
                menu.Items.Add(exitItem);
                _tray.ContextMenuStrip = menu;

                _tray.MouseClick += (s, e) =>
                {
                    if (e.Button == System.Windows.Forms.MouseButtons.Left)
                        DispatcherInvoke(() => { if (HubWindow != null) HubWindow.BringToFront(); });
                };
                _tray.DoubleClick += (s, e) => DispatcherInvoke(() => { if (HubWindow != null) HubWindow.BringToFront(); });
            }
            catch { }
        }

        public static void ExitAll()
        {
            ForceClose = true;
            List<MainWindow> snaps;
            lock (_lock) { snaps = Windows.Values.Where(w => w != null).ToList(); }
            var app = Application.Current;
            DispatcherInvoke(() => { foreach (var w in snaps) { try { w.Close(); } catch { } } });
            try { app?.Shutdown(); } catch { }
        }

        private static void DispatcherInvoke(Action act)
        {
            try
            {
                var app = Application.Current;
                if (app == null) { act(); return; }
                if (app.Dispatcher.CheckAccess()) act();
                else app.Dispatcher.Invoke(act);
            }
            catch { }
        }

        // ---- 转码去重（进程级：两窗勿对同一文件并发转码） ----
        private static readonly object _transLock = new object();
        private static readonly HashSet<string> _transcoding = new HashSet<string>();
        public static bool BeginTranscode(string src) { lock (_transLock) { if (_transcoding.Contains(src)) return false; _transcoding.Add(src); return true; } }
        public static void EndTranscode(string src) { lock (_transLock) { _transcoding.Remove(src); } }

        // ---- 自动注册默认播放器（整进程只尝试一次） ----
        public static bool AutoChecked;
        public static bool AutoCheckedTestAndSet() { lock (_lock) { if (AutoChecked) return false; AutoChecked = true; return true; } }

        // ---- 窗口注册表 ---- 
        private static readonly Dictionary<WindowRole, MainWindow> Windows = new Dictionary<WindowRole, MainWindow>();

        public static MainWindow OpenOrFocus(WindowRole role, IEnumerable<string> files = null)
        {
            MainWindow win;
            lock (_lock) { Windows.TryGetValue(role, out win); }
            if (win != null && !win.IsClosed)
            {
                HubWindow = win;
                if (files != null) win.OpenExternalFiles(files);
                win.BringToFront();
                return win;
            }

            var created = (MainWindow)Application.Current.Dispatcher.Invoke(() =>
            {
                var w = new MainWindow(role);
                lock (_lock) { Windows[role] = w; }
                HubWindow = w;
                w.Show();
                return w;
            });
            if (files != null) created.OpenExternalFiles(files);
            return created;
        }

        public static void Unregister(WindowRole role, MainWindow win)
        {
            lock (_lock)
            {
                if (Windows.TryGetValue(role, out var w) && ReferenceEquals(w, win)) Windows.Remove(role);
            }
        }

        /// <summary>双击/关联文件的路由：本版（音乐）固定单角色，只把音频文件送到音乐窗。</summary>
        public static void RouteExternalFiles(IEnumerable<string> paths)
        {
            var music = new List<string>();
            foreach (var p in paths ?? Enumerable.Empty<string>())
            {
                if (WindowRoleExt.IsAudio(p)) music.Add(p);
                // 视频扩展名与 .lrc 在本版（音乐）中忽略；
                // .lrc 由 EnqueuePaths 在入队音频时自动带上同名歌词。
            }
            if (music.Count > 0) OpenOrFocus(WindowRole.Music, music);
            else OpenOrFocus(WindowRole.Music);
        }
    }
}
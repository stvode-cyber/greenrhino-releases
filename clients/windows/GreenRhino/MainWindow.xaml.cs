using System;
using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Wpf;

namespace GreenRhino
{
    public partial class MainWindow : Window
    {
        private readonly LocalServer _server = new LocalServer();

        public MainWindow()
        {
            InitializeComponent();
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
                await webView.EnsureCoreWebView2Async();
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
            webView.CoreWebView2.AddWebResourceRequestedFilter("*", Microsoft.Web.WebView2.Core.CoreWebView2WebResourceContext.All);
            webView.Source = new Uri($"http://127.0.0.1:{port}/");
        }

        protected override void OnClosed(EventArgs e)
        {
            _server.Stop();
            base.OnClosed(e);
        }
    }
}

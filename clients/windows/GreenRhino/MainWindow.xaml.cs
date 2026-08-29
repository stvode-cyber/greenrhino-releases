using System;
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
            int port = _server.Start();                 // 启动内嵌本地服务（托管 wwwroot 中的 PWA）
            await webView.EnsureCoreWebView2Async();
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

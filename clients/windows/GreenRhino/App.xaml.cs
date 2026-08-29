using System;
using System.Windows;

namespace GreenRhino
{
    public partial class App : Application
    {
        public App()
        {
            // 任何未处理异常都弹窗提示，避免静默退出（之前“什么也不显示”的元凶）
            this.DispatcherUnhandledException += (s, e) =>
            {
                MessageBox.Show("程序发生未处理错误：\n" + e.Exception?.Message,
                    "绿角犀播放器", MessageBoxButton.OK, MessageBoxImage.Error);
                e.Handled = true;
            };
            AppDomain.CurrentDomain.UnhandledException += (s, e) =>
            {
                if (e.ExceptionObject is Exception ex)
                    MessageBox.Show("致命错误：\n" + ex.Message,
                        "绿角犀播放器", MessageBoxButton.OK, MessageBoxImage.Error);
            };
        }
    }
}

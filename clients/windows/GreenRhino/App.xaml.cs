using System;
using System.Linq;
using System.Windows;

namespace GreenRhino
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            var si = new SingleInstance("GreenRhino_SingleInstance_v1");

            // 已经有实例在跑：把双击的文件交给它，把它的窗口切到前台，然后自己退出。
            // 注意这里不调 base.OnStartup(e)，避免第二个窗口闪一下再消失。
            if (!si.TryBecomePrimary())
            {
                si.SendToPrimary(Environment.GetCommandLineArgs().Skip(1));
                SingleInstance.ActivateExistingInstance();
                Shutdown();
                return;
            }

            Instance = si;
            si.StartServer(paths =>
            {
                var win = MainWindow as MainWindow;
                if (win == null) return;
                win.OpenExternalFiles(paths);
                win.BringToFront();
            });

            base.OnStartup(e);
        }

        internal static SingleInstance Instance { get; private set; }

        protected override void OnExit(ExitEventArgs e)
        {
            Instance?.Dispose();
            base.OnExit(e);
        }

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

using System;
using System.Linq;
using System.Threading;
using System.Windows;

namespace GreenRhino
{
    public partial class App : Application
    {
        private const string MutexName = "GreenRhino_SingleInstance_v1";

        protected override void OnStartup(StartupEventArgs e)
        {
            var args = Environment.GetCommandLineArgs().Skip(1).ToArray();
            var si = new SingleInstance(MutexName);

            if (!si.TryBecomePrimary())
            {
                // 只是重复启动了程序、没有文件参数：把已有窗口切到前台就够
                if (args.Length == 0)
                {
                    SingleInstance.ActivateExistingInstance();
                    Shutdown();
                    return;
                }

                // 带文件参数：转发给已有实例后自己退出。
                // 注意这里不调 base.OnStartup(e)，避免第二个窗口闪一下再消失。
                var sent = si.SendToPrimary(args);
                SingleInstance.ActivateExistingInstance();
                if (sent)
                {
                    Shutdown();
                    return;
                }

                // 转发失败多半是老实例正在退出、管道已断开。
                // 这时要抢过 Mutex 自己接管，否则用户双击文件会毫无反应。
                si.Dispose();
                si = new SingleInstance(MutexName);
                for (var i = 0; i < 20 && !si.TryBecomePrimary(); i++) Thread.Sleep(250);
                if (!si.IsPrimary) { Shutdown(); return; }
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

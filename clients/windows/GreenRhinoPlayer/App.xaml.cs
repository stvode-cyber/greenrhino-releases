using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Windows;

namespace GreenRhino
{
    public partial class App : Application
    {
        private const string MutexName = "GreenRhinoPlayer_SingleInstance_v1";

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
            // 后续实例（再次双击文件/再次启动）经管道转发；按扩展名分流到音乐/视频窗口。
            si.StartServer(paths => WindowHost.RouteExternalFiles(paths));

            base.OnStartup(e);

            // 进程级托盘只建一次（任一窗 ✕ 缩托盘；托盘「退出」才全部关闭）
            WindowHost.SetupTray();

            // 启动即根据命令行参数分流：带媒体文件则直开对应窗口；否则打开 Hub 主窗。
            if (args.Length > 0)
            {
                WindowHost.RouteExternalFiles(args);
            }
            else
            {
                WindowHost.OpenOrFocus(WindowRole.Video);
            }
        }

        internal static SingleInstance Instance { get; private set; }

        /// <summary>把启动关键步骤与异常写到 %LOCALAPPDATA%\GreenRhinoPlayer\greenrhino.log，
        /// 即使窗口没弹出来，也能从日志看出卡在哪一步。</summary>
        internal static void Log(string msg)
        {
            try
            {
                var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GreenRhinoPlayer");
                Directory.CreateDirectory(dir);
                File.AppendAllText(Path.Combine(dir, "greenrhino.log"),
                    DateTime.Now.ToString("HH:mm:ss") + " " + msg + "\n");
            }
            catch { }
        }

        protected override void OnExit(ExitEventArgs e)
        {
            Instance?.Dispose();
            WindowHost.StopServer();
            try { WindowHost.Tray?.Dispose(); } catch { }
            base.OnExit(e);
        }

        public App()
        {
            Log("App..ctor 进入");
            // 任何未处理异常都弹窗提示，避免静默退出（之前“什么也不显示”的元凶）
            this.DispatcherUnhandledException += (s, e) =>
            {
                Log("DispatcherUnhandledException: " + e.Exception?.Message);
                MessageBox.Show("程序发生未处理错误：\n" + e.Exception?.Message,
                    "绿角犀播放器", MessageBoxButton.OK, MessageBoxImage.Error);
                e.Handled = true;
            };
            AppDomain.CurrentDomain.UnhandledException += (s, e) =>
            {
                if (e.ExceptionObject is Exception ex)
                {
                    Log("AppDomain.UnhandledException: " + ex.Message);
                    MessageBox.Show("致命错误：\n" + ex.Message,
                        "绿角犀播放器", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            };
            Log("App..ctor 完成");
        }
    }
}

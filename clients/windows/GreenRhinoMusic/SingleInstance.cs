using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;

namespace GreenRhino
{
    /// <summary>
    /// 单实例支持：让双击文件始终复用同一个播放器窗口。
    ///
    /// 没有它的话，每双击一个媒体文件就会新起一个进程、新开一个窗口、
    /// 各起一个本地服务（端口从 8890 递增），双击 3 首歌 = 开 3 个窗口。
    ///
    /// 做法：
    /// - 首个实例持有一把 Mutex，并起一个命名管道服务监听新文件；
    /// - 后续实例发现 Mutex 已存在，就把命令行参数经管道转发给首个实例，
    ///   再把它切到前台，然后自己退出（不创建窗口）。
    /// </summary>
    public class SingleInstance : IDisposable
    {
        private const string PipeName = "GreenRhinoMusic_SingleInstancePipe_v1";
        private readonly string _mutexName;
        private Mutex _mutex;
        private CancellationTokenSource _cts;

        public bool IsPrimary { get; private set; }

        public SingleInstance(string mutexName) { _mutexName = mutexName; }

        /// <summary>尝试成为首个实例。返回 false 表示已有实例在运行。</summary>
        public bool TryBecomePrimary()
        {
            _mutex = new Mutex(true, _mutexName, out bool createdNew);
            IsPrimary = createdNew;
            return createdNew;
        }

        /// <summary>把命令行参数转发给首个实例（最多等 3 秒）。</summary>
        public bool SendToPrimary(IEnumerable<string> args)
        {
            var list = (args ?? Enumerable.Empty<string>())
                       .Where(s => !string.IsNullOrWhiteSpace(s)).ToArray();
            if (list.Length == 0) return false;
            try
            {
                using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.Out);
                client.Connect(3000);
                var bytes = System.Text.Encoding.UTF8.GetBytes(string.Join("\n", list));
                client.Write(bytes, 0, bytes.Length);
                client.Flush();
                return true;
            }
            catch { return false; }
        }

        /// <summary>
        /// 首个实例启动管道服务。收到参数后切回 UI 线程再回调
        /// （管道监听在后台线程，直接操作 WebView2 / 窗口会跨线程异常）。
        /// </summary>
        public void StartServer(Action<string[]> onReceive)
        {
            if (!IsPrimary) return;
            _cts = new CancellationTokenSource();
            var ct = _cts.Token;
            _ = Task.Run(async () =>
            {
                while (!ct.IsCancellationRequested)
                {
                    try
                    {
                        using var server = new NamedPipeServerStream(
                            PipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
                        await server.WaitForConnectionAsync(ct);
                        using var ms = new MemoryStream();
                        await server.CopyToAsync(ms, 81920, ct);
                        var args = System.Text.Encoding.UTF8.GetString(ms.ToArray())
                            .Split('\n').Select(s => s.Trim()).Where(s => s.Length > 0).ToArray();
                        if (args.Length > 0)
                        {
                            var disp = System.Windows.Application.Current?.Dispatcher;
                            if (disp != null) disp.Invoke(() => onReceive?.Invoke(args));
                            else onReceive?.Invoke(args);
                        }
                    }
                    catch (OperationCanceledException) { break; }
                    catch { /* 单个连接异常不影响服务循环 */ }
                }
            });
        }

        /// <summary>
        /// 由"后续实例"调用：把已在运行的实例窗口切到前台。
        /// 必须由新实例来做——它刚启动、是前台进程，Windows 才允许它设置前台窗口；
        /// 若由后台的首个实例自己调 SetForegroundWindow，通常只会在任务栏闪烁。
        /// </summary>
        public static void ActivateExistingInstance()
        {
            try
            {
                var me = Process.GetCurrentProcess();
                foreach (var p in Process.GetProcessesByName(me.ProcessName))
                {
                    if (p.Id == me.Id) continue;
                    var h = p.MainWindowHandle;
                    if (h != IntPtr.Zero)
                    {
                        ShowWindow(h, SW_RESTORE);
                        SetForegroundWindow(h);
                        return;
                    }
                }
            }
            catch { /* 激活失败不影响文件已送达 */ }
        }

        [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        private const int SW_RESTORE = 9;

        public void Dispose()
        {
            try { _cts?.Cancel(); } catch { }
            try { if (IsPrimary) _mutex?.ReleaseMutex(); } catch { }
            try { _mutex?.Dispose(); } catch { }
        }
    }
}

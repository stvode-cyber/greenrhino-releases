using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace GreenRhino
{
    /// <summary>
    /// 极简内嵌 HTTP 服务：把 wwwroot 中的 PWA 以 http://127.0.0.1:port/ 托管，
    /// 这样 WebView2 内可启用 Service Worker / 离线缓存（file:// 不支持 SW）。
    /// 使用原始 TcpListener，无需管理员提权（避免 http.sys URL ACL）。
    /// </summary>
    public class LocalServer
    {
        private TcpListener _listener;
        private CancellationTokenSource _cts;
        private readonly string _root = Path.Combine(AppContext.BaseDirectory, "wwwroot");

        private static readonly Dictionary<string, string> Mime = new()
        {
            { ".html", "text/html; charset=utf-8" },
            { ".js", "text/javascript; charset=utf-8" },
            { ".mjs", "text/javascript; charset=utf-8" },
            { ".css", "text/css; charset=utf-8" },
            { ".json", "application/json; charset=utf-8" },
            { ".webmanifest", "application/manifest+json" },
            { ".svg", "image/svg+xml" },
            { ".png", "image/png" },
            { ".jpg", "image/jpeg" },
            { ".jpeg", "image/jpeg" },
            { ".ico", "image/x-icon" },
            { ".wav", "audio/wav" },
            { ".mp3", "audio/mpeg" },
            { ".mp4", "video/mp4" },
            { ".webm", "video/webm" },
            { ".vtt", "text/vtt" },
            { ".woff2", "font/woff2" },
            { ".txt", "text/plain; charset=utf-8" }
        };

        public int Start()
        {
            int port = 8890;
            while (true)
            {
                try { _listener = new TcpListener(IPAddress.Loopback, port); _listener.Start(); break; }
                catch { port++; if (port > 8999) throw new Exception("无可用端口"); }
            }
            _cts = new CancellationTokenSource();
            _ = Task.Run(() => Loop(_cts.Token));
            return port;
        }

        private async Task Loop(CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                TcpClient client = null;
                try { client = await _listener.AcceptTcpClientAsync(ct); }
                catch { break; }
                _ = Task.Run(() => Handle(client, ct));
            }
        }

        private async Task Handle(TcpClient client, CancellationToken ct)
        {
            try
            {
                using var ns = client.GetStream();
                using var reader = new StreamReader(ns, Encoding.ASCII, false, 1024, true);
                var line = await reader.ReadLineAsync();
                if (string.IsNullOrEmpty(line)) return;
                var parts = line.Split(' ');
                var urlPath = parts.Length > 1 ? parts[1] : "/";
                while (!string.IsNullOrEmpty(await reader.ReadLineAsync())) { } // 丢弃请求头

                if (urlPath == "/" || urlPath == "") urlPath = "/index.html";
                var file = Path.GetFullPath(Path.Combine(_root, urlPath.TrimStart('/')));
                if (!file.StartsWith(_root, StringComparison.OrdinalIgnoreCase))
                {
                    await Send(ns, 403, "text/plain", Encoding.UTF8.GetBytes("forbidden"));
                    return;
                }
                if (!File.Exists(file))
                {
                    await Send(ns, 404, "text/plain", Encoding.UTF8.GetBytes("not found"));
                    return;
                }
                var ext = Path.GetExtension(file).ToLowerInvariant();
                var mime = Mime.TryGetValue(ext, out var m) ? m : "application/octet-stream";
                var body = await File.ReadAllBytesAsync(file, ct);
                await Send(ns, 200, mime, body);
            }
            catch { /* 忽略单个连接异常 */ }
            finally { client.Close(); }
        }

        private static async Task Send(NetworkStream ns, int code, string mime, byte[] body)
        {
            var status = code == 200 ? "OK" : code == 404 ? "Not Found" : "Forbidden";
            var head = $"HTTP/1.1 {code} {status}\r\nContent-Type: {mime}\r\nContent-Length: {body.Length}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n";
            var hb = Encoding.ASCII.GetBytes(head);
            await ns.WriteAsync(hb, 0, hb.Length);
            await ns.WriteAsync(body, 0, body.Length);
        }

        public void Stop()
        {
            try { _cts?.Cancel(); _listener?.Stop(); } catch { }
        }
    }
}

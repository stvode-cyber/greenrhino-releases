using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace GreenRhino
{
    /// <summary>
    /// 极简内嵌 HTTP 服务：把 wwwroot 中的 PWA 以 http://127.0.0.1:port/ 托管，
    /// 这样 WebView2 内可启用 Service Worker / 离线缓存（file:// 不支持 SW）。
    /// 使用原始 TcpListener，无需管理员提权（避免 http.sys URL ACL）。
    /// wwwroot 定位策略：优先 exe 同级 wwwroot 文件夹（开发/独立文件场景）；
    /// 单文件发布时该文件夹不存在，则从内嵌资源 wwwroot.zip 解压到临时目录。
    /// </summary>
    public class LocalServer
    {
        private TcpListener _listener;
        private CancellationTokenSource _cts;
        private string _root;
        // 外部打开（双击文件）白名单：token -> 本地文件路径，仅允许服务白名单内的文件
        private readonly object _extLock = new();
        private readonly Dictionary<string, string> _external = new();

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
            { ".txt", "text/plain; charset=utf-8" },
            // 外部打开（双击文件）时需要正确 mime 才能被 <audio>/<video> 播放
            { ".flac", "audio/flac" },
            { ".m4a", "audio/mp4" },
            { ".aac", "audio/aac" },
            { ".ogg", "audio/ogg" },
            { ".oga", "audio/ogg" },
            { ".opus", "audio/ogg" },
            { ".wma", "audio/x-ms-wma" },
            { ".mp2", "audio/mpeg" },
            { ".mp1", "audio/mpeg" },
            { ".aiff", "audio/aiff" },
            { ".mka", "audio/x-matroska" },
            { ".mkv", "video/x-matroska" },
            { ".mov", "video/quicktime" },
            { ".avi", "video/x-msvideo" },
            { ".m4v", "video/mp4" },
            { ".ogv", "video/ogg" },
            { ".ts", "video/mp2t" },
            { ".flv", "video/x-flv" },
            { ".wmv", "video/x-ms-wmv" },
            { ".lrc", "text/plain; charset=utf-8" }
        };

        public int Start()
        {
            _root = ResolveWebRoot();
            int port = 8890;
            while (true)
            {
                try { _listener = new TcpListener(IPAddress.Loopback, port); _listener.Start(); break; }
                catch { port++; if (port > 8999) throw new Exception("no free port"); }
            }
            _cts = new CancellationTokenSource();
            _ = Task.Run(() => Loop(_cts.Token));
            return port;
        }

        private string ResolveWebRoot()
        {
            // 1) exe 同级的 wwwroot 文件夹（开发调试 / 非单文件发布）
            var diskRoot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
            if (Directory.Exists(diskRoot)) return diskRoot;

            // 2) 单文件发布：wwwroot 已作为嵌入资源 wwwroot.zip 打入 exe，解压到临时目录
            var extractRoot = Path.Combine(Path.GetTempPath(), "GreenRhino", "wwwroot");
            if (!Directory.Exists(extractRoot))
            {
                var asm = Assembly.GetExecutingAssembly();
                using var zip = asm.GetManifestResourceStream("GreenRhino.wwwroot.zip");
                if (zip != null)
                {
                    ZipFile.ExtractToDirectory(zip, extractRoot);
                    return extractRoot;
                }
            }
            else
            {
                return extractRoot;
            }
            // 兜底：仍返回磁盘路径，缺失文件由 Handle 的 404 体现
            return diskRoot;
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

                // 外部打开端点：仅服务于白名单 token，杜绝任意本地文件读取
                if (urlPath.StartsWith("/api/external", StringComparison.OrdinalIgnoreCase))
                {
                    string token = "";
                    var qi = urlPath.IndexOf('?');
                    if (qi >= 0)
                    {
                        foreach (var kv in urlPath.Substring(qi + 1).Split('&'))
                        {
                            var eq = kv.IndexOf('=');
                            if (eq > 0 && kv.Substring(0, eq) == "t") { token = Uri.UnescapeDataString(kv.Substring(eq + 1)); break; }
                        }
                    }
                    string fpath = null;
                    lock (_extLock) _external.TryGetValue(token, out fpath);
                    if (!string.IsNullOrEmpty(fpath) && File.Exists(fpath))
                    {
                        var fext = Path.GetExtension(fpath).ToLowerInvariant();
                        var fmime = Mime.TryGetValue(fext, out var fm) ? fm : "application/octet-stream";
                        var fbody = await File.ReadAllBytesAsync(fpath, ct);
                        await Send(ns, 200, fmime, fbody);
                    }
                    else
                    {
                        await Send(ns, 404, "text/plain", Encoding.UTF8.GetBytes("not found"));
                    }
                    return;
                }

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

        // ---------- 外部打开（双击文件）支持 ----------
        /// <summary>把本地文件登记进白名单，返回访问 token。web 层凭 token 经 /api/external?t= 取回文件字节。</summary>
        public string RegisterExternalFile(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) return null;
            var token = Guid.NewGuid().ToString("N");
            lock (_extLock) _external[token] = path;
            return token;
        }
        public class ExternalEntry { public string name; public string token; public string type; }
        public List<ExternalEntry> RegisterExternalFiles(IEnumerable<string> paths)
        {
            var list = new List<ExternalEntry>();
            foreach (var p in paths)
            {
                var t = RegisterExternalFile(p);
                if (t == null) continue;
                var name = Path.GetFileName(p);
                var ext = Path.GetExtension(p).ToLowerInvariant();
                var type = Mime.TryGetValue(ext, out var m) ? m : "application/octet-stream";
                list.Add(new ExternalEntry { name = name, token = t, type = type });
            }
            return list;
        }
        public void ClearExternal() { lock (_extLock) _external.Clear(); }
    }
}

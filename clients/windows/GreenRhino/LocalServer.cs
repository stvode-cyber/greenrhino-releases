using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Net.NetworkInformation;
using System.Reflection;
using System.Text;
using System.Text.Json;
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
        private int _port;
        // 外部打开（双击文件）白名单：token -> 本地文件路径，仅允许服务白名单内的文件
        private readonly object _extLock = new();
        private readonly Dictionary<string, string> _external = new();

        // 歌词代理用的共享 HttpClient（绕开浏览器跨域，服务端聚合多源）
        private static readonly HttpClient _http = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(12)
        };
        static LocalServer()
        {
            _http.DefaultRequestHeaders.UserAgent.TryParseAdd("GreenRhino/1.0 (offline media player)");
        }

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
            { ".ape", "audio/x-ape" },
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
                try { _listener = new TcpListener(IPAddress.Any, port); _listener.Start(); break; }
                catch { port++; if (port > 8999) throw new Exception("no free port"); }
            }
            _port = port;
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
                var method = parts.Length > 0 ? parts[0] : "GET";
                var urlPath = parts.Length > 1 ? parts[1] : "/";
                if (urlPath == "/" || urlPath == "") urlPath = "/index.html";

                // 解析请求头（投屏上传需读 Content-Length 对应的 body）
                var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                string hl;
                while (!string.IsNullOrEmpty(hl = await reader.ReadLineAsync()))
                {
                    var ci = hl.IndexOf(':');
                    if (ci > 0) headers[hl.Substring(0, ci).Trim()] = hl.Substring(ci + 1).Trim();
                }
                var remote = (IPEndPoint)client.Client.RemoteEndPoint;
                var fromLoopback = IPAddress.IsLoopback(remote.Address);

                // 投屏上传：web 端把当前播放的 Blob 以 localhost POST 上来，落临时文件并登记白名单，
                // 返回局域网可访问的 URL（电视经此拉流）。仅允许本机回环调用。
                if (method == "POST" && urlPath.StartsWith("/api/cast-upload", StringComparison.OrdinalIgnoreCase))
                {
                    if (!fromLoopback) { await Send(ns, 403, "text/plain", Encoding.UTF8.GetBytes("forbidden")); return; }
                    var name = "";
                    var qi = urlPath.IndexOf('?');
                    if (qi >= 0) foreach (var kv in urlPath.Substring(qi + 1).Split('&'))
                    {
                        var eq = kv.IndexOf('=');
                        if (eq > 0 && kv.Substring(0, eq) == "name") { name = Uri.UnescapeDataString(kv.Substring(eq + 1)); break; }
                    }
                    if (string.IsNullOrEmpty(name) && headers.TryGetValue("X-Cast-Name", out var hn)) name = hn;
                    int cl = 0;
                    if (headers.TryGetValue("Content-Length", out var clv)) int.TryParse(clv, out cl);
                    var castBytes = cl > 0 ? new byte[cl] : Array.Empty<byte>();
                    int got = 0;
                    while (got < cl) { int n = await ns.ReadAsync(castBytes, got, cl - got, ct); if (n <= 0) break; got += n; }
                    var token = RegisterCastFile(castBytes, name);
                    var url = $"http://{LanIp()}:{_port}/api/external?t={token}";
                    var json = JsonSerializer.Serialize(new { token, url });
                    await Send(ns, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json));
                    return;
                }

                // 外部打开端点（投屏媒体源）：仅服务于白名单 token，允许来自局域网（电视拉流）
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

                // 在线歌词代理：聚合 LRCLIB（国际）+ 歌词迷 gecimi（国内兜底），绕开浏览器跨域，返回 {lyric}
                if (urlPath.StartsWith("/api/lyric", StringComparison.OrdinalIgnoreCase))
                {
                    await HandleLyric(ns, urlPath);
                    return;
                }

                // 其余（wwwroot 静态资源）仅允许本机回环，避免把 PWA 暴露到局域网
                if (!fromLoopback) { await Send(ns, 403, "text/plain", Encoding.UTF8.GetBytes("forbidden")); return; }

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
                var fileBytes = await File.ReadAllBytesAsync(file, ct);
                await Send(ns, 200, mime, fileBytes);
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

        // ---------- 投屏：把 web 端上传的媒体字节落临时文件并登记白名单 ----------
        /// <summary>把上传的媒体字节写入临时文件，登记进外部白名单，返回访问 token（供电视经局域网拉流）。</summary>
        public string RegisterCastFile(byte[] data, string name)
        {
            try
            {
                var dir = Path.Combine(Path.GetTempPath(), "GreenRhino", "cast");
                Directory.CreateDirectory(dir);
                var ext = Path.GetExtension(name ?? "").ToLowerInvariant();
                if (string.IsNullOrEmpty(ext) || ext.Length > 10) ext = ".bin";
                var fname = Guid.NewGuid().ToString("N") + ext;
                var path = Path.Combine(dir, fname);
                File.WriteAllBytes(path, data ?? Array.Empty<byte>());
                return RegisterExternalFile(path);
            }
            catch { return null; }
        }

        /// <summary>取本机局域网 IPv4（电视经此地址访问投屏媒体）。无则回退 127.0.0.1。</summary>
        public static string LanIp()
        {
            try
            {
                foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                    foreach (var ua in ni.GetIPProperties().UnicastAddresses)
                    {
                        if (ua.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ua.Address))
                            return ua.Address.ToString();
                    }
                }
            }
            catch { }
            return "127.0.0.1";
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

        // ---------- 在线歌词代理（多源聚合，绕开浏览器跨域） ----------
        private async Task HandleLyric(NetworkStream ns, string urlPath)
        {
            string title = "", artist = "";
            var qi = urlPath.IndexOf('?');
            if (qi >= 0)
            {
                foreach (var kv in urlPath.Substring(qi + 1).Split('&'))
                {
                    var eq = kv.IndexOf('=');
                    if (eq > 0)
                    {
                        var k = kv.Substring(0, eq);
                        var v = Uri.UnescapeDataString(kv.Substring(eq + 1));
                        if (k == "title") title = v;
                        else if (k == "artist") artist = v;
                    }
                }
            }
            var lyric = await FetchLyricAggregate(title, artist);
            var json = JsonSerializer.Serialize(new { lyric });
            await Send(ns, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json));
        }

        // 顺序尝试：① LRCLIB（国际，免费无 Key）② 歌词迷 gecimi（国内兜底）
        private async Task<string> FetchLyricAggregate(string title, string artist)
        {
            if (string.IsNullOrWhiteSpace(title)) return "";
            // ① LRCLIB
            try
            {
                var q = "https://lrclib.net/api/search?track_name=" + Uri.EscapeDataString(title);
                if (!string.IsNullOrWhiteSpace(artist)) q += "&artist_name=" + Uri.EscapeDataString(artist);
                var txt = await _http.GetStringAsync(q);
                using var doc = JsonDocument.Parse(txt);
                if (doc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var it in doc.RootElement.EnumerateArray())
                    {
                        var lrc = PickLrc(it);
                        if (!string.IsNullOrEmpty(lrc)) return lrc;
                    }
                }
            }
            catch { /* LRCLIB 不可用：继续歌词迷 */ }

            // ② 歌词迷 gecimi（国内兜底）：先取搜索结果里的 .lrc 下载地址，再抓取内容
            try
            {
                var url = "http://gecimi.com/api/lyric/" + Uri.EscapeDataString(title);
                if (!string.IsNullOrWhiteSpace(artist)) url += "/" + Uri.EscapeDataString(artist);
                var txt = await _http.GetStringAsync(url);
                using var doc = JsonDocument.Parse(txt);
                if (doc.RootElement.TryGetProperty("result", out var arr) && arr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var it in arr.EnumerateArray())
                    {
                        if (it.TryGetProperty("lrc", out var lrcProp))
                        {
                            var lrcUrl = lrcProp.GetString();
                            if (!string.IsNullOrEmpty(lrcUrl))
                            {
                                var content = await FetchTextAutoEnc(lrcUrl);
                                if (!string.IsNullOrWhiteSpace(content)) return content.Trim();
                            }
                        }
                    }
                }
            }
            catch { /* 歌词迷不可用：返回空，由 web 端兜底 */ }
            return "";
        }

        // 抓取文本并按 UTF-8 / GBK 容错解码（歌词迷部分 .lrc 为 GBK）
        private async Task<string> FetchTextAutoEnc(string url)
        {
            try
            {
                var bytes = await _http.GetByteArrayAsync(url);
                var s = Encoding.UTF8.GetString(bytes);
                if (s.Contains('\uFFFD'))
                {
                    try { s = Encoding.GetEncoding("gbk").GetString(bytes); } catch { }
                }
                return s;
            }
            catch { return ""; }
        }

        private static string PickLrc(JsonElement it)
        {
            string synced = null, plain = null;
            if (it.TryGetProperty("syncedLyrics", out var s) && s.ValueKind == JsonValueKind.String) synced = s.GetString();
            if (it.TryGetProperty("plainLyrics", out var p) && p.ValueKind == JsonValueKind.String) plain = p.GetString();
            var v = (synced ?? plain ?? "").Trim();
            return v;
        }
    }
}

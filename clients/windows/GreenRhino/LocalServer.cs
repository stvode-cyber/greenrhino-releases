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
using System.Security.Cryptography;
using System.Linq;

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

        /// <summary>实际监听端口（供 C# 组装供 web 端播放的完整 URL）。</summary>
        public int Port => _port;

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

            // 2) 单文件发布：wwwroot 已作为嵌入资源 wwwroot.zip 打入 exe，解压到临时目录。
            //    每次启动都强制重解压：否则上次运行遗留的旧版文件会被直接复用，
            //    导致 web 端修复（如视频黑屏兜底）无法随新版 exe 生效。
            var extractRoot = Path.Combine(Path.GetTempPath(), "GreenRhino", "wwwroot");
            try
            {
                var asm = Assembly.GetExecutingAssembly();
                using var zip = asm.GetManifestResourceStream("GreenRhino.wwwroot.zip");
                if (zip != null)
                {
                    if (Directory.Exists(extractRoot)) Directory.Delete(extractRoot, true);
                    Directory.CreateDirectory(extractRoot);
                    ZipFile.ExtractToDirectory(zip, extractRoot);
                    return extractRoot;
                }
            }
            catch { /* 重解压失败（如文件被占用）时回退到既有目录，缺失文件由 404 体现 */ }
            if (Directory.Exists(extractRoot)) return extractRoot;
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

                // 读请求头：按块读到 "\r\n\r\n" 为止，并把其后已读到的字节保留为 body 前缀。
                // 不能用 StreamReader 读头后再从原始流读体——StreamReader 的内部缓冲会把部分 body
                // 字节"偷"进自己的 buffer，导致后续按 Content-Length 读体时永远读不满而挂起
                // （投屏上传、云盘上传都会卡死在等待 body 上）。
                var headBuf = new MemoryStream();
                var block = new byte[1024];
                int headEnd = -1;
                while (true)
                {
                    int n = await ns.ReadAsync(block, 0, block.Length, ct);
                    if (n <= 0) break;
                    headBuf.Write(block, 0, n);
                    var arrCheck = headBuf.GetBuffer();
                    for (int i = 3; i < (int)headBuf.Length; i++)
                    {
                        if (arrCheck[i - 3] == 13 && arrCheck[i - 2] == 10 && arrCheck[i - 1] == 13 && arrCheck[i] == 10) { headEnd = i - 3; break; }
                    }
                    if (headEnd >= 0) break;
                    if (headBuf.Length > 64 * 1024) break; // 请求头过大，放弃
                }
                if (headEnd < 0) return;
                var arrAll = headBuf.ToArray();
                var headerText = Encoding.ASCII.GetString(arrAll, 0, headEnd);
                var bodyPrefix = new byte[arrAll.Length - (headEnd + 4)];
                if (bodyPrefix.Length > 0) Array.Copy(arrAll, headEnd + 4, bodyPrefix, 0, bodyPrefix.Length);

                var lines = headerText.Split(new[] { "\r\n" }, StringSplitOptions.None);
                var parts = lines.Length > 0 ? lines[0].Split(' ') : new[] { "GET", "/" };
                var method = parts.Length > 0 ? parts[0] : "GET";
                var urlPath = parts.Length > 1 ? parts[1] : "/";
                if (urlPath == "/" || urlPath == "") urlPath = "/index.html";

                var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                for (int li = 1; li < lines.Length; li++)
                {
                    var ci = lines[li].IndexOf(':');
                    if (ci > 0) headers[lines[li].Substring(0, ci).Trim()] = lines[li].Substring(ci + 1).Trim();
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
                    var castBytes = await ReadBodyAsync(ns, bodyPrefix, cl, ct);
                    var token = RegisterCastFile(castBytes, name);
                    var url = $"http://{LanIp()}:{_port}/api/external?t={token}";
                    var json = JsonSerializer.Serialize(new { token, url });
                    await Send(ns, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json));
                    return;
                }

                // 云盘 API（仅本机回环）：注册送5G / 登录 / 配额 / 文件上传下载删除
                if (urlPath.StartsWith("/api/register", StringComparison.OrdinalIgnoreCase) ||
                    urlPath.StartsWith("/api/login", StringComparison.OrdinalIgnoreCase) ||
                    urlPath.StartsWith("/api/quota", StringComparison.OrdinalIgnoreCase) ||
                    urlPath.StartsWith("/api/files", StringComparison.OrdinalIgnoreCase))
                {
                    if (!fromLoopback) { await Send(ns, 403, "text/plain", Encoding.UTF8.GetBytes("forbidden")); return; }
                    await HandleCloud(ns, bodyPrefix, method, urlPath, headers, ct);
                    return;
                }

                // 外部打开端点（投屏媒体源 / 转码后 web 播放源）：仅服务于白名单 token，
                // 允许来自局域网（电视拉流）与本机 webview。支持 Range（视频 seek / 分块加载必需）。
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
                        var finfo = new FileInfo(fpath);
                        long total = finfo.Length;
                        long start = 0, end = total - 1;
                        bool isRange = false;
                        if (headers.TryGetValue("Range", out var range) && range.StartsWith("bytes=", StringComparison.OrdinalIgnoreCase))
                        {
                            isRange = true;
                            var spec = range.Substring(6).Split(',')[0].Trim(); // 只处理单段
                            var dash = spec.IndexOf('-');
                            if (dash >= 0)
                            {
                                if (long.TryParse(spec.Substring(0, dash), out var s)) start = s;
                                var ePart = spec.Substring(dash + 1);
                                if (long.TryParse(ePart, out var e) && e < total) end = e;
                                else end = total - 1;
                            }
                        }
                        if (start < 0) start = 0;
                        if (end >= total) end = total - 1;
                        if (isRange && (start > end || start >= total))
                        {
                            var h416 = $"HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{total}\r\nConnection: close\r\n\r\n";
                            var b416 = Encoding.ASCII.GetBytes(h416);
                            await ns.WriteAsync(b416, 0, b416.Length, ct);
                            return;
                        }
                        long length = end - start + 1;
                        App.Log("external served: " + fpath + " " + (isRange ? $"range {start}-{end}/{total}" : "full") + " (" + length + "B)");
                        var head = isRange
                            ? $"HTTP/1.1 206 Partial Content\r\nContent-Range: bytes {start}-{end}/{total}\r\nAccept-Ranges: bytes\r\n"
                            : "HTTP/1.1 200 OK\r\nAccept-Ranges: bytes\r\n";
                        head += $"Content-Type: {fmime}\r\nContent-Length: {length}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n";
                        var hb = Encoding.ASCII.GetBytes(head);
                        await ns.WriteAsync(hb, 0, hb.Length, ct);
                        using (var fss = new FileStream(fpath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 64 * 1024, FileOptions.SequentialScan))
                        {
                            fss.Seek(start, SeekOrigin.Begin);
                            var buf = new byte[64 * 1024];
                            long remaining = length;
                            while (remaining > 0)
                            {
                                int n = await fss.ReadAsync(buf, 0, (int)Math.Min(buf.Length, remaining), ct);
                                if (n <= 0) break;
                                await ns.WriteAsync(buf, 0, n, ct);
                                remaining -= n;
                            }
                        }
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

        /// <summary>读取请求体：先取请求头之后已读到的前缀字节，再从 socket 补足到 Content-Length。
        /// （不能先 StreamReader 读头再从原始流读体——缓冲会吞掉部分 body，导致读不满而挂起。）</summary>
        private static async Task<byte[]> ReadBodyAsync(NetworkStream ns, byte[] prefix, int cl, CancellationToken ct)
        {
            if (cl <= 0) return Array.Empty<byte>();
            var res = new byte[cl];
            int got = 0;
            if (prefix != null && prefix.Length > 0)
            {
                int c = Math.Min(prefix.Length, cl);
                Array.Copy(prefix, 0, res, 0, c);
                got = c;
            }
            while (got < cl)
            {
                int n = await ns.ReadAsync(res, got, cl - got, ct);
                if (n <= 0) break;
                got += n;
            }
            if (got == cl) return res;
            var trimmed = new byte[got];
            Array.Copy(res, trimmed, got);
            return trimmed;
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
        // path 为本地文件绝对路径，供 C# 原生视频兜底（WebView2 黑屏时直接用 MediaElement 播放）
        // 注意：System.Text.Json 默认只序列化属性（不序列化公开字段），必须用自动属性，否则 __hostOpen 收到 [{}]
        public class ExternalEntry
        {
            public string name { get; set; }
            public string token { get; set; }
            public string type { get; set; }
            public string path { get; set; }
        }
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
                list.Add(new ExternalEntry { name = name, token = t, type = type, path = p });
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

        // ===================== 账号云盘（内嵌，零云依赖，离线可用） =====================
        private const long CLOUD_QUOTA = 5L * 1024 * 1024 * 1024;
        private const string CloudHmacKey = "GreenRhino-Cloud-v1";

        private class CloudUser { public string username { get; set; } public string uid { get; set; } public string pw { get; set; } }
        private class CloudFileMeta { public string id { get; set; } public string name { get; set; } public long size { get; set; } public string ctime { get; set; } }

        private static async Task SendJson(NetworkStream ns, int code, object obj)
        {
            var json = JsonSerializer.Serialize(obj);
            await Send(ns, code, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json));
        }

        private static string CloudDir() => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "GreenRhino", "cloud");
        private static string UsersFile() => Path.Combine(CloudDir(), "users.json");
        private static List<CloudUser> LoadUsers()
        {
            try { var t = File.ReadAllText(UsersFile()); if (!string.IsNullOrEmpty(t)) return JsonSerializer.Deserialize<List<CloudUser>>(t) ?? new(); } catch { }
            return new List<CloudUser>();
        }
        private static void SaveUsers(List<CloudUser> u)
        {
            try { Directory.CreateDirectory(CloudDir()); File.WriteAllText(UsersFile(), JsonSerializer.Serialize(u, new JsonSerializerOptions { WriteIndented = true })); } catch { }
        }
        private static string UserFilesDir(string uid) { var d = Path.Combine(CloudDir(), "files", uid); Directory.CreateDirectory(d); return d; }
        private static string MetaFile(string uid) => Path.Combine(UserFilesDir(uid), ".index.json");
        private static List<CloudFileMeta> LoadMeta(string uid)
        {
            try { var t = File.ReadAllText(MetaFile(uid)); if (!string.IsNullOrEmpty(t)) return JsonSerializer.Deserialize<List<CloudFileMeta>>(t) ?? new(); } catch { }
            return new List<CloudFileMeta>();
        }
        private static void SaveMeta(string uid, List<CloudFileMeta> m)
        {
            try { File.WriteAllText(MetaFile(uid), JsonSerializer.Serialize(m, new JsonSerializerOptions { WriteIndented = true })); } catch { }
        }

        private static string HashPw(string pw)
        {
            var salt = Guid.NewGuid().ToString("N");
            using var sha = SHA256.Create();
            var h = sha.ComputeHash(Encoding.UTF8.GetBytes(salt + pw));
            return salt + ":" + Convert.ToHexString(h);
        }
        private static bool CheckPw(string pw, string stored)
        {
            if (string.IsNullOrEmpty(stored) || !stored.Contains(':')) return false;
            var parts = stored.Split(':', 2);
            using var sha = SHA256.Create();
            var h = sha.ComputeHash(Encoding.UTF8.GetBytes(parts[0] + pw));
            return Convert.ToHexString(h).Equals(parts[1], StringComparison.OrdinalIgnoreCase);
        }
        private static string MakeToken(string uid)
        {
            var exp = DateTimeOffset.UtcNow.AddDays(30).ToUnixTimeSeconds();
            var data = uid + ":" + exp;
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(CloudHmacKey));
            var sig = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(data))).TrimEnd('=').Replace('+', '-').Replace('/', '_');
            return data + "." + sig;
        }
        private static bool VerifyToken(string token, out string uid)
        {
            uid = null;
            if (string.IsNullOrEmpty(token)) return false;
            var parts = token.Split('.');
            if (parts.Length != 2) return false;
            var data = parts[0];
            var expStr = data.Contains(':') ? data.Substring(data.IndexOf(':') + 1) : "";
            if (!long.TryParse(expStr, out var exp)) return false;
            if (exp < DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return false;
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(CloudHmacKey));
            var expect = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(data))).TrimEnd('=').Replace('+', '-').Replace('/', '_');
            if (expect != parts[1]) return false;
            uid = data.Substring(0, data.IndexOf(':'));
            return true;
        }

        private static int IndexOf(byte[] hay, byte[] needle, int start)
        {
            for (int i = start; i <= hay.Length - needle.Length; i++)
            {
                bool ok = true;
                for (int j = 0; j < needle.Length; j++) if (hay[i + j] != needle[j]) { ok = false; break; }
                if (ok) return i;
            }
            return -1;
        }
        private static (string filename, byte[] content) ParseMultipart(byte[] body, string ct)
        {
            string filename = "";
            var boundary = "";
            var bi = ct.IndexOf("boundary=");
            if (bi >= 0) boundary = ct.Substring(bi + "boundary=".Length).Trim().Trim('"');
            if (string.IsNullOrEmpty(boundary)) return (filename, Array.Empty<byte>());
            var bstart = Encoding.ASCII.GetBytes("--" + boundary);
            var s = IndexOf(body, bstart, 0);
            if (s < 0) return (filename, Array.Empty<byte>());
            s += bstart.Length + 2;
            var he = IndexOf(body, Encoding.ASCII.GetBytes("\r\n\r\n"), s);
            if (he < 0) return (filename, Array.Empty<byte>());
            var headStr = Encoding.ASCII.GetString(body, s, he - s);
            var fi = headStr.IndexOf("filename=\"");
            if (fi >= 0) { var en = headStr.IndexOf("\"", fi + "filename=\"".Length); if (en > fi) filename = headStr.Substring(fi + "filename=\"".Length, en - fi - "filename=\"".Length); }
            else { var fi2 = headStr.IndexOf("filename="); if (fi2 >= 0) { var sp = headStr.IndexOfAny(new[] { ' ', ';' }, fi2 + "filename=".Length); filename = headStr.Substring(fi2 + "filename=".Length, (sp > fi2 ? sp : headStr.Length) - fi2 - "filename=".Length).Trim().Trim('"'); } }
            var e = IndexOf(body, Encoding.ASCII.GetBytes("\r\n--" + boundary), he + 4);
            if (e < 0) e = body.Length;
            var content = new byte[Math.Max(0, e - (he + 4))];
            if (content.Length > 0) Array.Copy(body, he + 4, content, 0, content.Length);
            return (filename, content);
        }

        private async Task HandleCloud(NetworkStream ns, byte[] bodyPrefix, string method, string urlPath, Dictionary<string, string> headers, CancellationToken ct)
        {
            try
            {
                int cl = 0; if (headers.TryGetValue("Content-Length", out var clv)) int.TryParse(clv, out cl);
                var body = await ReadBodyAsync(ns, bodyPrefix, cl, ct);

                string tok = null;
                if (headers.TryGetValue("Authorization", out var az) && az.StartsWith("Bearer ")) tok = az.Substring(7).Trim();

                if (urlPath.StartsWith("/api/register", StringComparison.OrdinalIgnoreCase) && method == "POST")
                {
                    string username = "", password = "";
                    try { var d = JsonDocument.Parse(body); var r = d.RootElement; username = r.GetProperty("username").GetString() ?? ""; password = r.GetProperty("password").GetString() ?? ""; } catch { }
                    if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password)) { await SendJson(ns, 400, new { error = "用户名和密码必填" }); return; }
                    var users = LoadUsers();
                    if (users.Any(u => u.username == username)) { await SendJson(ns, 400, new { error = "用户名已存在" }); return; }
                    var cu = new CloudUser { username = username, uid = Guid.NewGuid().ToString("N"), pw = HashPw(password) };
                    users.Add(cu); SaveUsers(users);
                    await SendJson(ns, 200, new { token = MakeToken(cu.uid), quota = CLOUD_QUOTA, used = 0L });
                    return;
                }
                if (urlPath.StartsWith("/api/login", StringComparison.OrdinalIgnoreCase) && method == "POST")
                {
                    string username = "", password = "";
                    try { var d = JsonDocument.Parse(body); var r = d.RootElement; username = r.GetProperty("username").GetString() ?? ""; password = r.GetProperty("password").GetString() ?? ""; } catch { }
                    var users = LoadUsers();
                    var cu = users.FirstOrDefault(u => u.username == username);
                    if (cu == null || !CheckPw(password, cu.pw)) { await SendJson(ns, 401, new { error = "用户名或密码错误" }); return; }
                    await SendJson(ns, 200, new { token = MakeToken(cu.uid), quota = CLOUD_QUOTA, used = LoadMeta(cu.uid).Sum(m => m.size) });
                    return;
                }
                if (!VerifyToken(tok, out var uid)) { await SendJson(ns, 401, new { error = "未登录或登录已过期" }); return; }

                if (urlPath.StartsWith("/api/quota", StringComparison.OrdinalIgnoreCase))
                {
                    await SendJson(ns, 200, new { quota = CLOUD_QUOTA, used = LoadMeta(uid).Sum(m => m.size) });
                    return;
                }
                if (urlPath == "/api/files" && method == "GET")
                {
                    await SendJson(ns, 200, new { files = LoadMeta(uid).OrderByDescending(m => m.ctime).ToArray() });
                    return;
                }
                if (urlPath == "/api/files" && method == "POST")
                {
                    headers.TryGetValue("Content-Type", out var ctHeader);
                    var (filename, content) = ParseMultipart(body, ctHeader ?? "");
                    if (string.IsNullOrEmpty(filename) || content.Length == 0) { await SendJson(ns, 400, new { error = "无效的上传内容" }); return; }
                    if (LoadMeta(uid).Sum(m => m.size) + content.Length > CLOUD_QUOTA) { await SendJson(ns, 400, new { error = "空间不足（配额 5GB）" }); return; }
                    var ext = Path.GetExtension(filename); if (ext.Length > 12) ext = "";
                    var id = Guid.NewGuid().ToString("N");
                    File.WriteAllBytes(Path.Combine(UserFilesDir(uid), id + ext), content);
                    var meta = LoadMeta(uid);
                    meta.Add(new CloudFileMeta { id = id, name = filename, size = content.Length, ctime = DateTime.Now.ToString("o") });
                    SaveMeta(uid, meta);
                    await SendJson(ns, 200, new { id, name = filename, size = content.Length });
                    return;
                }
                if (urlPath.StartsWith("/api/files/", StringComparison.OrdinalIgnoreCase))
                {
                    var id = Uri.UnescapeDataString(urlPath.Substring("/api/files/".Length));
                    var meta = LoadMeta(uid);
                    var fm = meta.FirstOrDefault(m => m.id == id);
                    var fpath = fm == null ? null : Path.Combine(UserFilesDir(uid), id + Path.GetExtension(fm.name));
                    if (fm == null || fpath == null || !File.Exists(fpath)) { await SendJson(ns, 404, new { error = "文件不存在" }); return; }
                    if (method == "GET")
                    {
                        var fb = await File.ReadAllBytesAsync(fpath, ct);
                        await Send(ns, 200, "application/octet-stream", fb);
                        return;
                    }
                    if (method == "DELETE")
                    {
                        File.Delete(fpath);
                        meta.Remove(fm); SaveMeta(uid, meta);
                        await SendJson(ns, 200, new { ok = true });
                        return;
                    }
                }
                await SendJson(ns, 404, new { error = "not found" });
            }
            catch (Exception ex) { await SendJson(ns, 500, new { error = ex.Message }); }
        }
    }
}

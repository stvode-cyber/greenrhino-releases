using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Security;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace GreenRhino
{
    /// <summary>
    /// DLNA 投屏控制器（C# 原生实现，无第三方依赖）。
    /// 负责：① SSDP 多播发现局域网 MediaRenderer（电视/盒子）；
    ///       ② 拉取设备描述 XML，解析 AVTransport 控制地址；
    ///       ③ SOAP 调用 SetAVTransportURI / Play / Pause / Stop / Seek 控制电视播放。
    /// 所有网络操作均超时保护、异常吞掉，空局域网或设备不支持也不会让调用方崩溃。
    /// </summary>
    public class DlnaDevice
    {
        public string Id;          // 稳定标识 = AVTransport 控制地址（每设备唯一）
        public string Name;        // 设备友好名（电视型号）
        public Uri ControlUrl;     // AVTransport 服务控制地址
    }

    public class DlnaCaster
    {
        private static readonly HttpClient _http = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(8)
        };
        private readonly object _lock = new object();
        private List<DlnaDevice> _devices = new List<DlnaDevice>();

        public IReadOnlyList<DlnaDevice> Devices
        {
            get { lock (_lock) return _devices.ToList(); }
        }

        public DlnaDevice Get(string id)
        {
            lock (_lock) return _devices.FirstOrDefault(d => d.Id == id);
        }

        /// <summary>SSDP 发现局域网内的 DLNA 渲染设备，返回发现的设备列表（去重）。</summary>
        public async Task<List<DlnaDevice>> DiscoverAsync(int timeoutMs = 4000)
        {
            var found = new Dictionary<string, DlnaDevice>();
            using var udp = new UdpClient(AddressFamily.InterNetwork);
            try { udp.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true); } catch { }
            try { udp.Ttl = 4; } catch { }
            udp.Client.ReceiveTimeout = 1200;

            var msearch =
                "M-SEARCH * HTTP/1.1\r\n" +
                "HOST: 239.255.255.250:1900\r\n" +
                "MAN: \"ssdp:discover\"\r\n" +
                "MX: 3\r\n" +
                "ST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n\r\n";
            var data = Encoding.ASCII.GetBytes(msearch);
            try { udp.Send(data, data.Length, new IPEndPoint(IPAddress.Parse("239.255.255.250"), 1900)); }
            catch { /* 发送失败（无网卡等）忽略，返回空列表 */ }

            var deadline = DateTime.Now.AddMilliseconds(Math.Max(timeoutMs, 3500));
            while (DateTime.Now < deadline)
            {
                try
                {
                    var remote = new IPEndPoint(IPAddress.Any, 0);
                    var resp = udp.Receive(ref remote);
                    var text = Encoding.ASCII.GetString(resp);
                    string location = null;
                    foreach (var l in text.Split('\n'))
                    {
                        var t = l.Trim();
                        if (t.StartsWith("LOCATION:", StringComparison.OrdinalIgnoreCase))
                            location = t.Substring(9).Trim();
                    }
                    if (!string.IsNullOrEmpty(location))
                    {
                        var dev = await ParseDevice(location);
                        if (dev != null && !found.ContainsKey(dev.Id)) found[dev.Id] = dev;
                    }
                }
                catch (SocketException) { /* 读取超时，继续直到 deadline */ }
                catch { /* 单条响应解析异常忽略 */ }
            }

            lock (_lock) { _devices = found.Values.ToList(); }
            return found.Values.ToList();
        }

        private async Task<DlnaDevice> ParseDevice(string location)
        {
            try
            {
                var xml = await _http.GetStringAsync(location);
                var doc = XDocument.Parse(xml);
                var dev = doc.Descendants().FirstOrDefault(e => e.Name.LocalName == "device");
                var friendly = dev?.Descendants().FirstOrDefault(e => e.Name.LocalName == "friendlyName")?.Value?.Trim();
                XElement svc = null;
                foreach (var s in doc.Descendants().Where(e => e.Name.LocalName == "service"))
                {
                    var st = s.Descendants().FirstOrDefault(e => e.Name.LocalName == "serviceType")?.Value ?? "";
                    if (st.Contains("AVTransport")) { svc = s; break; }
                }
                if (svc == null) return null;
                var ctrl = svc.Descendants().FirstOrDefault(e => e.Name.LocalName == "controlURL")?.Value?.Trim();
                if (string.IsNullOrEmpty(ctrl)) return null;
                var ctrlUri = new Uri(new Uri(location), ctrl);
                return new DlnaDevice
                {
                    Id = ctrlUri.ToString(),
                    Name = string.IsNullOrEmpty(friendly) ? ctrlUri.Host : friendly,
                    ControlUrl = ctrlUri
                };
            }
            catch { return null; }
        }

        // ---------- 播放控制（SOAP / UPnP AVTransport） ----------

        public async Task Play(string deviceId, string mediaUri)
        {
            var d = Get(deviceId);
            if (d == null) return;
            var uri = SecurityElement.Escape(mediaUri ?? "");
            await Soap(d.ControlUrl, "SetAVTransportURI",
                $"<InstanceID>0</InstanceID><CurrentURI>{uri}</CurrentURI><CurrentURIMetadata></CurrentURIMetadata>");
            await Soap(d.ControlUrl, "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>");
        }

        public async Task Stop(string deviceId)
        {
            var d = Get(deviceId);
            if (d == null) return;
            await Soap(d.ControlUrl, "Stop", "<InstanceID>0</InstanceID>");
        }

        public async Task Pause(string deviceId)
        {
            var d = Get(deviceId);
            if (d == null) return;
            await Soap(d.ControlUrl, "Pause", "<InstanceID>0</InstanceID>");
        }

        /// <summary>跳转到指定相对时间（格式 HH:MM:SS，如 00:01:30）。</summary>
        public async Task Seek(string deviceId, string relTime)
        {
            var d = Get(deviceId);
            if (d == null) return;
            var t = SecurityElement.Escape(relTime ?? "00:00:00");
            await Soap(d.ControlUrl, "Seek", $"<InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>{t}</Target>");
        }

        private static async Task Soap(Uri controlUrl, string action, string bodyInner)
        {
            try
            {
                var soap =
                    "<?xml version=\"1.0\"?>" +
                    "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
                    "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">" +
                    "<s:Body>" +
                    $"<u:{action} xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">{bodyInner}</u:{action}>" +
                    "</s:Body></s:Envelope>";
                var req = new HttpRequestMessage(HttpMethod.Post, controlUrl);
                req.Headers.Add("SOAPACTION", $"\"urn:schemas-upnp-org:service:AVTransport:1#{action}\"");
                req.Content = new StringContent(soap, Encoding.UTF8, "text/xml");
                using var resp = await _http.SendAsync(req);
                // 不抛异常：部分设备返回 200/500 仍正常播放；调用方只关心是否发出指令
            }
            catch { /* 网络/协议异常吞掉，投屏失败由上层提示 */ }
        }
    }
}

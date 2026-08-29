import Foundation
import Network

/// 极简内嵌 HTTP 服务：把打包进 App 的 wwwroot 以 http://127.0.0.1:port/ 托管，
/// 使 WKWebView 内可使用 Service Worker / IndexedDB（file:// 不支持 SW）。
/// 使用 Network 框架，无需第三方依赖。
final class LocalServer {

    private var listener: NWListener?
    private let queue = DispatchQueue(label: "greenrhino.local")
    private let root: String
    var port: UInt16 = 0

    init() {
        self.root = LocalServer.locateRoot()
    }

    /// 在 bundle 中定位 wwwroot（兼容不同目录布局）
    private static func locateRoot() -> String {
        guard let base = Bundle.main.resourceURL else { return NSTemporaryDirectory() }
        let candidates = [
            base.appendingPathComponent("wwwroot"),
            base.appendingPathComponent("GreenRhino/wwwroot")
        ]
        for c in candidates {
            if FileManager.default.fileExists(atPath: c.appendingPathComponent("index.html").path) {
                return c.path
            }
        }
        if let e = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil),
           let hit = (e.allObjects as? [URL])?.first(where: { $0.lastPathComponent == "index.html" }) {
            return hit.deletingLastPathComponent().path
        }
        return NSTemporaryDirectory()
    }

    /// 在 8900–8999 间找可用端口并启动
    @discardableResult
    func start() -> UInt16 {
        for p in 8900...8999 {
            do {
                let l = try NWListener(using: .tcp, on: NWEndpoint.Port(integerLiteral: UInt16(p)))
                l.newConnectionHandler = { [weak self] conn in self?.handle(conn) }
                l.start(queue: queue)
                self.port = UInt16(p)
                self.listener = l
                return UInt16(p)
            } catch { continue }
        }
        fatalError("无可用端口")
    }

    private func handle(_ conn: NWConnection) {
        conn.start(queue: queue)
        receive(conn)
    }

    private func receive(_ conn: NWConnection) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, isComplete, _ in
            guard let data = data, !data.isEmpty else {
                if isComplete { conn.cancel() }
                return
            }
            let req = String(data: data, encoding: .utf8) ?? ""
            let firstLine = req.components(separatedBy: "\n").first ?? ""
            let parts = firstLine.components(separatedBy: " ")
            var path = parts.count > 1 ? parts[1] : "/"
            if path == "/" { path = "/index.html" }

            let (status, mime, body) = self.response(for: path)
            var head = "HTTP/1.1 \(status)\r\nContent-Type: \(mime)\r\nContent-Length: \(body.count)\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n"
            if body.isEmpty { head = "HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\nConnection: close\r\n\r\nnot found" }
            var resp = Data(head.utf8)
            resp.append(body)
            conn.send(content: resp, completion: .contentProcessed({ _ in conn.cancel() }))
        }
    }

    private func response(for path: String) -> (String, String, Data) {
        let clean = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let full = (root as NSString).appendingPathComponent(clean)
        guard full.hasPrefix(root), let data = try? Data(contentsOf: URL(fileURLWithPath: full)) else {
            return ("404 Not Found", "text/plain; charset=utf-8", Data())
        }
        return ("200 OK", LocalServer.mime(for: path), data)
    }

    static func mime(for path: String) -> String {
        let ext = (path as NSString).pathExtension.lowercased()
        let m: [String: String] = [
            "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8",
            "mjs": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8",
            "json": "application/json; charset=utf-8", "webmanifest": "application/manifest+json",
            "svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "ico": "image/x-icon", "wav": "audio/wav", "mp3": "audio/mpeg", "mp4": "video/mp4",
            "webm": "video/webm", "vtt": "text/vtt", "txt": "text/plain; charset=utf-8"
        ]
        return m[ext] ?? "application/octet-stream"
    }
}

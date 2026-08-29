import UIKit
import WebKit

class ViewController: UIViewController {

    private var webView: WKWebView!
    private var server: LocalServer!

    override func viewDidLoad() {
        super.viewDidLoad()

        // 1) 启动内嵌本地服务，离线托管 wwwroot 中的 PWA（保留 Service Worker / IndexedDB）
        server = LocalServer()
        let port = server.start()

        // 2) 配置 WKWebView：允许内联自动播放、后台音频
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: view.bounds, configuration: cfg)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.backgroundColor = UIColor(red: 0x0E/255, green: 0x11/255, blue: 0x16/255, alpha: 1)
        view.addSubview(webView)

        if let url = URL(string: "http://127.0.0.1:\(port)/") {
            webView.load(URLRequest(url: url))
        }
    }
}

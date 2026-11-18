import AppKit
import WebKit

final class ReadingRoomDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var backend: Process?
    private var backendLog: FileHandle?
    private var attempts = 0
    private var stopping = false
    private let address = URL(string: "http://127.0.0.1:4318")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureMenu()
        if let iconURL = Bundle.main.url(forResource: "AppIcon", withExtension: "icns") {
            NSApp.applicationIconImage = NSImage(contentsOf: iconURL)
        }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.underPageBackgroundColor = NSColor(calibratedRed: 0.984, green: 0.969, blue: 0.945, alpha: 1)

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1220, height: 830),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "喵邮局"
        window.backgroundColor = NSColor(calibratedRed: 0.984, green: 0.969, blue: 0.945, alpha: 1)
        window.titlebarAppearsTransparent = true
        window.minSize = NSSize(width: 790, height: 600)
        window.setFrameAutosaveName("ReadingRoomWindow")
        window.contentView = webView
        window.isReleasedWhenClosed = false
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        showLoading()
        checkService()
    }

    private func configureMenu() {
        let menu = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于喵邮局", action: #selector(showAbout), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "隐藏喵邮局", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "退出喵邮局", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        menu.addItem(appItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "编辑")
        editMenu.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        menu.addItem(editItem)

        let viewItem = NSMenuItem()
        let viewMenu = NSMenu(title: "窗口")
        viewMenu.addItem(withTitle: "重新加载", action: #selector(reloadPage), keyEquivalent: "r")
        viewMenu.addItem(withTitle: "放大", action: #selector(zoomIn), keyEquivalent: "+")
        viewMenu.addItem(withTitle: "缩小", action: #selector(zoomOut), keyEquivalent: "-")
        viewMenu.addItem(withTitle: "实际大小", action: #selector(resetZoom), keyEquivalent: "0")
        viewMenu.addItem(.separator())
        viewMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        viewMenu.addItem(withTitle: "关闭窗口", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        viewItem.submenu = viewMenu
        menu.addItem(viewItem)
        NSApp.mainMenu = menu
    }

    private func showLoading() {
        webView.loadHTMLString("""
        <html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;height:100vh;background:#fbf7f1;color:#856653;font-family:-apple-system"><div style="text-align:center"><h1 style="font-family:serif;font-weight:500">喵邮局</h1><p style="font-size:13px">正在连接你的图书馆…</p></div></body></html>
        """, baseURL: nil)
    }

    private func checkService() {
        guard !stopping else { return }
        var request = URLRequest(url: address.appendingPathComponent("api/bootstrap"))
        request.timeoutInterval = 1
        URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            DispatchQueue.main.async {
                guard let self = self, !self.stopping else { return }
                if let response = response as? HTTPURLResponse, response.statusCode == 200,
                   let data = data, let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   result["token"] is String {
                    self.webView.load(URLRequest(url: self.address))
                    return
                }
                self.attempts += 1
                if self.attempts == 1 {
                    self.startBackend()
                    if self.attempts >= 35 { return }
                }
                if self.attempts < 35 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.checkService() }
                } else { self.showFailure("本机阅读服务启动超时。请确认 zlib 与 Node.js 已安装后重试。") }
            }
        }.resume()
    }

    private func startBackend() {
        guard let resources = Bundle.main.resourceURL else { return }
        let runtime = resources.appendingPathComponent("runtime")
        let process = Process()
        let nodeCandidates = ["/usr/local/bin/node", "/opt/homebrew/bin/node"]
        guard let node = nodeCandidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
            showFailure("未找到 Node.js。请安装 Node.js 后重新打开喵邮局。")
            return
        }
        process.executableURL = URL(fileURLWithPath: node)
        process.arguments = [runtime.appendingPathComponent("server.mjs").path]
        process.currentDirectoryURL = runtime
        let logURL = FileManager.default.temporaryDirectory.appendingPathComponent("meowpost.log")
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        if let log = try? FileHandle(forWritingTo: logURL) {
            backendLog = log
            process.standardOutput = log
            process.standardError = log
        }
        do { try process.run(); backend = process }
        catch { showFailure("无法启动本机服务。\(error.localizedDescription)") }
    }

    private func showFailure(_ message: String) {
        guard !stopping else { return }
        attempts = 35
        let alert = NSAlert()
        alert.messageText = "喵邮局暂时无法连接"
        alert.informativeText = message
        alert.addButton(withTitle: "重试")
        alert.addButton(withTitle: "退出")
        alert.beginSheetModal(for: window) { [weak self] response in
            if response == .alertFirstButtonReturn {
                self?.attempts = 0
                self?.showLoading()
                self?.checkService()
            } else { NSApp.terminate(nil) }
        }
    }

    @objc private func reloadPage() { attempts = 0; checkService() }
    @objc private func zoomIn() { webView.pageZoom = min(1.5, webView.pageZoom + 0.1) }
    @objc private func zoomOut() { webView.pageZoom = max(0.7, webView.pageZoom - 0.1) }
    @objc private func resetZoom() { webView.pageZoom = 1 }
    @objc private func showAbout() {
        NSApp.orderFrontStandardAboutPanel(options: [.applicationName: "喵邮局", .applicationVersion: "1.3.0", .credits: NSAttributedString(string: "把想读的书，递到你的书架。 · Powered by heartleo/zlib")])
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopping = true
        if let process = backend, process.isRunning { process.terminate() }
        try? backendLog?.close()
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "about" || (url.scheme == "http" && url.host == "127.0.0.1" && url.port == 4318) {
            decisionHandler(.allow)
        } else {
            if navigationAction.navigationType == .linkActivated { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "请确认操作"
        alert.informativeText = message
        alert.addButton(withTitle: "确认")
        alert.addButton(withTitle: "取消")
        alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { completionHandler($0 == .OK ? panel.urls : nil) }
    }
}

let app = NSApplication.shared
let delegate = ReadingRoomDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()

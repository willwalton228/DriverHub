import Foundation
import Network
import SwiftUI
import WebKit

@MainActor
final class WebViewModel: NSObject, ObservableObject {
    struct Failure {
        let title: String
        let message: String
        let systemImage: String
    }

    @Published var isInitialLoading = true
    @Published var isPageLoading = false
    @Published var failure: Failure?
    @Published var presentedFile: DownloadedFile?
    @Published var popupWebView: WKWebView?
    @Published var showDownloadError = false
    @Published var downloadErrorMessage: String?

    let configuration: AppConfiguration?
    let configurationError: String?
    lazy var webView: WKWebView = makeWebView()

    private let pathMonitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.placeholder.driverhub.network")
    private var hasCompletedInitialLoad = false
    private var lastKnownOnline = true
    private var presentedFileURL: URL?

    init() {
        do {
            configuration = try AppConfiguration.load()
            configurationError = nil
        } catch {
            configuration = nil
            configurationError = error.localizedDescription
            isInitialLoading = false
        }
        super.init()
        startConnectivityMonitoring()
    }

    var nonProductionEnvironment: String? {
        guard let configuration, !configuration.isProduction else { return nil }
        return configuration.environmentName
    }

    private func makeWebView() -> WKWebView {
        let webConfiguration = WKWebViewConfiguration()
        webConfiguration.websiteDataStore = .default()
        webConfiguration.defaultWebpagePreferences.allowsContentJavaScript = true
        webConfiguration.preferences.javaScriptCanOpenWindowsAutomatically = true
        webConfiguration.allowsInlineMediaPlayback = true
        webConfiguration.mediaTypesRequiringUserActionForPlayback = []

        let contentController = WKUserContentController()
        contentController.add(WeakScriptMessageHandler(delegate: self), name: BlobDownloadBridge.handlerName)
        contentController.addUserScript(WKUserScript(
            source: BlobDownloadBridge.script,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        webConfiguration.userContentController = contentController

        let view = WKWebView(frame: .zero, configuration: webConfiguration)
        view.navigationDelegate = self
        view.uiDelegate = self
        view.allowsBackForwardNavigationGestures = true
        view.scrollView.keyboardDismissMode = .interactive
        view.scrollView.contentInsetAdjustmentBehavior = .automatic
        view.isOpaque = true
        view.backgroundColor = .systemBackground
        return view
    }

    func loadInitialPageIfNeeded() {
        guard !hasCompletedInitialLoad, webView.url == nil, let url = configuration?.baseURL else { return }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadRevalidatingCacheData
        webView.load(request)
    }

    func retry() {
        failure = nil
        isInitialLoading = !hasCompletedInitialLoad
        if webView.url != nil {
            webView.reloadFromOrigin()
        } else {
            loadInitialPageIfNeeded()
        }
    }

    func applicationDidBecomeActive() {
        // Intentionally no unconditional reload. If connectivity returned while
        // backgrounded and an error is visible, retry is offered to the user.
        if !lastKnownOnline {
            failure = Failure(
                title: "No Connection",
                message: "DriverHub requires an internet connection. Check your network and retry.",
                systemImage: "wifi.slash"
            )
        }
    }

    func dismissPresentedFile() {
        presentedFile = nil
        if let presentedFileURL {
            try? FileManager.default.removeItem(at: presentedFileURL.deletingLastPathComponent())
            self.presentedFileURL = nil
        }
    }

    private func startConnectivityMonitoring() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor [weak self] in
                guard let self else { return }
                let wasOffline = !self.lastKnownOnline
                self.lastKnownOnline = online
                if !online {
                    self.failure = Failure(
                        title: "No Connection",
                        message: "DriverHub is online-only. Check your internet connection, then retry.",
                        systemImage: "wifi.slash"
                    )
                    self.isInitialLoading = false
                } else if wasOffline, self.failure?.title == "No Connection" {
                    self.failure = Failure(
                        title: "Connection Restored",
                        message: "Your network is available again. Retry to refresh DriverHub.",
                        systemImage: "wifi"
                    )
                }
            }
        }
        pathMonitor.start(queue: monitorQueue)
    }

    func presentDownloadedFile(_ file: DownloadedFile) {
        dismissPopup()
        if let presentedFileURL {
            try? FileManager.default.removeItem(at: presentedFileURL.deletingLastPathComponent())
        }
        presentedFileURL = file.url
        presentedFile = file
    }

    func dismissPopup() {
        popupWebView?.stopLoading()
        popupWebView?.navigationDelegate = nil
        popupWebView?.uiDelegate = nil
        popupWebView = nil
    }

    func reportDownloadError(_ error: Error) {
        downloadErrorMessage = error.localizedDescription
        showDownloadError = true
    }
}

extension WebViewModel: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        isPageLoading = true
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isPageLoading = false
        isInitialLoading = false
        hasCompletedInitialLoad = true
        failure = nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleNavigationFailure(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleNavigationFailure(error)
    }

    private func handleNavigationFailure(_ error: Error) {
        let nsError = error as NSError
        guard nsError.code != NSURLErrorCancelled else { return }
        isPageLoading = false
        isInitialLoading = false
        failure = Failure(
            title: "DriverHub Unavailable",
            message: lastKnownOnline
                ? "DriverHub could not be loaded. The service may be temporarily unavailable."
                : "DriverHub requires an internet connection. Check your network and retry.",
            systemImage: lastKnownOnline ? "exclamationmark.icloud" : "wifi.slash"
        )
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        preferences: WKWebpagePreferences,
        decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel, preferences)
            return
        }

        if navigationAction.shouldPerformDownload {
            decisionHandler(.download, preferences)
            return
        }

        switch url.scheme?.lowercased() {
        case "https":
            if configuration?.isAllowedInWebView(url) == true {
                decisionHandler(.allow, preferences)
            } else {
                UIApplication.shared.open(url)
                decisionHandler(.cancel, preferences)
            }
        case "http":
            // Cleartext navigation is denied everywhere, including external
            // system browsers. DriverHub is HTTPS-only.
            decisionHandler(.cancel, preferences)
        case "mailto", "tel", "maps":
            UIApplication.shared.open(url)
            decisionHandler(.cancel, preferences)
        case "about":
            // WebKit uses about:blank as a transient popup/document container.
            decisionHandler(url.absoluteString == "about:blank" ? .allow : .cancel, preferences)
        case "blob", "data":
            // Only the bounded script bridge may turn these into local files.
            decisionHandler(.cancel, preferences)
        default:
            decisionHandler(.cancel, preferences)
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if navigationResponse.isForMainFrame,
           let response = navigationResponse.response as? HTTPURLResponse,
           response.statusCode == 401 {
            isInitialLoading = false
            isPageLoading = false
            failure = Failure(
                title: "Authentication Required",
                message: "Your DriverHub session is unavailable or has expired. Retry to return to sign in.",
                systemImage: "person.crop.circle.badge.exclamationmark"
            )
            decisionHandler(.cancel)
            return
        }
        if navigationResponse.isForMainFrame,
           let response = navigationResponse.response as? HTTPURLResponse,
           response.statusCode == 403 {
            isInitialLoading = false
            isPageLoading = false
            failure = Failure(
                title: "Access Denied",
                message: "Your account does not have permission to open this DriverHub destination.",
                systemImage: "lock.trianglebadge.exclamationmark"
            )
            decisionHandler(.cancel)
            return
        }
        guard let url = navigationResponse.response.url,
              configuration?.isAllowedInWebView(url) == true else {
            decisionHandler(.cancel)
            return
        }
        let mimeType = navigationResponse.response.mimeType?.lowercased()
        if mimeType == "application/pdf" ||
            !navigationResponse.canShowMIMEType ||
            navigationResponse.response.suggestedFilename != nil &&
            mimeType == "application/octet-stream" {
            decisionHandler(.download)
        } else {
            decisionHandler(.allow)
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        isInitialLoading = false
        isPageLoading = false
        failure = Failure(
            title: "DriverHub Needs to Reload",
            message: "The secure web content process stopped. Retry to restore DriverHub.",
            systemImage: "arrow.clockwise.icloud"
        )
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        DownloadCoordinator.attach(download: download, owner: self)
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        DownloadCoordinator.attach(download: download, owner: self)
    }
}

extension WebViewModel: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard navigationAction.targetFrame == nil, let url = navigationAction.request.url else { return nil }
        if self.configuration?.isInternal(url) == true {
            webView.load(navigationAction.request)
        } else if self.configuration?.isAuthentication(url) == true {
            let popup = WKWebView(frame: .zero, configuration: configuration)
            popup.navigationDelegate = self
            popup.uiDelegate = self
            popup.allowsBackForwardNavigationGestures = true
            popupWebView = popup
            return popup
        } else if url.absoluteString == "about:blank" {
            let popup = WKWebView(frame: .zero, configuration: configuration)
            popup.navigationDelegate = self
            popup.uiDelegate = self
            popup.allowsBackForwardNavigationGestures = true
            popupWebView = popup
            return popup
        } else if ["https", "mailto", "tel", "maps"].contains(url.scheme?.lowercased() ?? "") {
            UIApplication.shared.open(url)
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        guard configuration?.allowedHosts.contains(origin.host.lowercased()) == true else {
            decisionHandler(.deny)
            return
        }
        // WebKit/iPadOS owns the just-in-time camera/microphone system prompt.
        decisionHandler(.prompt)
    }
}

extension WebViewModel: WKScriptMessageHandler {
    nonisolated func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let host = message.frameInfo.securityOrigin.host.lowercased()
        Task { @MainActor [weak self] in
            guard let self,
                  self.configuration?.allowedHosts.contains(host) == true else { return }
            do {
                let file = try BlobDownloadBridge.decode(message.body)
                self.presentDownloadedFile(file)
            } catch {
                self.reportDownloadError(error)
            }
        }
    }
}

private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?
    init(delegate: WKScriptMessageHandler) { self.delegate = delegate }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}
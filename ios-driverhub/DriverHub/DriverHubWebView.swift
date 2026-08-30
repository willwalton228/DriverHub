import SwiftUI
import WebKit

struct DriverHubWebView: UIViewRepresentable {
    @ObservedObject var model: WebViewModel

    func makeUIView(context: Context) -> WKWebView {
        model.webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        model.loadInitialPageIfNeeded()
    }
}

struct ExistingWebView: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView {
        webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}
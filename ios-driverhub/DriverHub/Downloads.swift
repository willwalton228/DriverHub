import Foundation
import QuickLook
import SwiftUI
import UniformTypeIdentifiers
import WebKit

struct DownloadedFile: Identifiable {
    let id = UUID()
    let url: URL
}

enum DownloadError: LocalizedError {
    case invalidMessage
    case tooLarge
    case invalidData

    var errorDescription: String? {
        switch self {
        case .invalidMessage: return "DriverHub sent an invalid download."
        case .tooLarge: return "This generated file exceeds the 25 MB in-app download limit."
        case .invalidData: return "The generated file data could not be decoded."
        }
    }
}

enum BlobDownloadBridge {
    static let handlerName = "driverHubDownload"
    static let maximumBytes = 25 * 1_024 * 1_024

    static let script = """
    (() => {
      const LIMIT = \(maximumBytes);
      const handler = window.webkit?.messageHandlers?.\(handlerName);
      if (!handler) return;
      document.addEventListener('click', async event => {
        const anchor = event.target?.closest?.('a[download]');
        if (!anchor || (!anchor.href.startsWith('blob:') && !anchor.href.startsWith('data:'))) return;
        event.preventDefault();
        try {
          const response = await fetch(anchor.href);
          const blob = await response.blob();
          if (blob.size > LIMIT) throw new Error('Generated file exceeds 25 MB');
          const reader = new FileReader();
          reader.onload = () => handler.postMessage({
            filename: anchor.download || 'DriverHub Download',
            mimeType: blob.type || 'application/octet-stream',
            dataURL: reader.result
          });
          reader.onerror = () => handler.postMessage({ error: 'Unable to read generated file' });
          reader.readAsDataURL(blob);
        } catch (error) {
          handler.postMessage({ error: String(error?.message || error) });
        }
      }, true);
    })();
    """

    static func decode(_ body: Any) throws -> DownloadedFile {
        guard let payload = body as? [String: Any],
              payload["error"] == nil,
              let dataURL = payload["dataURL"] as? String,
              let comma = dataURL.firstIndex(of: ",") else {
            throw DownloadError.invalidMessage
        }
        let encoded = String(dataURL[dataURL.index(after: comma)...])
        guard encoded.utf8.count <= ((maximumBytes * 4 / 3) + 8_192) else {
            throw DownloadError.tooLarge
        }
        guard let data = Data(base64Encoded: encoded), data.count <= maximumBytes else {
            throw DownloadError.invalidData
        }
        let rawName = (payload["filename"] as? String) ?? "DriverHub Download"
        let safeName = sanitizeFilename(rawName)
        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
            .appendingPathComponent(safeName)
        try FileManager.default.createDirectory(
            at: destination.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try data.write(to: destination, options: [.atomic, .completeFileProtection])
        return DownloadedFile(url: destination)
    }

    static func sanitizeFilename(_ value: String) -> String {
        let name = URL(fileURLWithPath: value).lastPathComponent
        let filtered = name.unicodeScalars.map {
            CharacterSet.alphanumerics.union(CharacterSet(charactersIn: " ._-()")).contains($0)
                ? String($0) : "_"
        }.joined()
        return String(filtered.prefix(180)).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "DriverHub Download" : String(filtered.prefix(180))
    }
}

@MainActor
final class DownloadCoordinator: NSObject, WKDownloadDelegate {
    private static var active: [ObjectIdentifier: DownloadCoordinator] = [:]
    private weak var owner: WebViewModel?
    private var destination: URL?
    private var key: ObjectIdentifier?

    static func attach(download: WKDownload, owner: WebViewModel) {
        let coordinator = DownloadCoordinator()
        coordinator.owner = owner
        coordinator.key = ObjectIdentifier(download)
        active[ObjectIdentifier(download)] = coordinator
        download.delegate = coordinator
    }

    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        let folder = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let file = folder.appendingPathComponent(BlobDownloadBridge.sanitizeFilename(suggestedFilename))
            destination = file
            completionHandler(file)
        } catch {
            completionHandler(nil)
            owner?.reportDownloadError(error)
            finish()
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        if let destination {
            owner?.presentDownloadedFile(DownloadedFile(url: destination))
        }
        finish()
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let destination {
            try? FileManager.default.removeItem(at: destination.deletingLastPathComponent())
        }
        owner?.reportDownloadError(error)
        finish()
    }

    private func finish() {
        if let key { Self.active.removeValue(forKey: key) }
    }
}

struct DownloadSheet: UIViewControllerRepresentable {
    let file: DownloadedFile
    let onDismiss: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onDismiss: onDismiss)
    }

    func makeUIViewController(context: Context) -> UINavigationController {
        let preview = QLPreviewController()
        preview.dataSource = context.coordinator
        preview.delegate = context.coordinator
        context.coordinator.fileURL = file.url
        preview.navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .action,
            target: context.coordinator,
            action: #selector(Coordinator.share)
        )
        preview.navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done,
            target: context.coordinator,
            action: #selector(Coordinator.done)
        )
        let navigation = UINavigationController(rootViewController: preview)
        context.coordinator.host = navigation
        return navigation
    }

    func updateUIViewController(_ uiViewController: UINavigationController, context: Context) {}

    final class Coordinator: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
        var fileURL: URL?
        weak var host: UIViewController?
        let onDismiss: () -> Void

        init(onDismiss: @escaping () -> Void) {
            self.onDismiss = onDismiss
        }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { fileURL == nil ? 0 : 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            fileURL! as NSURL
        }
        func previewControllerDidDismiss(_ controller: QLPreviewController) { onDismiss() }

        @objc func share() {
            guard let fileURL else { return }
            let activity = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
            activity.popoverPresentationController?.barButtonItem =
                (host as? UINavigationController)?.topViewController?.navigationItem.rightBarButtonItem
            host?.present(activity, animated: true)
        }

        @objc func done() {
            host?.dismiss(animated: true, completion: onDismiss)
        }
    }
}
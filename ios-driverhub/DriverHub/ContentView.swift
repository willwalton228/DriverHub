import SwiftUI

struct ContentView: View {
    @ObservedObject var model: WebViewModel

    var body: some View {
        ZStack {
            Color(red: 0.035, green: 0.055, blue: 0.09).ignoresSafeArea()

            if let configurationError = model.configurationError {
                ErrorStateView(
                    title: "Configuration Required",
                    message: configurationError,
                    systemImage: "gear.badge.xmark",
                    retry: nil
                )
            } else {
                DriverHubWebView(model: model)
                    .ignoresSafeArea(.keyboard, edges: .bottom)

                if model.isInitialLoading {
                    LaunchLoadingView()
                        .transition(.opacity)
                } else if let failure = model.failure {
                    ErrorStateView(
                        title: failure.title,
                        message: failure.message,
                        systemImage: failure.systemImage,
                        retry: model.retry
                    )
                }

                if let environment = model.nonProductionEnvironment {
                    VStack {
                        HStack {
                            Spacer()
                            Text(environment.uppercased())
                                .font(.caption2.bold())
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .foregroundStyle(.white)
                                .background(.orange, in: Capsule())
                                .accessibilityLabel("\(environment) environment")
                        }
                        Spacer()
                    }
                    .padding(12)
                    .allowsHitTesting(false)
                }

                if model.isPageLoading && !model.isInitialLoading {
                    ProgressView()
                        .controlSize(.small)
                        .padding(10)
                        .background(.ultraThinMaterial, in: Circle())
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                        .padding()
                        .allowsHitTesting(false)
                }
            }
        }
        .sheet(item: $model.presentedFile, onDismiss: model.dismissPresentedFile) { file in
            DownloadSheet(file: file) {
                model.dismissPresentedFile()
            }
        }
        .sheet(
            isPresented: Binding(
                get: { model.popupWebView != nil },
                set: { if !$0 { model.dismissPopup() } }
            ),
            onDismiss: model.dismissPopup
        ) {
            if let popup = model.popupWebView {
                NavigationStack {
                    ExistingWebView(webView: popup)
                        .navigationTitle("DriverHub")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button("Done", action: model.dismissPopup)
                            }
                        }
                }
            }
        }
        .alert("Download Failed", isPresented: $model.showDownloadError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.downloadErrorMessage ?? "The file could not be downloaded.")
        }
    }
}

private struct LaunchLoadingView: View {
    var body: some View {
        VStack(spacing: 24) {
            Image("LaunchMark")
                .resizable()
                .scaledToFit()
                .frame(width: 116, height: 116)
                .accessibilityHidden(true)
            Text("DriverHub")
                .font(.system(size: 34, weight: .semibold, design: .rounded))
            ProgressView("Connecting securely…")
                .tint(.white)
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.035, green: 0.055, blue: 0.09))
    }
}

private struct ErrorStateView: View {
    let title: String
    let message: String
    let systemImage: String
    let retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: systemImage)
                .font(.system(size: 48))
                .foregroundStyle(.orange)
            Text(title).font(.title2.bold())
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 520)
            if let retry {
                Button("Retry", action: retry)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
            }
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.regularMaterial)
    }
}
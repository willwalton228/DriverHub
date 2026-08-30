import SwiftUI

@main
struct DriverHubApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model = WebViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView(model: model)
        }
        .onChange(of: scenePhase) { _, phase in
            // Preserve the current page and WebKit session. DriverHub performs its
            // own focus-time freshness checks; foregrounding must not blindly reload.
            if phase == .active {
                model.applicationDidBecomeActive()
            }
        }
    }
}
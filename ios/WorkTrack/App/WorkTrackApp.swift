import SwiftUI

@main
struct WorkTrackApp: App {
    @StateObject private var app = AppState()
    @StateObject private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .environmentObject(auth)
                // Dari and Pashto are right-to-left, and the whole layout has
                // to follow — not just the text. Driven by the app's own
                // language rather than the phone's.
                .environment(\.layoutDirection, app.language.isRTL ? .rightToLeft : .leftToRight)
                // Re-render every string when the language changes; L is a
                // plain lookup, so it needs the nudge.
                .id(app.language)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        Group {
            switch auth.state {
            case .loading:
                ProgressView()
            case .signedOut:
                SignInView()
            case .signedIn:
                MyWorkView(client: auth.client)
            }
        }
        .task { await auth.start() }
    }
}

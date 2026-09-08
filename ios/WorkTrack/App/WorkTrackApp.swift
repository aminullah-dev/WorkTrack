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
                SignedInTabs(client: auth.client)
            }
        }
        .task { await auth.start() }
    }
}

/// The three things an employee comes here for: what they are doing, time off,
/// and what they were paid. Nothing a manager does is in this app.
struct SignedInTabs: View {
    let client: ApiClient

    var body: some View {
        TabView {
            MyWorkView(client: client)
                .tabItem { Label(L.t("tab_work"), systemImage: "hammer.fill") }
            AttendanceHistoryView(client: client)
                .tabItem { Label(L.t("tab_history"), systemImage: "clock.fill") }
            LeaveView(client: client)
                .tabItem { Label(L.t("tab_leave"), systemImage: "airplane") }
            PayslipsView(client: client)
                .tabItem { Label(L.t("tab_pay"), systemImage: "banknote.fill") }
            AnnouncementsView(client: client)
                .tabItem { Label(L.t("tab_ann"), systemImage: "megaphone.fill") }
        }
    }
}

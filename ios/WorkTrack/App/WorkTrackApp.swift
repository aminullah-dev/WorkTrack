import SwiftUI

@main
struct WorkTrackApp: App {
    @StateObject private var app = AppState()
    @StateObject private var auth = AuthStore()
    @StateObject private var lock = AppLock()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView(lock: lock)
                .environmentObject(app)
                .environmentObject(auth)
                .onChange(of: scenePhase) { phase in
                    // Re-lock when the app leaves the screen, not when it
                    // returns: locking on return would leave the contents
                    // visible in the app switcher, which is where a shared
                    // phone gets read over somebody's shoulder.
                    if phase == .background { lock.lockIfNeeded() }
                    // Coming forward is the moment to ask whether anything
                    // about this person changed while the app was away — a
                    // module his company switched on, or an account that has
                    // since been closed. It used to be asked only at launch,
                    // so a manager could enable face check-in, tell him to
                    // look, and nothing would happen.
                    //
                    // At launch this fires against `state == .loading` while
                    // `start()` is still running, and refreshMe() steps aside
                    // for that.
                    if phase == .active { Task { await auth.refreshMe() } }
                }
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
    @EnvironmentObject private var app: AppState
    @ObservedObject var lock: AppLock

    var body: some View {
        Group {
            switch auth.state {
            case .loading:
                ProgressView()
            case .signedOut:
                // The next person starts on Work, not the last one's tab.
                SignInView().onAppear { app.tab = .work }
            case .signedIn:
                // The lock sits OVER a live session. It gates who may look,
                // not whether the session survives — signing out instead would
                // discard queued punches over a privacy setting.
                if lock.isLocked {
                    AppLockScreen(lock: lock)
                } else {
                    SignedInTabs(client: auth.client, lock: lock)
                }
            }
        }
        .task { await auth.start() }
    }
}

/// What an employee comes here for. Nothing a manager does is in this app.
///
/// The attendance model is built HERE rather than inside the work tab, because
/// the profile screen shows the same queue: two instances would each hold their
/// own copy of what the phone is waiting to send, and the profile would report
/// "everything sent" while a punch sat in the other one.
struct SignedInTabs: View {
    let client: ApiClient
    @EnvironmentObject private var app: AppState
    @ObservedObject var lock: AppLock

    @StateObject private var location = LocationProvider()
    @StateObject private var attendance: AttendanceViewModel
    private let cache: WorkCache

    init(client: ApiClient, lock: AppLock) {
        self.client = client
        self.lock = lock
        let cache = WorkCache()
        self.cache = cache
        let provider = LocationProvider()
        _location = StateObject(wrappedValue: provider)
        _attendance = StateObject(
            wrappedValue: AttendanceViewModel(client: client, location: provider, cache: cache)
        )
    }

    var body: some View {
        TabView(selection: $app.tab) {
            MyWorkView(client: client, attendance: attendance, cache: cache)
                // A checklist, not a hammer. This is an office product that
                // happens to be used on sites; a tool icon narrows it to
                // manual trades and reads wrong to every other customer.
                .tabItem { Label(L.t("tab_work"), systemImage: "checklist") }
                .tag(AppTab.work)
            AttendanceHistoryView(client: client)
                .tabItem { Label(L.t("tab_history"), systemImage: "clock.fill") }
                .tag(AppTab.attendance)
            LeaveView(client: client)
                .tabItem { Label(L.t("tab_leave"), systemImage: "calendar") }
                .tag(AppTab.leave)
            PayslipsView(client: client)
                .tabItem { Label(L.t("tab_pay"), systemImage: "doc.text.fill") }
                .tag(AppTab.pay)
            ProfileView(attendance: attendance, lock: lock)
                .tabItem { Label(L.t("tab_profile"), systemImage: "person.crop.circle.fill") }
                .tag(AppTab.profile)
        }
    }
}

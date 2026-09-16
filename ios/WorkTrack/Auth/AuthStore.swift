import Foundation

/// Who is signed in, and the token every request needs.
///
/// The refresh token lives in the Keychain so the app opens signed in; the ID
/// token lives in memory only, because it is short-lived and there is nothing
/// to gain by writing it down.
@MainActor
final class AuthStore: ObservableObject {
    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(Me)
    }

    @Published private(set) var state: State = .loading
    @Published var signInError: String?
    @Published private(set) var isSigningIn = false

    private var session: FirebaseAuthREST.Session?
    /// Guards against two foreground refreshes overlapping when the app is
    /// flicked in and out of the switcher.
    private var isRefreshing = false
    private let store = OfflineStore()
    private static let refreshKey = "refreshToken"
    private static let meFile = "me"

    /// Refreshed a little early: a token that expires mid-request would
    /// otherwise surface as a spurious sign-out.
    private static let expiryMargin: TimeInterval = 60

    private lazy var api = ApiClient { [weak self] in
        guard let self else { throw ApiError.unauthenticated }
        return try await self.validToken()
    }

    /// Restores a session from the Keychain, or reports signed out.
    func start() async {
        guard let refresh = Keychain.get(Self.refreshKey) else {
            state = .signedOut
            return
        }
        do {
            session = try await FirebaseAuthREST.refresh(refresh)
            Keychain.set(session!.refreshToken, for: Self.refreshKey)
            let me: Me = try await api.get("me")
            store.save(me, to: Self.meFile)
            state = .signedIn(me)
        } catch ApiError.offline {
            // Offline at launch is NOT a sign-out. Showing the login screen
            // here would be the worst possible answer: he cannot sign in
            // without signal either, so the app would lock him out of the
            // cached plan precisely when he needs it — on a site with no mast.
            //
            // The refresh token stays in the Keychain, the last known identity
            // comes off the disk, and the screens serve what they cached.
            if let cached = store.load(Me.self, from: Self.meFile) {
                state = .signedIn(cached)
            } else {
                // Never signed in on this device, so there is nothing to show.
                state = .signedOut
            }
        } catch {
            // A real refusal — the token was revoked or the account is gone.
            endSession()
        }
    }

    /// Ends a session the server has already ended, as opposed to one the
    /// person chose to end.
    ///
    /// Deliberately narrower than `signOut()`: it leaves the work cache alone.
    /// A token is also revoked when an admin merely RESETS a password, and
    /// throwing away a punch the phone has not managed to send yet — over what
    /// is, to the worker, a password change — would cost him the morning.
    private func endSession() {
        Keychain.remove(Self.refreshKey)
        store.remove(Self.meFile)
        session = nil
        state = .signedOut
    }

    /// Re-reads the signed-in person, for when something about THEM changed on
    /// the server rather than anything changing on the phone.
    ///
    /// The case that prompted it: a manager switches face check-in on in the
    /// portal and tells the worker to look. Features ride on `me`, and `me`
    /// was only ever read in `start()` — at launch. So bringing the app back
    /// from the switcher changed nothing and explained nothing, and the
    /// feature simply stayed invisible until the app was force-quit. Nobody
    /// guesses that.
    ///
    /// This must never be able to sign somebody out by accident, so the error
    /// handling is deliberately lopsided:
    ///
    ///   - offline, a 5xx, a body we could not read → keep the identity we
    ///     have. A bad minute on the server must not empty a site full of
    ///     phones onto the login screen.
    ///   - 401 → end the session, and that one is wanted: a revoked token is
    ///     exactly what disabling an employee produces, so somebody who has
    ///     left the company stops being in the app at the next foreground
    ///     instead of lingering until they happen to tap something.
    func refreshMe() async {
        guard case .signedIn(let current) = state, !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            let me: Me = try await api.get("me")
            store.save(me, to: Self.meFile)
            // Only when it actually differs. @Published fires on every
            // assignment, identical or not, and this runs each time the app
            // comes forward — re-rendering every screen for nothing.
            if me != current { state = .signedIn(me) }
        } catch {
            switch Self.outcome(for: error) {
            case .endSession: endSession()
            case .keep: break
            }
        }
    }

    /// What a failed refresh does to the session.
    ///
    /// Split out from `refreshMe` and made pure because it is the one part
    /// that must not drift: getting it backwards does not throw or crash, it
    /// quietly empties a site full of phones onto the login screen the first
    /// time the server has a bad minute — at which point nobody can sign back
    /// in either, because signing in needs the same server.
    enum RefreshOutcome: Equatable {
        /// Keep the identity we already have.
        case keep
        /// End the session, because the server has already ended it.
        case endSession
    }

    /// `nonisolated` because it is pure — it reads no state, so it has no
    /// business needing the main actor to answer.
    nonisolated static func outcome(for error: Error) -> RefreshOutcome {
        if case ApiError.unauthenticated = error { return .endSession }
        return .keep
    }

    func signIn(email: String, password: String) async {
        isSigningIn = true
        signInError = nil
        defer { isSigningIn = false }
        do {
            let s = try await FirebaseAuthREST.signIn(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password
            )
            session = s
            Keychain.set(s.refreshToken, for: Self.refreshKey)
            let me: Me = try await api.get("me")
            store.save(me, to: Self.meFile)
            state = .signedIn(me)
        } catch ApiError.offline {
            signInError = L.t("err_offline")
        } catch ApiError.problem(_, let code, _) where code.hasPrefix("EMAIL_")
            || code.hasPrefix("INVALID_") || code == "MISSING_PASSWORD" {
            signInError = L.t("err_bad_credentials")
        } catch ApiError.unauthenticated {
            signInError = L.t("err_bad_credentials")
        } catch {
            signInError = L.t("err_generic")
        }
    }

    func signOut() {
        // Signing out is explicit, so everything held for this person goes:
        // the token, the identity, the cached day and any queued punch. A
        // shared phone must not hand the next worker the last one's plan.
        Keychain.remove(Self.refreshKey)
        store.remove(Self.meFile)
        WorkCache().clear()
        session = nil
        state = .signedOut
    }

    /// A token good for the next request, refreshing it if it is about to go.
    func validToken() async throws -> String {
        guard let current = session else { throw ApiError.unauthenticated }
        if current.expiresAt.timeIntervalSinceNow > Self.expiryMargin {
            return current.idToken
        }
        let refreshed = try await FirebaseAuthREST.refresh(current.refreshToken)
        session = refreshed
        Keychain.set(refreshed.refreshToken, for: Self.refreshKey)
        return refreshed.idToken
    }

    /// The shared client, so screens do not each build their own.
    var client: ApiClient { api }
}

/// The signed-in person, from GET /v1/me.
struct Me: Codable, Equatable {
    let employeeId: String
    let companyId: String
    let displayName: String
    let companyName: String
    let roles: [String]
    /// Whether this employee has already enrolled a face.
    let faceEnrolled: Bool?
    /// The company's module switches. Face check-in is off by default
    /// (DEFAULT_SETTINGS in backend/functions/src/services/settings.ts), so it
    /// must not appear for a company that has not asked for it.
    let features: Features?

    struct Features: Codable, Equatable {
        let faceRecognition: Bool?
    }

    var faceEnabled: Bool { features?.faceRecognition == true }
    var hasFace: Bool { faceEnrolled == true }
}

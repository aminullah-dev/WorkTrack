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
            Keychain.remove(Self.refreshKey)
            store.remove(Self.meFile)
            state = .signedOut
        }
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

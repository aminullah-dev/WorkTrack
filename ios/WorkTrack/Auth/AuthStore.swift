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
    private static let refreshKey = "refreshToken"

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
            state = .signedIn(try await api.get("me"))
        } catch ApiError.offline {
            // Offline at launch is not a sign-out. Without a token there is
            // nothing to show yet, but the stored refresh token stays put so
            // the next launch with signal picks it up.
            state = .signedOut
        } catch {
            Keychain.remove(Self.refreshKey)
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
            state = .signedIn(try await api.get("me"))
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
        Keychain.remove(Self.refreshKey)
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
struct Me: Decodable, Equatable {
    let employeeId: String
    let companyId: String
    let displayName: String
    let companyName: String
    let roles: [String]
}

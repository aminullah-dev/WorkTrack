import Foundation

/// Firebase Authentication over its REST API, rather than the Firebase SDK.
///
/// The SDK would pull a large dependency tree in for two calls — sign in, and
/// exchange a refresh token — both of which are a POST with a JSON body. This
/// keeps the app buildable from a checked-in spec with no package resolution,
/// which matters while the project is still being shaped. If push
/// notifications or Firestore arrive later, the SDK comes with them and this
/// file goes.
enum FirebaseAuthREST {
    struct Session {
        let idToken: String
        let refreshToken: String
        let expiresAt: Date
    }

    private static let apiKey = Backend.current.firebaseAPIKey

    static func signIn(email: String, password: String) async throws -> Session {
        let body: [String: Any] = [
            "email": email, "password": password, "returnSecureToken": true,
        ]
        let json = try await post(
            "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword",
            body: body
        )
        guard let idToken = json["idToken"] as? String,
              let refresh = json["refreshToken"] as? String,
              let expiresIn = json["expiresIn"] as? String,
              let seconds = TimeInterval(expiresIn) else {
            throw ApiError.malformedResponse
        }
        return Session(
            idToken: idToken,
            refreshToken: refresh,
            expiresAt: Date().addingTimeInterval(seconds)
        )
    }

    static func refresh(_ refreshToken: String) async throws -> Session {
        let json = try await post(
            "https://securetoken.googleapis.com/v1/token",
            body: ["grant_type": "refresh_token", "refresh_token": refreshToken],
            form: true
        )
        guard let idToken = json["id_token"] as? String,
              let refresh = json["refresh_token"] as? String,
              let expiresIn = json["expires_in"] as? String,
              let seconds = TimeInterval(expiresIn) else {
            throw ApiError.unauthenticated
        }
        return Session(
            idToken: idToken,
            refreshToken: refresh,
            expiresAt: Date().addingTimeInterval(seconds)
        )
    }

    private static func post(
        _ urlString: String,
        body: [String: Any],
        form: Bool = false
    ) async throws -> [String: Any] {
        var components = URLComponents(string: urlString)!
        components.queryItems = [URLQueryItem(name: "key", value: apiKey)]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"

        if form {
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            request.httpBody = Data(
                body.map { "\($0.key)=\($0.value)" }.joined(separator: "&").utf8
            )
        } else {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw ApiError.offline
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw ApiError.malformedResponse
        }
        guard (200..<300).contains(status) else {
            // Firebase reports EMAIL_NOT_FOUND / INVALID_PASSWORD /
            // INVALID_LOGIN_CREDENTIALS separately; to somebody signing in they
            // are one thing, and saying which one is true is a favour to
            // whoever is guessing.
            let inner = (json["error"] as? [String: Any])?["message"] as? String ?? "AUTH_FAILED"
            throw ApiError.problem(status: status, code: inner, detail: inner)
        }
        return json
    }
}

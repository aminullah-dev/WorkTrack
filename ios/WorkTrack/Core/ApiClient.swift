import Foundation

/// Talks to the WorkTrack API.
///
/// `/v1` is the contract this app shares with the portal and the Android app —
/// no code is shared with either, and none needs to be. Everything here is the
/// same envelope, the same problem+json, and the same bearer token.
///
/// Deliberately does NOT send `X-Device-Id`. The licence counts phones running
/// the Android app; an iOS build has no seat to claim and the server's device
/// guard treats a missing header as "not a licensed device"
/// (backend/functions/src/middleware/deviceGuard.ts). Sending an invented id
/// here would silently consume a customer's seats.
actor ApiClient {
    private let baseURL: URL
    private let session: URLSession
    private let tokenProvider: () async throws -> String

    init(
        baseURL: URL = Backend.current.apiBaseURL,
        session: URLSession = .shared,
        tokenProvider: @escaping () async throws -> String
    ) {
        self.baseURL = baseURL
        self.session = session
        self.tokenProvider = tokenProvider
    }

    func get<T: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> T {
        var components = URLComponents(
            url: baseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        )!
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        return try await send(request)
    }

    func post<T: Decodable>(_ path: String, body: [String: Any]) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await send(request)
    }

    private func send<T: Decodable>(_ base: URLRequest) async throws -> T {
        var request = base
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(try await tokenProvider())", forHTTPHeaderField: "Authorization")

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            // A site with no signal is the normal case, not the exception.
            throw ApiError.offline
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw ApiError.from(status: status, body: data)
        }
        do {
            return try JSONDecoder().decode(Envelope<T>.self, from: data).data
        } catch {
            throw ApiError.malformedResponse
        }
    }
}

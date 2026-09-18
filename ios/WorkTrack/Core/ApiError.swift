import Foundation

/// An error the API returned, or the reason we never reached it.
///
/// Mirrors the server's RFC 7807 problem+json (see backend/functions/src/lib/
/// errors.ts) so the codes here are the same strings the Android app and the
/// portal already switch on.
enum ApiError: Error, Equatable {
    /// No network, DNS failure, timeout — anything that never reached a server.
    case offline
    /// The token is missing or expired and could not be refreshed.
    case unauthenticated
    /// A problem+json response.
    case problem(status: Int, code: String, detail: String)
    /// A 2xx whose body was not the shape we expected.
    case malformedResponse

    var isRetryable: Bool {
        switch self {
        case .offline: return true
        case .problem(let status, _, _): return status >= 500
        default: return false
        }
    }
}

/// The server wraps every success in `{ "data": … }`.
struct Envelope<T: Decodable>: Decodable {
    let data: T
}

private struct Problem: Decodable {
    let code: String?
    let detail: String?
    let title: String?
    let status: Int?
}

extension ApiError {
    /// Builds the error from a non-2xx response body, falling back to the
    /// status when the body is not problem+json.
    static func from(status: Int, body: Data) -> ApiError {
        if status == 401 { return .unauthenticated }
        if let p = try? JSONDecoder().decode(Problem.self, from: body) {
            return .problem(
                status: status,
                code: p.code ?? "HTTP_\(status)",
                detail: p.detail ?? p.title ?? "Request failed"
            )
        }
        return .problem(status: status, code: "HTTP_\(status)", detail: "Request failed")
    }
}

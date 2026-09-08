import Foundation

/// Which backend this build talks to.
///
/// Two environments exist and they must never be confused: the demo tenant
/// publishes its own password, so a build pointing at it must not be handed to
/// a real company. The Android app makes this a build type; here it is one
/// switch, read once.
enum Backend {
    case demo
    case production

    /// Development points at the demo: it is seeded, it is safe to write to,
    /// and its password is public by design.
    static let current: Backend = .demo

    var apiBaseURL: URL {
        switch self {
        case .demo: return URL(string: "https://demo.linumic.com/v1")!
        case .production: return URL(string: "https://worktrack-prod.web.app/v1")!
        }
    }

    /// Firebase Web API key. Not a secret — it identifies the project, and
    /// every client that signs in needs it. Authorization is the ID token.
    var firebaseAPIKey: String {
        switch self {
        case .demo: return "AIzaSyA1Kb5qR8UKXLTkpR3o0Qz7xPUT9i7wAxo"
        case .production: return ""   // filled in when a production build is cut
        }
    }
}

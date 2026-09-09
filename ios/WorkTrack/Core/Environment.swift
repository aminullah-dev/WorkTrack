import Foundation

/// Which backend this build talks to.
///
/// Two environments exist and they must never be confused: the demo tenant
/// publishes its own password, so a build pointing at it must not be handed to
/// a real company.
enum Backend {
    case demo
    case production

    /// Tied to the build configuration, not to a constant somebody remembers
    /// to flip.
    ///
    /// It used to be a hand-edited constant, and the failure mode was silent
    /// and total: the first build uploaded to TestFlight was a Release build
    /// still set to `.demo`, so it looked and behaved exactly like the real
    /// app while writing to the demo tenant. Nothing on screen said so. Sent
    /// to the App Store, every customer would have been keeping their
    /// attendance and payroll in a database whose password is published on
    /// purpose.
    ///
    /// A Release build is the only kind that reaches anybody — archive,
    /// TestFlight, App Store — so Release means production and there is no
    /// step left to forget. Development stays on the demo tenant: it is
    /// seeded, safe to write to, and its password is public by design.
    ///
    /// A demo build for customers to try, if it is ever wanted, belongs in a
    /// separate app the way Android does it with `applicationIdSuffix
    /// ".demo"` — two apps side by side, not one app in two moods.
    #if DEBUG
    static let current: Backend = .demo
    #else
    static let current: Backend = .production
    #endif

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
        case .production: return "AIzaSyBhGGgbBqhdsJYpM9FpQld28jyhvEfqWPA"
        }
    }
}

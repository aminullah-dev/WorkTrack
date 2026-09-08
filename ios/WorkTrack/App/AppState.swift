import SwiftUI

/// App-wide preferences. Currently just the language, which drives both the
/// strings and the layout direction.
@MainActor
final class AppState: ObservableObject {
    @Published private(set) var language: Language

    private static let key = "worktrack.language"

    init() {
        let stored = UserDefaults.standard.string(forKey: Self.key)
        // Dari is the default, not the phone's language: an Afghan user with an
        // English handset should still open a Dari app.
        language = stored.flatMap(Language.init(rawValue:)) ?? .dari
        L.language = language
    }

    func setLanguage(_ next: Language) {
        language = next
        L.language = next
        UserDefaults.standard.set(next.rawValue, forKey: Self.key)
    }
}

import Foundation
import Security

/// The Keychain, for the one secret this app holds: the refresh token.
///
/// Not UserDefaults, which is a plist any backup reads. And the Keychain
/// specifically because it SURVIVES the app being deleted and reinstalled —
/// which matters beyond secrecy: whenever this app grows a device identity, it
/// has to live here too, or reinstalling would hand the phone a new identity
/// and take a fresh licence seat every time. See docs/15-ios-app.md.
enum Keychain {
    private static let service = "app.worktrack.auth"

    /// Writes, and says whether it worked.
    ///
    /// The return value is not decoration. Swallowing the OSStatus here meant a
    /// build whose entitlements the Keychain rejected (-34018) failed every
    /// write in silence, and the only symptom was the app asking for the
    /// password on every launch — which reads as a login bug, not a storage
    /// one, and sends you looking in the wrong file.
    @discardableResult
    static func set(_ value: String, for key: String) -> Bool {
        let data = Data(value.utf8)
        var query = baseQuery(key)
        SecItemDelete(query as CFDictionary)
        query[kSecValueData as String] = data
        // Readable only once the device has been unlocked at least once since
        // boot, and never migrated to another device by a backup.
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        if status != errSecSuccess {
            // Logged, not fatal. assertionFailure was wrong twice over: it
            // kills the app on a real phone where the Keychain can genuinely
            // be unavailable — locked before first unlock, or storage full —
            // and it compiles out of a release build, so the silent failure
            // this exists to prevent would come straight back in the build
            // customers actually run.
            //
            // The caller decides what a failed write means. For a refresh
            // token it means "this session will not survive a relaunch",
            // which is survivable; being unable to open the app is not.
            print("[WorkTrack] Keychain write failed for \(key): OSStatus \(status)")
            return false
        }
        return true
    }

    static func get(_ key: String) -> String? {
        var query = baseQuery(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func remove(_ key: String) {
        SecItemDelete(baseQuery(key) as CFDictionary)
    }

    private static func baseQuery(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }
}

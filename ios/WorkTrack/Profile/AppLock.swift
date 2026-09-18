import Foundation
import LocalAuthentication

/// Face ID or the passcode, gating local access to the app.
///
/// The same idea as BiometricLockScreen on Android: the session underneath
/// stays valid, this only decides whether the person holding the phone may see
/// it. That distinction matters — a lock that signed you out would discard the
/// queued punches, and a worker on a shared phone would lose a morning's work
/// to a privacy setting.
///
/// Off by default. A worker with his own handset does not need it, and a
/// biometric prompt on every launch is the kind of thing that gets an app
/// deleted.
@MainActor
final class AppLock: ObservableObject {
    /// True while the app is locked and must show nothing behind it.
    @Published private(set) var isLocked = false
    @Published private(set) var isEnabled: Bool

    /// The phone can do it at all — no Face ID and no passcode means no lock.
    let isAvailable: Bool
    /// What the device actually offers, so the button can name it.
    let biometryName: String

    private static let key = "worktrack.applock"

    init() {
        let context = LAContext()
        var error: NSError?
        isAvailable = context.canEvaluatePolicy(
            .deviceOwnerAuthentication, error: &error
        )
        switch context.biometryType {
        case .faceID: biometryName = "Face ID"
        case .touchID: biometryName = "Touch ID"
        default: biometryName = L.t("lock_passcode")
        }

        let stored = UserDefaults.standard.bool(forKey: Self.key)
        // If the phone lost its passcode, a stored preference would lock
        // somebody out of their own attendance with no way back in.
        isEnabled = stored && isAvailable
        isLocked = isEnabled
    }

    func setEnabled(_ enabled: Bool) {
        isEnabled = enabled && isAvailable
        UserDefaults.standard.set(isEnabled, forKey: Self.key)
    }

    /// Called when the app comes back to the foreground.
    func lockIfNeeded() {
        if isEnabled { isLocked = true }
    }

    /// Prompts, and unlocks only on success.
    func unlock() async {
        guard isEnabled else {
            isLocked = false
            return
        }
        let context = LAContext()
        do {
            // deviceOwnerAuthentication, not …WithBiometrics: a worker whose
            // face is not recognised — dust, a mask, a scarred hand — must
            // still be able to fall back to the passcode rather than being
            // shut out of his own attendance.
            let ok = try await context.evaluatePolicy(
                .deviceOwnerAuthentication, localizedReason: L.t("lock_reason")
            )
            isLocked = !ok
        } catch {
            // Cancelled or failed: stay locked, and let them try again.
            isLocked = true
        }
    }
}

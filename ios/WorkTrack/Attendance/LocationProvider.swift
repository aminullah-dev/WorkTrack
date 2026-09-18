import CoreLocation

/// One location fix, on demand.
///
/// Deliberately not a continuous stream: the app needs a position at the moment
/// somebody punches, and watching location all day is both a battery cost and a
/// privacy claim this product does not need to make. "When in use" only — there
/// is no background tracking here and no plan for any.
@MainActor
final class LocationProvider: NSObject, ObservableObject, CLLocationManagerDelegate {
    enum Failure: Error, Equatable {
        /// The user said no, or the phone forbids it (parental controls, MDM).
        case denied
        /// A fix did not arrive in time — indoors, or a cold start.
        case unavailable
    }

    private let manager = CLLocationManager()
    private var pending: CheckedContinuation<CLLocation, Error>?

    @Published private(set) var authorization: CLAuthorizationStatus

    override init() {
        authorization = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    /// Asks once, then waits for a fix. Throws rather than returning a fake
    /// position — a punch with an invented location is worse than no punch.
    func currentLocation(timeout: TimeInterval = 15) async throws -> CLLocation {
        if authorization == .notDetermined {
            manager.requestWhenInUseAuthorization()
            // The delegate callback flips `authorization`; give it a moment
            // before deciding the answer was no.
            try? await Task.sleep(nanoseconds: 1_500_000_000)
        }
        guard authorization == .authorizedWhenInUse || authorization == .authorizedAlways else {
            throw Failure.denied
        }

        return try await withThrowingTaskGroup(of: CLLocation.self) { group in
            group.addTask { @MainActor in
                try await withCheckedThrowingContinuation { continuation in
                    self.pending = continuation
                    self.manager.requestLocation()
                }
            }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                throw Failure.unavailable
            }
            guard let first = try await group.next() else { throw Failure.unavailable }
            group.cancelAll()
            return first
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]
    ) {
        Task { @MainActor in
            guard let location = locations.last else { return }
            self.pending?.resume(returning: location)
            self.pending = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.pending?.resume(throwing: Failure.unavailable)
            self.pending = nil
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            self.authorization = manager.authorizationStatus
        }
    }
}

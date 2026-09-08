import CoreLocation
import Foundation

/// Punching in and out.
@MainActor
final class AttendanceViewModel: ObservableObject {
    enum Outcome: Equatable {
        /// Recorded and inside the site (or the company drew no fences).
        case accepted(PunchType)
        /// Recorded, but the server flagged it — almost always because the
        /// worker was outside the fence. Deliberately not an error: the punch
        /// exists, and a manager will see it and can correct the day.
        case flagged(reason: String)
        case failed(String)
    }

    @Published private(set) var today: AttendanceDay?
    @Published private(set) var isPunching = false
    @Published private(set) var evaluation: GeofenceEvaluator.Evaluation?
    @Published var outcome: Outcome?

    private let client: ApiClient
    private let location: LocationProvider
    private var fences: [Geofence] = []

    init(client: ApiClient, location: LocationProvider) {
        self.client = client
        self.location = location
    }

    func load(todayISO: String) async {
        async let days: [AttendanceDay] = (try? client.get(
            "attendance/days", query: ["from": todayISO, "to": todayISO]
        )) ?? []
        async let page: SyncPage<Geofence>? = try? client.get(
            "sync/pull", query: ["type": "geofences"]
        )
        today = await days.first
        fences = await page?.items ?? []
    }

    /// Punch. The type is decided from the day the SERVER computed, not from
    /// anything held on the phone — two devices, or a manager's correction,
    /// must not leave the app offering "check in" to somebody already in.
    func punch(todayISO: String) async {
        isPunching = true
        outcome = nil
        defer { isPunching = false }

        let type: PunchType = (today?.isClockedIn ?? false) ? .outbound : .inbound

        let fix: CLLocation
        do {
            fix = try await location.currentLocation()
        } catch LocationProvider.Failure.denied {
            outcome = .failed(L.t("err_location_denied"))
            return
        } catch {
            outcome = .failed(L.t("err_location_unavailable"))
            return
        }

        let accuracy = max(fix.horizontalAccuracy, 0)
        let local = GeofenceEvaluator.evaluate(
            latitude: fix.coordinate.latitude,
            longitude: fix.coordinate.longitude,
            accuracyMeters: accuracy,
            fences: fences
        )
        evaluation = local

        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]

        do {
            let result: PunchResult = try await client.post(
                "attendance/punches",
                body: [
                    // The id is ours, so a replay is the same document twice.
                    "id": ULID.generate(),
                    "punchedAt": iso.string(from: Date()),
                    "type": type.rawValue,
                    "method": "GPS",
                    "latitude": fix.coordinate.latitude,
                    "longitude": fix.coordinate.longitude,
                    "accuracyMeters": accuracy,
                    // Sent for the record; the server re-checks and overrides.
                    "insideFence": local.insideFence,
                ]
            )
            outcome = result.wasAccepted
                ? .accepted(type)
                : .flagged(reason: result.invalidReason ?? "")
            await load(todayISO: todayISO)
        } catch ApiError.offline {
            outcome = .failed(L.t("err_offline"))
        } catch ApiError.problem(_, _, let detail) {
            outcome = .failed(detail)
        } catch {
            outcome = .failed(L.t("err_generic"))
        }
    }
}

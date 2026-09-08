import CoreLocation
import Foundation

/// Punching in and out, with or without signal.
@MainActor
final class AttendanceViewModel: ObservableObject {
    enum Outcome: Equatable {
        /// Reached the server and was inside the site (or no fences exist).
        case accepted(PunchType)
        /// Reached the server, which flagged it — almost always because the
        /// worker was outside the fence. Deliberately not an error: the punch
        /// exists, and a manager sees it and can correct the day.
        case flagged(reason: String)
        /// Saved on the phone. Not a failure — the punch is recorded with the
        /// time it happened and will go when there is signal.
        case queued(PunchType)
        /// Queued so long the server will no longer accept it.
        case expired(count: Int)
        case failed(String)
    }

    @Published private(set) var today: AttendanceDay?
    @Published private(set) var isPunching = false
    @Published private(set) var evaluation: GeofenceEvaluator.Evaluation?
    @Published private(set) var isStale = false
    @Published var outcome: Outcome?

    let outbox: PunchOutbox

    private let client: ApiClient
    private let location: LocationProvider
    private let cache: WorkCache
    private var fences: [Geofence] = []

    init(
        client: ApiClient,
        location: LocationProvider,
        // Defaults are built here rather than in the signature: PunchOutbox is
        // @MainActor because it publishes to the UI, and a default argument is
        // evaluated outside that isolation.
        outbox: PunchOutbox? = nil,
        cache: WorkCache = WorkCache()
    ) {
        self.client = client
        self.location = location
        self.outbox = outbox ?? PunchOutbox()
        self.cache = cache
        // Show something immediately, before any request: a site with no signal
        // is the normal case, not the exception.
        if let cached = cache.load() {
            today = cached.attendance
            fences = cached.fences
            isStale = true
        }
    }

    var pendingCount: Int { outbox.pending.count }

    func load(todayISO: String, work: MyWork? = nil) async {
        let days: [AttendanceDay]? = try? await client.get(
            "attendance/days", query: ["from": todayISO, "to": todayISO]
        )
        let page: SyncPage<Geofence>? = try? await client.get(
            "sync/pull", query: ["type": "geofences"]
        )

        // A failed fetch must not wipe what we already had — that would trade a
        // stale answer for no answer, which is worse.
        if let days {
            today = days.first
            isStale = false
        }
        if let page { fences = page.items }
        if days != nil || page != nil {
            cache.save(work: work ?? cache.load()?.work, attendance: today, fences: fences)
        }
    }

    /// Punch. The type comes from the day the SERVER computed where possible,
    /// so a manager's correction or a second device cannot leave the app
    /// offering "check in" to somebody already in.
    func punch(todayISO: String) async {
        isPunching = true
        outcome = nil
        defer { isPunching = false }

        let type: PunchType = isClockedIn ? .outbound : .inbound

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

        let queued = QueuedPunch(
            id: ULID.generate(),
            // The moment he punched, not the moment it is sent.
            punchedAt: Date(),
            type: type.rawValue,
            latitude: fix.coordinate.latitude,
            longitude: fix.coordinate.longitude,
            accuracyMeters: accuracy,
            insideFence: local.insideFence
        )

        do {
            let result = try await send(queued)
            outcome = result.wasAccepted
                ? .accepted(type)
                : .flagged(reason: result.invalidReason ?? "")
            await load(todayISO: todayISO)
        } catch ApiError.offline {
            // Not a failure. Keep it and say so.
            outbox.enqueue(queued)
            applyLocally(queued)
            outcome = .queued(type)
        } catch ApiError.problem(_, _, let detail) {
            outcome = .failed(detail)
        } catch {
            outcome = .failed(L.t("err_generic"))
        }
    }

    /// Sends everything the queue is holding. Safe to call at any time: each
    /// punch carries its own id, so a send that already landed is a no-op.
    func drain(todayISO: String) async {
        let expired = outbox.discardExpired()
        if !expired.isEmpty { outcome = .expired(count: expired.count) }
        guard !outbox.pending.isEmpty else { return }

        for punch in outbox.pending {
            do {
                _ = try await send(punch)
                outbox.remove(id: punch.id)
            } catch ApiError.offline {
                return  // still no signal; the rest stay queued
            } catch {
                // A business rejection will not become acceptable by repeating
                // it. Drop it so the queue drains, and let the day's record —
                // which the server owns — be the truth.
                outbox.remove(id: punch.id)
            }
        }
        await load(todayISO: todayISO)
    }

    private func send(_ punch: QueuedPunch) async throws -> PunchResult {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        return try await client.post(
            "attendance/punches",
            body: [
                "id": punch.id,
                "punchedAt": iso.string(from: punch.punchedAt),
                "type": punch.type,
                "method": "GPS",
                "latitude": punch.latitude,
                "longitude": punch.longitude,
                "accuracyMeters": punch.accuracyMeters,
                "insideFence": punch.insideFence,
            ]
        )
    }

    /// Whether the worker is in, counting punches the server has not seen yet —
    /// otherwise checking in offline would leave the button still saying
    /// "check in".
    var isClockedIn: Bool {
        if let last = outbox.pending.last { return last.type == PunchType.inbound.rawValue }
        return today?.isClockedIn ?? false
    }

    /// Reflects a queued punch in the visible day so the card is not lying
    /// while the queue waits.
    private func applyLocally(_ punch: QueuedPunch) {
        guard punch.type == PunchType.inbound.rawValue else { return }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        today = AttendanceDay(
            date: today?.date ?? "",
            status: "PRESENT",
            firstInAt: today?.firstInAt ?? iso.string(from: punch.punchedAt),
            lastOutAt: nil,
            workedMinutes: today?.workedMinutes ?? 0
        )
    }
}

import Foundation

/// A punch waiting to reach the server.
///
/// `punchedAt` is the moment the worker actually punched, not the moment it is
/// finally sent. That distinction is the whole point: a man who checks in at
/// 07:00 in a valley with no signal was at work at 07:00, and his day must say
/// so even if the phone only finds a mast at noon.
struct QueuedPunch: Codable, Equatable, Identifiable {
    /// The client-generated ULID. Sending it twice writes the same document
    /// twice, which is once — so a retry can never double-count a day.
    let id: String
    let punchedAt: Date
    let type: String
    let latitude: Double
    let longitude: Double
    let accuracyMeters: Double
    let insideFence: Bool
    /// Failed attempts, kept only so a permanently rejected punch can be given
    /// up on rather than retried until the end of time.
    var attempts: Int = 0
}

/// The queue of punches that have not reached the server yet.
///
/// Deliberately not the Android outbox's shape. That one drains through
/// /sync/push because it batches many resource types; a worker makes two to
/// four punches a day, and POST /attendance/punches is already idempotent on
/// the ULID, so sending them one at a time is simpler and fails in smaller
/// pieces.
@MainActor
final class PunchOutbox: ObservableObject {
    /// Server rule: a punch older than this is refused as TOO_OLD
    /// (MAX_BACKDATE_MS in backend/functions/src/services/punch.ts). Giving up
    /// here means the app can say so instead of retrying something that will
    /// never be accepted.
    static let maxAge: TimeInterval = 7 * 24 * 60 * 60

    @Published private(set) var pending: [QueuedPunch] = []

    private let store: OfflineStore
    private let fileName = "punch-outbox"

    init(store: OfflineStore = OfflineStore()) {
        self.store = store
        pending = store.load([QueuedPunch].self, from: fileName) ?? []
    }

    func enqueue(_ punch: QueuedPunch) {
        // Same id twice is the same punch; the queue is a set, not a log.
        guard !pending.contains(where: { $0.id == punch.id }) else { return }
        pending.append(punch)
        persist()
    }

    func remove(id: String) {
        pending.removeAll { $0.id == id }
        persist()
    }

    /// Punches too old for the server to accept, dropped from the queue.
    /// Returned so the app can tell the worker rather than losing them quietly.
    func discardExpired(now: Date = Date()) -> [QueuedPunch] {
        let expired = pending.filter { now.timeIntervalSince($0.punchedAt) > Self.maxAge }
        guard !expired.isEmpty else { return [] }
        pending.removeAll { punch in expired.contains { $0.id == punch.id } }
        persist()
        return expired
    }

    func recordAttempt(id: String) {
        guard let index = pending.firstIndex(where: { $0.id == id }) else { return }
        pending[index].attempts += 1
        persist()
    }

    private func persist() {
        store.save(pending, to: fileName)
    }
}

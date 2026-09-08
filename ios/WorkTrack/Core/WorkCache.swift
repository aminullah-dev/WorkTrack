import Foundation

/// The last plan and attendance the server gave us, kept so the app opens with
/// something to show on a site with no signal.
///
/// A stale plan shown WITH its age beats an empty screen: a worker who sees
/// yesterday's job knows where he was going, and knows to check. A spinner
/// tells him nothing.
struct CachedDay: Codable, Equatable {
    let fetchedAt: Date
    let work: MyWork?
    let attendance: AttendanceDay?
    let fences: [Geofence]
}

/// Not actor-isolated: it owns no mutable state, only a path on disk.
final class WorkCache: @unchecked Sendable {
    private let store: OfflineStore
    private let fileName = "day-cache"

    init(store: OfflineStore = OfflineStore()) {
        self.store = store
    }

    func load() -> CachedDay? {
        store.load(CachedDay.self, from: fileName)
    }

    func save(work: MyWork?, attendance: AttendanceDay?, fences: [Geofence]) {
        store.save(
            CachedDay(fetchedAt: Date(), work: work, attendance: attendance, fences: fences),
            to: fileName
        )
    }

    func clear() {
        store.remove(fileName)
    }
}

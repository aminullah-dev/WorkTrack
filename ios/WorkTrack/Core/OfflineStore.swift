import Foundation

/// Small, durable, dependency-free storage on disk.
///
/// Not SwiftData (iOS 17, and this app targets 16 so it reaches an iPhone 8),
/// not Core Data, not a SQLite package. What this app has to keep is a handful
/// of queued punches and one day's plan — JSON in Application Support is the
/// right size for that, and it is the format a person can read when they are
/// trying to work out what a phone in Kabul is holding.
///
/// Application Support rather than Caches, because the system evicts Caches
/// under disk pressure and an unsent punch is somebody's pay.
struct OfflineStore {
    private let directory: URL
    private let fileManager = FileManager.default

    init(directory: URL? = nil) {
        if let directory {
            self.directory = directory
        } else {
            let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            self.directory = base.appendingPathComponent("WorkTrack", isDirectory: true)
        }
        try? fileManager.createDirectory(at: self.directory, withIntermediateDirectories: true)
        // Nothing here should ride to iCloud and land on another handset: a
        // queued punch belongs to this device's session, not to the account.
        var url = self.directory
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
    }

    func load<T: Decodable>(_ type: T.Type, from name: String) -> T? {
        guard let data = try? Data(contentsOf: url(name)) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    func save(_ value: some Encodable, to name: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        // Atomic: a phone that dies mid-write must not leave half a queue.
        try? data.write(to: url(name), options: .atomic)
    }

    func remove(_ name: String) {
        try? fileManager.removeItem(at: url(name))
    }

    private func url(_ name: String) -> URL {
        directory.appendingPathComponent("\(name).json")
    }
}

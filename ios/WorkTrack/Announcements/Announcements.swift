import Foundation

enum AnnouncementPriority: String, Codable {
    case normal = "NORMAL"
    case important = "IMPORTANT"
    case urgent = "URGENT"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        // An unknown priority is NORMAL, never URGENT: a server that grows a
        // fourth level must not start shouting at everybody.
        self = AnnouncementPriority(rawValue: raw) ?? .normal
    }

    var label: String {
        switch self {
        case .normal: return ""
        case .important: return L.t("ann_important")
        case .urgent: return L.t("ann_urgent")
        }
    }
}

/// A notice from the company.
struct Announcement: Codable, Identifiable, Equatable {
    let id: String
    let title: String
    let body: String
    let priority: AnnouncementPriority
    let publishedAt: String
    let expiresAt: String?
    let createdByName: String?
}

/// What the company is telling everybody.
@MainActor
final class AnnouncementsViewModel: ObservableObject {
    enum State: Equatable {
        case loading
        case loaded([Announcement])
        case failed(String)
    }

    @Published private(set) var state: State = .loading
    /// How many the worker has not opened yet, for the tab badge.
    @Published private(set) var unreadCount = 0

    private let client: ApiClient
    private let store: OfflineStore
    private let readFile = "announcements-read"

    init(client: ApiClient, store: OfflineStore = OfflineStore()) {
        self.client = client
        self.store = store
    }

    func load() async {
        do {
            let items: [Announcement] = try await client.get("announcements")
            // Newest first. The server already filters out unpublished and
            // expired ones, so what arrives is what should be shown.
            let sorted = items.sorted { $0.publishedAt > $1.publishedAt }
            state = .loaded(sorted)
            recount(sorted)
        } catch ApiError.offline {
            state = .failed(L.t("err_offline"))
        } catch {
            state = .failed(L.t("err_generic"))
        }
    }

    /// Marks everything currently listed as seen.
    ///
    /// Read state is per-device and stays on the phone: the server has no
    /// notion of it, and inventing one would mean writing to the tenant every
    /// time somebody opens a tab.
    func markAllRead() {
        guard case .loaded(let items) = state else { return }
        store.save(items.map(\.id), to: readFile)
        unreadCount = 0
    }

    private func recount(_ items: [Announcement]) {
        let seen = Set(store.load([String].self, from: readFile) ?? [])
        unreadCount = items.filter { !seen.contains($0.id) }.count
    }
}

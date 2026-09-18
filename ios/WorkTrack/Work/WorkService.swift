import Foundation

/// The employee's own work.
@MainActor
final class WorkViewModel: ObservableObject {
    enum State: Equatable {
        case loading
        case loaded(MyWork)
        case failed(String)
    }

    @Published private(set) var state: State = .loading
    /// Set while a status change is in flight, so a row can show it is busy.
    @Published private(set) var pendingTaskId: String?

    /// True when what is on screen came off the disk, not the server.
    @Published private(set) var isStale = false
    /// When that cached copy was fetched, so the app can say how old it is.
    @Published private(set) var fetchedAt: Date?

    private let client: ApiClient
    private let cache: WorkCache

    init(client: ApiClient, cache: WorkCache = WorkCache()) {
        self.client = client
        self.cache = cache
        // Open with the last plan rather than a spinner. A worker on a site
        // with no signal still needs to know where he is going.
        if let cached = cache.load(), let work = cached.work {
            state = .loaded(work)
            isStale = true
            fetchedAt = cached.fetchedAt
        }
    }

    func load() async {
        do {
            // No date parameter: the server knows what day it is where the
            // company is. A phone set to another timezone would ask about the
            // wrong one.
            let work: MyWork = try await client.get("work/mine")
            state = .loaded(work)
            isStale = false
            fetchedAt = Date()
            let existing = cache.load()
            cache.save(
                work: work,
                attendance: existing?.attendance,
                fences: existing?.fences ?? []
            )
        } catch ApiError.offline {
            // Keep showing the cached plan rather than replacing it with an
            // error: a stale answer beats no answer, as long as it says so.
            if case .loaded = state { isStale = true } else {
                state = .failed(L.t("err_offline"))
            }
        } catch {
            if case .loaded = state { isStale = true } else {
                state = .failed(L.t("err_generic"))
            }
        }
    }

    /// Report progress. Online only — the Android outbox carries creations, and
    /// there is no equivalent here yet, so a failure says so rather than
    /// quietly showing a tick the foreman never saw.
    func setStatus(_ task: WorkTask, to status: TaskStatus) async {
        pendingTaskId = task.id
        defer { pendingTaskId = nil }
        do {
            let _: WorkTask = try await client.post(
                "work/tasks/\(task.id)/status",
                body: ["status": status.rawValue]
            )
            await load()
        } catch ApiError.offline {
            state = .failed(L.t("err_offline"))
        } catch {
            state = .failed(L.t("err_generic"))
        }
    }
}

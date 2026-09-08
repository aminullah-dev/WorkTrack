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

    private let client: ApiClient

    init(client: ApiClient) {
        self.client = client
    }

    func load() async {
        do {
            // No date parameter: the server knows what day it is where the
            // company is. A phone set to another timezone would ask about the
            // wrong one.
            state = .loaded(try await client.get("work/mine"))
        } catch ApiError.offline {
            state = .failed(L.t("err_offline"))
        } catch {
            state = .failed(L.t("err_generic"))
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

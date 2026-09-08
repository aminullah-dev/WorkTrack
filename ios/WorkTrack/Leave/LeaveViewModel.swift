import Foundation

/// The employee's own leave: what is left, what is asked for, and asking.
@MainActor
final class LeaveViewModel: ObservableObject {
    struct Overview: Equatable {
        let balances: [LeaveBalance]
        let requests: [LeaveRequest]
        let types: [LeaveType]

        func typeName(_ id: String) -> String {
            types.first { $0.id == id }?.name ?? id
        }
    }

    enum State: Equatable {
        case loading
        case loaded(Overview)
        case failed(String)
    }

    @Published private(set) var state: State = .loading
    @Published private(set) var isSubmitting = false
    @Published var submitError: String?

    private let client: ApiClient

    init(client: ApiClient) {
        self.client = client
    }

    func load() async {
        do {
            // Three reads, run together: the balances carry only a type id, so
            // the names have to come from somewhere.
            async let balances: [LeaveBalance] = client.get("leave/balances")
            async let requests: [LeaveRequest] = client.get(
                "leave/requests", query: ["scope": "mine"]
            )
            async let types: [LeaveType] = client.get("leave/types")

            state = .loaded(Overview(
                balances: try await balances,
                requests: try await requests.sorted { $0.startDate > $1.startDate },
                types: try await types
            ))
        } catch ApiError.offline {
            state = .failed(L.t("err_offline"))
        } catch {
            state = .failed(L.t("err_generic"))
        }
    }

    /// Ask for leave. Online only: a request the approver cannot see is not a
    /// request, and queuing one would tell the worker it was filed when nobody
    /// has it.
    func apply(typeId: String, from: String, to: String, reason: String) async -> Bool {
        isSubmitting = true
        submitError = nil
        defer { isSubmitting = false }
        do {
            let _: LeaveRequest = try await client.post(
                "leave/requests",
                body: [
                    // Client-generated, like a punch: a resend is the same
                    // request, not a second one.
                    "id": ULID.generate(),
                    "leaveTypeId": typeId,
                    "startDate": from,
                    "endDate": to,
                    "reason": reason,
                ]
            )
            await load()
            return true
        } catch ApiError.offline {
            submitError = L.t("err_offline")
        } catch ApiError.problem(_, let code, let detail) {
            // The server refuses an overlapping request or one with no balance
            // left; both are things the worker can act on, so show its words.
            submitError = code == "INSUFFICIENT_LEAVE_BALANCE"
                ? L.t("leave_no_balance") : detail
        } catch {
            submitError = L.t("err_generic")
        }
        return false
    }

    func cancel(_ request: LeaveRequest) async {
        guard request.isCancellable else { return }
        do {
            let _: LeaveRequest = try await client.post(
                "leave/requests/\(request.id)/cancel", body: [:]
            )
            await load()
        } catch {
            submitError = L.t("err_generic")
        }
    }
}

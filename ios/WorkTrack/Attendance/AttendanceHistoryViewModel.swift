import Foundation

/// The worker's own attendance, and the corrections asked for on it.
@MainActor
final class AttendanceHistoryViewModel: ObservableObject {
    struct Overview: Equatable {
        let days: [AttendanceDay]
        let corrections: [Regularization]

        /// A day already has a pending correction — asking twice is confusing
        /// for everyone, and the server would file a second one.
        func pendingCorrection(on date: String) -> Regularization? {
            corrections.first { $0.date == date && $0.status == .pending }
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

    /// How far back the list goes. A month covers the pay period somebody is
    /// actually querying; older than that and the payroll run has closed.
    private static let daysBack = 30

    private let client: ApiClient

    init(client: ApiClient) {
        self.client = client
    }

    func load() async {
        let to = Self.isoDate(Date())
        let from = Self.isoDate(Date().addingTimeInterval(-Double(Self.daysBack) * 86_400))
        do {
            async let days: [AttendanceDay] = client.get(
                "attendance/days", query: ["from": from, "to": to]
            )
            async let corrections: [Regularization] = client.get(
                "attendance/regularizations", query: ["scope": "mine"]
            )
            state = .loaded(Overview(
                // Newest first: a correction is almost always about yesterday.
                days: try await days.sorted { $0.date > $1.date },
                corrections: try await corrections
            ))
        } catch ApiError.offline {
            state = .failed(L.t("err_offline"))
        } catch {
            state = .failed(L.t("err_generic"))
        }
    }

    /// File a correction. Online only: a request nobody can see is not a
    /// request, and the approver is the point of it.
    func requestCorrection(
        date: String, inAt: Date?, outAt: Date?, reason: String
    ) async -> Bool {
        isSubmitting = true
        submitError = nil
        defer { isSubmitting = false }

        var body: [String: Any] = [
            "id": ULID.generate(),
            "date": date,
            "reason": reason,
        ]
        // Both are optional and either may be the one that is wrong — somebody
        // who forgot to check OUT should not have to restate when they came in.
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        if let inAt { body["requestedInAt"] = iso.string(from: inAt) }
        if let outAt { body["requestedOutAt"] = iso.string(from: outAt) }

        do {
            let _: Regularization = try await client.post(
                "attendance/regularizations", body: body
            )
            await load()
            return true
        } catch ApiError.offline {
            submitError = L.t("err_offline")
        } catch ApiError.problem(_, _, let detail) {
            submitError = detail
        } catch {
            submitError = L.t("err_generic")
        }
        return false
    }

    /// The company's day, not the phone's.
    static func isoDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Asia/Kabul")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}

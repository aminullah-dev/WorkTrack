import Foundation

/// The employee's own payslips, month by month.
@MainActor
final class PayslipsViewModel: ObservableObject {
    enum State: Equatable {
        case loading
        case loaded([Payslip])
        case failed(String)
    }

    @Published private(set) var state: State = .loading
    @Published private(set) var year: Int

    private let client: ApiClient

    init(client: ApiClient) {
        self.client = client
        // The CURRENT Solar Hijri year, not the Gregorian one. Sending 2026
        // here returns an empty list from a perfectly healthy server, which is
        // the sort of bug that reads as "I have never been paid".
        year = AfghanCalendar.currentShamsiYear()
    }

    func load() async {
        do {
            let slips: [Payslip] = try await client.get(
                "payslips", query: ["year": String(year)]
            )
            // Newest month first: the one somebody opens the app for.
            state = .loaded(slips.sorted { $0.periodMonth > $1.periodMonth })
        } catch ApiError.offline {
            state = .failed(L.t("err_offline"))
        } catch {
            state = .failed(L.t("err_generic"))
        }
    }

    func show(year newYear: Int) async {
        year = newYear
        state = .loading
        await load()
    }
}

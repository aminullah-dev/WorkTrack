import SwiftUI

/// Payslips, month by month.
struct PayslipsView: View {
    @EnvironmentObject private var app: AppState
    @StateObject private var model: PayslipsViewModel

    init(client: ApiClient) {
        _model = StateObject(wrappedValue: PayslipsViewModel(client: client))
    }

    var body: some View {
        NavigationStack {
            Group {
                switch model.state {
                case .loading:
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                case .failed(let message):
                    RetryState(message: message) { Task { await model.load() } }
                case .loaded(let slips):
                    if slips.isEmpty {
                        RetryState(message: L.t("pay_none")) { Task { await model.load() } }
                    } else {
                        List(slips) { slip in
                            NavigationLink {
                                PayslipDetailView(slip: slip)
                            } label: {
                                row(slip)
                            }
                        }
                        .listStyle(.insetGrouped)
                        .refreshable { await model.load() }
                    }
                }
            }
            .navigationTitle(L.t("pay_title"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    // Solar Hijri years, because that is what the payslip is
                    // filed under.
                    Menu(L.n(model.year)) {
                        ForEach((model.year - 3...model.year).reversed(), id: \.self) { year in
                            Button(L.n(year)) { Task { await model.show(year: year) } }
                        }
                    }
                }
            }
        }
        .task { await model.load() }
    }

    private func row(_ slip: Payslip) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(AfghanCalendar.monthName(slip.periodMonth, language: app.language))
                    .font(.headline)
                Text(L.n(slip.periodYear)).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            // The net figure, because that is the number a worker is looking
            // for — the gross is on the detail screen.
            Text(AfghanCalendar.money(slip.net, currency: slip.currency, language: app.language))
                .font(.callout).fontWeight(.semibold)
        }
        .padding(.vertical, 4)
    }
}

struct PayslipDetailView: View {
    let slip: Payslip
    @EnvironmentObject private var app: AppState

    var body: some View {
        List {
            Section {
                amount(L.t("pay_net"), slip.net, emphasised: true)
            } header: {
                Text("\(AfghanCalendar.monthName(slip.periodMonth, language: app.language)) \(L.n(slip.periodYear))")
            }

            Section(L.t("pay_earnings")) {
                ForEach(slip.earnings) { line in
                    amount(line.componentName, line.amount)
                }
                amount(L.t("pay_gross"), slip.gross, emphasised: true)
            }

            Section(L.t("pay_deductions")) {
                // The server already sends income tax as one of these lines;
                // adding it again from `incomeTax` listed it twice and made the
                // column stop adding up.
                ForEach(slip.deductions) { line in
                    amount(line.componentName, line.amount)
                }
                amount(L.t("pay_total_deductions"), slip.totalDeductions, emphasised: true)
            }

            if !slip.employerCosts.isEmpty {
                Section {
                    ForEach(slip.employerCosts) { line in
                        amount(line.componentName, line.amount)
                    }
                } header: {
                    Text(L.t("pay_employer_cost"))
                } footer: {
                    // Said plainly, because a number under a payslip that is
                    // not explained is assumed to have been taken from you.
                    Text(L.t("pay_employer_cost_note"))
                }
            }

            Section(L.t("pay_days")) {
                if let worked = slip.workedDays { count(L.t("pay_worked_days"), worked) }
                if let paid = slip.paidLeaveDays, paid > 0 { count(L.t("pay_paid_leave"), paid) }
                // Unpaid absence, named plainly. This is the line that makes
                // somebody come and ask, and they are entitled to.
                if let lop = slip.lopDays, lop > 0 { count(L.t("pay_lop"), lop) }
            }
        }
        .navigationTitle(L.t("pay_title"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func amount(_ label: String, _ value: Double, emphasised: Bool = false) -> some View {
        HStack {
            Text(label).fontWeight(emphasised ? .semibold : .regular)
            Spacer()
            Text(AfghanCalendar.money(value, currency: slip.currency, language: app.language))
                .fontWeight(emphasised ? .semibold : .regular)
                .foregroundStyle(emphasised ? Palette.deep : .primary)
        }
    }

    private func count(_ label: String, _ value: Double) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(L.n(value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)))
                .foregroundStyle(.secondary)
        }
    }
}

import SwiftUI

/// Leave: what is left, what has been asked for, and asking for more.
struct LeaveView: View {
    @EnvironmentObject private var app: AppState
    @StateObject private var model: LeaveViewModel
    @State private var applying = false

    init(client: ApiClient) {
        _model = StateObject(wrappedValue: LeaveViewModel(client: client))
    }

    var body: some View {
        NavigationStack {
            Group {
                switch model.state {
                case .loading:
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                case .failed(let message):
                    RetryState(message: message) { Task { await model.load() } }
                case .loaded(let overview):
                    List {
                        Section(L.t("leave_balances")) {
                            if overview.balances.isEmpty {
                                Text(L.t("leave_no_balances"))
                                    .font(.subheadline).foregroundStyle(.secondary)
                            }
                            ForEach(overview.balances) { balance in
                                balanceRow(balance, name: overview.typeName(balance.leaveTypeId))
                            }
                        }

                        Section(L.t("leave_my_requests")) {
                            if overview.requests.isEmpty {
                                Text(L.t("leave_none_yet"))
                                    .font(.subheadline).foregroundStyle(.secondary)
                            }
                            ForEach(overview.requests) { request in
                                requestRow(request, name: overview.typeName(request.leaveTypeId))
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .refreshable { await model.load() }
                }
            }
            .navigationTitle(L.t("leave_title"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(L.t("leave_apply")) { applying = true }
                        .fontWeight(.semibold)
                }
            }
            .sheet(isPresented: $applying) {
                if case .loaded(let overview) = model.state {
                    LeaveApplyView(model: model, types: overview.types)
                }
            }
        }
        .task { await model.load() }
    }

    private func balanceRow(_ balance: LeaveBalance, name: String) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.headline)
                // Both halves of the sum, because "12 left" invites the
                // question "out of what?" and a worker planning a trip needs
                // to see that pending days are already spoken for.
                //
                // Separate Texts, NOT one interpolated string. With a neutral
                // "·" between two numbers the bidi algorithm reorders them and
                // the digits collide: used=2, pending=0 rendered as "۲۰
                // استفاده‌شده" — twenty days used, to anyone reading it.
                HStack(spacing: 4) {
                    Text(L.t("leave_used"))
                    Text(L.n(days(balance.usedDays))).fontWeight(.medium)
                    Text("·")
                    Text(L.t("leave_pending_days"))
                    Text(L.n(days(balance.pendingDays))).fontWeight(.medium)
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 0) {
                Text(L.n(days(balance.availableDays)))
                    .font(.title3).fontWeight(.semibold)
                    .foregroundStyle(balance.availableDays > 0 ? Palette.deep : Palette.negative)
                Text(L.t("leave_days_left")).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private func requestRow(_ request: LeaveRequest, name: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(name).font(.headline)
                Spacer()
                Pill(text: request.status.label, tone: tone(request.status))
            }
            // Same reason as above: the day count sat against the year and
            // read as one number.
            HStack(spacing: 6) {
                Text(dateRange(request))
                Text("·")
                Text("\(L.n(days(request.days))) \(L.t("leave_days"))")
            }
            .font(.subheadline).foregroundStyle(.secondary)
            if !request.reason.isEmpty {
                Text(request.reason).font(.caption)
            }
            if let note = request.decisionNote, !note.isEmpty {
                Text(note).font(.caption).foregroundStyle(Palette.warning)
            }
            if request.isCancellable {
                Button(L.t("leave_cancel"), role: .destructive) {
                    Task { await model.cancel(request) }
                }
                .font(.caption)
            }
        }
        .padding(.vertical, 4)
    }

    private func dateRange(_ request: LeaveRequest) -> String {
        let from = AfghanCalendar.parseISODate(request.startDate)
        let to = AfghanCalendar.parseISODate(request.endDate)
        guard let from, let to else { return "" }
        if request.startDate == request.endDate {
            return AfghanCalendar.format(from, language: app.language)
        }
        return "\(AfghanCalendar.format(from, language: app.language, withYear: false)) – \(AfghanCalendar.format(to, language: app.language))"
    }

    /// Half days are real (startHalfDay/endHalfDay), so 2.5 must not render
    /// as "2" or as "2.50".
    private func days(_ value: Double) -> String {
        value == value.rounded()
            ? String(Int(value))
            : String(format: "%.1f", value)
    }

    private func tone(_ status: LeaveStatus) -> Color {
        switch status {
        case .approved: return Palette.positive
        case .pending: return Palette.warning
        case .rejected: return Palette.negative
        case .cancelled: return Palette.neutral
        }
    }
}

/// Shared empty/error state with a retry.
struct RetryState: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text(message).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button(L.t("retry"), action: retry)
                .fontWeight(.semibold).foregroundStyle(Palette.deep)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

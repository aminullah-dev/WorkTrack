import SwiftUI

/// The worker's own attendance, day by day, and the way to say a day is wrong.
///
/// History and corrections are one screen on purpose: nobody asks for a
/// correction in the abstract — they look at a day, see it is wrong, and say
/// so. Two screens would make them carry the date in their head.
struct AttendanceHistoryView: View {
    @EnvironmentObject private var app: AppState
    @StateObject private var model: AttendanceHistoryViewModel
    @State private var correcting: AttendanceDay?

    init(client: ApiClient) {
        _model = StateObject(wrappedValue: AttendanceHistoryViewModel(client: client))
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
                    if overview.days.isEmpty {
                        RetryState(message: L.t("hist_none")) { Task { await model.load() } }
                    } else {
                        List(overview.days, id: \.date) { day in
                            row(day, pending: overview.pendingCorrection(on: day.date))
                        }
                        .listStyle(.insetGrouped)
                        .refreshable { await model.load() }
                    }
                }
            }
            .navigationTitle(L.t("hist_title"))
            .sheet(item: $correcting) { day in
                CorrectionRequestView(model: model, day: day)
            }
        }
        .task { await model.load() }
    }

    private func row(_ day: AttendanceDay, pending: Regularization?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    if let date = AfghanCalendar.parseISODate(day.date) {
                        Text(AfghanCalendar.format(date, language: app.language, withYear: false))
                            .font(.headline)
                    }
                    HStack(spacing: 6) {
                        Text(clock(day.firstInAt) ?? "—")
                        Text("←")
                        Text(clock(day.lastOutAt) ?? "—")
                    }
                    .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Pill(
                    text: (day.status ?? .pending).label,
                    tone: statusTone(day.status ?? .pending)
                )
            }

            if let pending {
                // Say it is already asked for, rather than offering the button
                // again and letting them file a second one.
                Label(L.t("hist_correction_pending"), systemImage: "clock.arrow.circlepath")
                    .font(.caption).foregroundStyle(Palette.warning)
                if !pending.reason.isEmpty {
                    Text(pending.reason).font(.caption2).foregroundStyle(.secondary)
                }
            } else {
                Button(L.t("hist_request_correction")) { correcting = day }
                    .font(.caption).foregroundStyle(Palette.deep)
            }
        }
        .padding(.vertical, 4)
    }

    private func statusTone(_ status: AttendanceDayStatus) -> Color {
        switch status {
        case .present: return Palette.positive
        // Absent is the one worth colouring: it is the day somebody comes to
        // ask about, and it is the one that costs them pay.
        case .absent: return Palette.negative
        case .halfDay: return Palette.warning
        default: return Palette.neutral
        }
    }

    private func clock(_ iso: String?) -> String? {
        guard let iso else { return nil }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else {
            return nil
        }
        let out = DateFormatter()
        out.dateFormat = "HH:mm"
        out.timeZone = TimeZone(identifier: "Asia/Kabul")
        return L.n(out.string(from: date))
    }
}

extension AttendanceDay: Identifiable {
    public var id: String { date }
}

/// Asking for one day to be corrected.
struct CorrectionRequestView: View {
    @ObservedObject var model: AttendanceHistoryViewModel
    let day: AttendanceDay

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var app: AppState
    @State private var fixIn = false
    @State private var fixOut = false
    @State private var inAt = Date()
    @State private var outAt = Date()
    @State private var reason = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    // Each time is opt-in. Somebody who forgot to check OUT
                    // should not have to restate when they arrived — and a
                    // restated time that differs slightly would look like a
                    // second thing to approve.
                    Toggle(L.t("hist_fix_in"), isOn: $fixIn)
                    if fixIn {
                        DatePicker(L.t("hist_in_time"), selection: $inAt,
                                   displayedComponents: .hourAndMinute)
                    }
                    Toggle(L.t("hist_fix_out"), isOn: $fixOut)
                    if fixOut {
                        DatePicker(L.t("hist_out_time"), selection: $outAt,
                                   displayedComponents: .hourAndMinute)
                    }
                } header: {
                    if let date = AfghanCalendar.parseISODate(day.date) {
                        Text(AfghanCalendar.format(date, language: app.language))
                    }
                } footer: {
                    Text(L.t("hist_correction_note"))
                }

                Section(L.t("leave_reason")) {
                    TextField(L.t("hist_reason_hint"), text: $reason, axis: .vertical)
                        .lineLimit(3...6)
                }

                if let error = model.submitError {
                    Section { Text(error).foregroundStyle(Palette.negative).font(.subheadline) }
                }
            }
            .navigationTitle(L.t("hist_request_correction"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L.t("common_cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L.t("leave_send")) {
                        Task {
                            if await model.requestCorrection(
                                date: day.date,
                                inAt: fixIn ? Self.combine(day.date, inAt) : nil,
                                outAt: fixOut ? Self.combine(day.date, outAt) : nil,
                                reason: reason.trimmingCharacters(in: .whitespacesAndNewlines)
                            ) { dismiss() }
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(!canSubmit)
                }
            }
        }
    }

    private var canSubmit: Bool {
        // At least one time, or there is nothing to correct.
        (fixIn || fixOut)
            && !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !model.isSubmitting
    }

    /// The wall-clock time the worker picked, on the day being corrected, read
    /// as the company's local time.
    ///
    /// Two timezones meet here and mixing them up is silent. The picker shows
    /// and returns the DEVICE's wall clock, so "2:02 PM" must be read in the
    /// device's zone — that is the number the person actually saw. What they
    /// MEAN by it is 2:02 PM at the site, so those digits are then placed on
    /// the corrected day in Kabul.
    ///
    /// Reading the components in Kabul instead silently shifts the request by
    /// the offset between the handset and the site: a phone still set to
    /// Toronto turned a 2:02 PM correction into 22:32, and nothing anywhere
    /// would have said so.
    static func combine(_ date: String, _ time: Date, deviceZone: TimeZone = .current) -> Date? {
        guard let site = TimeZone(identifier: "Asia/Kabul"),
              let day = AfghanCalendar.parseISODate(date) else { return nil }

        var asDisplayed = Calendar(identifier: .gregorian)
        asDisplayed.timeZone = deviceZone
        let clock = asDisplayed.dateComponents([.hour, .minute], from: time)

        var atSite = Calendar(identifier: .gregorian)
        atSite.timeZone = site
        // The DATE comes from the day being corrected, which is already a plain
        // calendar date, so it is read in the site's zone like everything else.
        var parts = atSite.dateComponents([.year, .month, .day], from: day)
        parts.hour = clock.hour
        parts.minute = clock.minute
        parts.timeZone = site
        return atSite.date(from: parts)
    }
}

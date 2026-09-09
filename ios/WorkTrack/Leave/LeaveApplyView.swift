import SwiftUI

/// Asking for leave.
struct LeaveApplyView: View {
    @ObservedObject var model: LeaveViewModel
    let types: [LeaveType]

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var app: AppState
    @State private var typeId = ""
    @State private var from = Date()
    @State private var to = Date()
    @State private var reason = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(L.t("leave_type"), selection: $typeId) {
                        ForEach(types) { type in Text(type.name).tag(type.id) }
                    }
                    DatePicker(
                        L.t("leave_from"), selection: $from, displayedComponents: .date
                    )
                    DatePicker(
                        // Never before the start: the server rejects it, and
                        // being told so after typing a reason is a wasted trip.
                        L.t("leave_to"), selection: $to, in: from..., displayedComponents: .date
                    )
                } footer: {
                    Text(shamsiRange).font(.caption)
                }

                Section(L.t("leave_reason")) {
                    TextField(L.t("leave_reason_hint"), text: $reason, axis: .vertical)
                        .lineLimit(3...6)
                }

                if let error = model.submitError {
                    Section { Text(error).foregroundStyle(Palette.negative).font(.subheadline) }
                }
            }
            .navigationTitle(L.t("leave_apply"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L.t("common_cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L.t("leave_send")) {
                        Task {
                            if await model.apply(
                                typeId: typeId, from: iso(from), to: iso(to),
                                reason: reason.trimmingCharacters(in: .whitespacesAndNewlines)
                            ) { dismiss() }
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(!canSubmit)
                }
            }
            .onAppear { if typeId.isEmpty { typeId = types.first?.id ?? "" } }
        }
    }

    private var canSubmit: Bool {
        !typeId.isEmpty
            && !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !model.isSubmitting
    }

    /// The dates in the calendar people actually use, under the pickers —
    /// which show Gregorian, because that is what iOS gives.
    private var shamsiRange: String {
        let start = AfghanCalendar.format(from, language: app.language)
        let end = AfghanCalendar.format(to, language: app.language)
        return start == end ? start : "\(start) – \(end)"
    }

    private func iso(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        // The company's day: a request made late at night from another
        // timezone must not land on yesterday.
        f.timeZone = TimeZone(identifier: "Asia/Kabul")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}

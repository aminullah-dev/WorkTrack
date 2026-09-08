import SwiftUI

/// Check in, check out, and where you are standing while you do it.
struct PunchCard: View {
    @ObservedObject var model: AttendanceViewModel
    let todayISO: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(isIn ? L.t("punch_state_in") : L.t("punch_state_out"))
                        .font(.headline)
                    if let first = model.today?.firstInAt {
                        Text("\(L.t("punch_first_in")) \(clock(first))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    if let minutes = model.today?.workedMinutes, minutes > 0 {
                        Text("\(L.t("punch_worked")) \(L.n(minutes / 60)):\(L.n(String(format: "%02d", minutes % 60)))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                // Whether he is CHECKED IN — not whether he is on site. They
                // are different facts and the card shows both; using the same
                // words for each had it reading "on site" and "outside the
                // site" at the same time.
                Pill(
                    text: isIn ? L.t("chip_present") : L.t("chip_away"),
                    tone: isIn ? Palette.positive : Palette.neutral
                )
            }

            if let evaluation = model.evaluation {
                distanceLine(evaluation)
            }

            Button {
                Task { await model.punch(todayISO: todayISO) }
            } label: {
                Text(buttonLabel)
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity, minHeight: 48)
            }
            .background(isIn ? Palette.accent : Palette.deep, in: RoundedRectangle(cornerRadius: 12))
            .foregroundStyle(.white)
            .disabled(model.isPunching)
            .opacity(model.isPunching ? 0.6 : 1)

            if let outcome = model.outcome {
                outcomeLine(outcome)
            }
        }
        .padding(.vertical, 6)
    }

    private var isIn: Bool { model.today?.isClockedIn ?? false }

    private var buttonLabel: String {
        if model.isPunching { return L.t("punching") }
        return isIn ? L.t("punch_out") : L.t("punch_in")
    }

    @ViewBuilder
    private func distanceLine(_ e: GeofenceEvaluator.Evaluation) -> some View {
        if !e.fencesConfigured {
            Text(L.t("punch_no_fences")).font(.caption).foregroundStyle(.secondary)
        } else if let distance = e.distanceMeters {
            HStack(spacing: 6) {
                Image(systemName: e.insideFence ? "location.fill" : "location.slash")
                Text(e.insideFence ? L.t("punch_inside") : L.t("punch_outside"))
                Text("·")
                // The number matters when it is bad news: "you are 340 m away"
                // is actionable, "outside the site" alone is not.
                Text("\(L.t("punch_distance")) \(L.n(Int(distance))) \(L.t("punch_meters"))")
            }
            .font(.caption)
            .foregroundStyle(e.insideFence ? Palette.positive : Palette.warning)
        }
    }

    @ViewBuilder
    private func outcomeLine(_ outcome: AttendanceViewModel.Outcome) -> some View {
        switch outcome {
        case .accepted(let type):
            label(type == .inbound ? L.t("punch_ok_in") : L.t("punch_ok_out"),
                  icon: "checkmark.circle.fill", tone: Palette.positive)
        case .flagged:
            // Recorded, not refused — and the app says which, because a worker
            // who thinks he failed to check in will stand there trying again.
            label(L.t("punch_flagged"), icon: "exclamationmark.triangle.fill", tone: Palette.warning)
        case .queued:
            // Not a failure, and the wording matters: a worker told his punch
            // "failed" stands at the gate doing it again.
            label(L.t("punch_queued"), icon: "tray.and.arrow.down.fill", tone: Palette.deep)
        case .expired:
            label(L.t("punch_expired"), icon: "clock.badge.exclamationmark", tone: Palette.negative)
        case .failed(let message):
            label(message, icon: "xmark.circle.fill", tone: Palette.negative)
        }
    }

    private func label(_ text: String, icon: String, tone: Color) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Image(systemName: icon)
            Text(text)
        }
        .font(.caption).foregroundStyle(tone)
    }

    /// "۰۸:۱۵" from the server's ISO timestamp, in the company's zone.
    private func clock(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return "" }
        let out = DateFormatter()
        out.dateFormat = "HH:mm"
        out.timeZone = TimeZone(identifier: "Asia/Kabul")
        return L.n(out.string(from: date))
    }
}

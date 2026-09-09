import SwiftUI

/// Says plainly what the phone is holding and how old what you are reading is.
///
/// The alternative — a silent app that looks normal — is what makes somebody
/// believe a punch went through when it is sitting in a queue.
struct OfflineBanner: View {
    let isOnline: Bool
    let pending: Int
    let fetchedAt: Date?

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: isOnline ? "arrow.triangle.2.circlepath" : "wifi.slash")
            VStack(alignment: .leading, spacing: 2) {
                Text(headline).fontWeight(.medium)
                if let age = ageText {
                    Text(age).font(.caption2).foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        .font(.caption)
        .foregroundStyle(pending > 0 ? Palette.warning : Palette.neutral)
        .padding(.vertical, 4)
    }

    private var headline: String {
        if pending > 0 {
            return "\(L.t("offline_pending")) (\(L.n(pending)))"
        }
        return isOnline ? L.t("offline_stale") : L.t("offline_now")
    }

    private var ageText: String? {
        guard let fetchedAt else { return nil }
        let minutes = Int(Date().timeIntervalSince(fetchedAt) / 60)
        if minutes < 1 { return nil }
        if minutes < 60 { return "\(L.t("offline_updated")) \(L.n(minutes)) \(L.t("offline_minutes"))" }
        return "\(L.t("offline_updated")) \(L.n(minutes / 60)) \(L.t("offline_hours"))"
    }
}

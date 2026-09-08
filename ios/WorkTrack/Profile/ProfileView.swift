import SwiftUI

/// Who you are, how the app is set, and the way out.
///
/// The language switch lived in a menu behind an ellipsis on one tab, which is
/// the wrong place for the setting a worker is most likely to need on day one —
/// a Pashto speaker handed a Dari app has to find it before anything else makes
/// sense.
struct ProfileView: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var app: AppState
    @ObservedObject var attendance: AttendanceViewModel
    @ObservedObject var lock: AppLock
    @State private var confirmingSignOut = false

    var body: some View {
        NavigationStack {
            List {
                if case .signedIn(let me) = auth.state {
                    Section {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(me.displayName).font(.headline)
                            Text(me.companyName).font(.subheadline).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section(L.t("profile_language")) {
                    // A plain picker, not a menu: three options, and the one a
                    // worker needs first.
                    Picker(L.t("profile_language"), selection: languageBinding) {
                        ForEach(Language.allCases, id: \.self) { language in
                            Text(language.label).tag(language)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                }

                Section {
                    if attendance.pendingCount > 0 {
                        // The one piece of state a worker has a right to see:
                        // whether the phone is still holding something of his.
                        Label {
                            Text("\(L.t("profile_pending")) (\(L.n(attendance.pendingCount)))")
                        } icon: {
                            Image(systemName: "tray.and.arrow.up.fill")
                        }
                        .foregroundStyle(Palette.warning)
                    } else {
                        Label(L.t("profile_all_sent"), systemImage: "checkmark.circle.fill")
                            .foregroundStyle(Palette.positive)
                    }
                } header: {
                    Text(L.t("profile_sync"))
                } footer: {
                    if attendance.pendingCount > 0 {
                        Text(L.t("profile_pending_note"))
                    }
                }

                Section {
                    Toggle(L.t("lock_setting"), isOn: lockBinding)
                        .disabled(!lock.isAvailable)
                } footer: {
                    Text(lock.isAvailable ? L.t("lock_note") : L.t("lock_unavailable"))
                }

                Section {
                    Button(L.t("sign_out"), role: .destructive) { confirmingSignOut = true }
                } footer: {
                    Text("\(L.t("profile_version")) \(L.n(Self.version))")
                }
            }
            .navigationTitle(L.t("tab_profile"))
            .confirmationDialog(
                // Signing out clears the queue and the cached day, so it is
                // worth one question — especially with an unsent punch on the
                // phone.
                signOutPrompt,
                isPresented: $confirmingSignOut,
                titleVisibility: .visible
            ) {
                Button(L.t("sign_out"), role: .destructive) { auth.signOut() }
                Button(L.t("common_cancel"), role: .cancel) {}
            }
        }
    }

    private var signOutPrompt: String {
        attendance.pendingCount > 0
            ? L.t("profile_sign_out_pending")
            : L.t("profile_sign_out_confirm")
    }

    private var lockBinding: Binding<Bool> {
        Binding(get: { lock.isEnabled }, set: { lock.setEnabled($0) })
    }

    private var languageBinding: Binding<Language> {
        Binding(get: { app.language }, set: { app.setLanguage($0) })
    }

    private static var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "0"
        let build = info?["CFBundleVersion"] as? String ?? "0"
        return "\(short) (\(build))"
    }
}

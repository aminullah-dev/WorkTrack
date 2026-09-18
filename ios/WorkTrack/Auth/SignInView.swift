import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(L.t("sign_in_title")).font(.largeTitle).fontWeight(.bold)
                    Text(L.t("sign_in_subtitle"))
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(.top, 48)

                field(L.t("email")) {
                    TextField("", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        // An email is always Latin script; letting it inherit
                        // the RTL layout puts the caret on the wrong side.
                        .environment(\.layoutDirection, .leftToRight)
                        .multilineTextAlignment(.leading)
                }

                field(L.t("password")) {
                    SecureField("", text: $password)
                        .textContentType(.password)
                        .environment(\.layoutDirection, .leftToRight)
                        .multilineTextAlignment(.leading)
                }

                if let error = auth.signInError {
                    Text(error).font(.footnote).foregroundStyle(Palette.negative)
                }

                Button {
                    Task { await auth.signIn(email: email, password: password) }
                } label: {
                    Text(auth.isSigningIn ? L.t("signing_in") : L.t("sign_in"))
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
                .background(Palette.deep, in: RoundedRectangle(cornerRadius: 12))
                .foregroundStyle(.white)
                .disabled(auth.isSigningIn || email.isEmpty || password.isEmpty)
                .opacity(auth.isSigningIn || email.isEmpty || password.isEmpty ? 0.6 : 1)

                LanguagePicker()
                    .padding(.top, 8)
            }
            .padding(24)
        }
    }

    @ViewBuilder
    private func field(_ label: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.footnote).foregroundStyle(.secondary)
            content()
                .padding(12)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
        }
    }
}

/// Language is a first-class choice, not a setting buried three screens deep.
struct LanguagePicker: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        HStack(spacing: 8) {
            ForEach(Language.allCases, id: \.self) { lang in
                Button(lang.label) { app.setLanguage(lang) }
                    .font(.footnote)
                    .fontWeight(app.language == lang ? .semibold : .regular)
                    .foregroundStyle(app.language == lang ? Palette.deep : .secondary)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(
                        app.language == lang ? Palette.deep.opacity(0.1) : .clear,
                        in: Capsule()
                    )
            }
        }
    }
}

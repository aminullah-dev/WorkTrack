import SwiftUI

/// What is shown while the app is locked. Nothing of the worker's is behind it.
struct AppLockScreen: View {
    @ObservedObject var lock: AppLock

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "lock.fill")
                .font(.system(size: 44))
                .foregroundStyle(Palette.deep)
            Text(L.t("lock_title")).font(.headline)
            Button(L.t("lock_unlock")) {
                Task { await lock.unlock() }
            }
            .fontWeight(.semibold)
            .foregroundStyle(.white)
            .padding(.horizontal, 28).padding(.vertical, 12)
            .background(Palette.deep, in: Capsule())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
        // The prompt fires by itself, so the usual case is one glance and in.
        .task { await lock.unlock() }
    }
}

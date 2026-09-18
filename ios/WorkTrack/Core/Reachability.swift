import Combine
import Network

/// Whether there is a path to the network right now.
///
/// Used to decide whether to try at all and to drain the queue the moment
/// signal comes back — not to decide whether a punch is allowed. A punch is
/// always allowed; the only question is whether it goes now or later.
@MainActor
final class Reachability: ObservableObject {
    @Published private(set) var isOnline = true

    private let monitor = NWPathMonitor()
    private var onRestored: (() -> Void)?

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                guard let self else { return }
                let nowOnline = path.status == .satisfied
                let wasOffline = !self.isOnline
                self.isOnline = nowOnline
                if nowOnline && wasOffline { self.onRestored?() }
            }
        }
        monitor.start(queue: DispatchQueue(label: "app.worktrack.reachability"))
    }

    /// Called when the network comes back after being away.
    func whenRestored(_ action: @escaping () -> Void) {
        onRestored = action
    }

    deinit { monitor.cancel() }
}

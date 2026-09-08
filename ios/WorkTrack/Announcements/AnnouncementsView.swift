import SwiftUI

/// Company notices.
struct AnnouncementsView: View {
    @EnvironmentObject private var app: AppState
    @StateObject private var model: AnnouncementsViewModel

    init(client: ApiClient) {
        _model = StateObject(wrappedValue: AnnouncementsViewModel(client: client))
    }

    var body: some View {
        NavigationStack {
            Group {
                switch model.state {
                case .loading:
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                case .failed(let message):
                    RetryState(message: message) { Task { await model.load() } }
                case .loaded(let items):
                    if items.isEmpty {
                        RetryState(message: L.t("ann_none")) { Task { await model.load() } }
                    } else {
                        List(items) { announcement in
                            row(announcement)
                        }
                        .listStyle(.insetGrouped)
                        .refreshable { await model.load() }
                    }
                }
            }
            .navigationTitle(L.t("ann_title"))
        }
        .task {
            await model.load()
            // Opening the tab IS reading them; a separate "mark read" would be
            // a chore nobody performs.
            model.markAllRead()
        }
        .badge(model.unreadCount)
    }

    private func row(_ announcement: Announcement) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                Text(announcement.title).font(.headline)
                Spacer()
                if announcement.priority != .normal {
                    Pill(
                        text: announcement.priority.label,
                        tone: announcement.priority == .urgent ? Palette.negative : Palette.warning
                    )
                }
            }
            Text(announcement.body).font(.subheadline)

            HStack(spacing: 6) {
                if let date = published(announcement) {
                    Text(AfghanCalendar.format(date, language: app.language))
                }
                if let author = announcement.createdByName, !author.isEmpty {
                    Text("·")
                    Text(author)
                }
            }
            .font(.caption2).foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }

    private func published(_ announcement: Announcement) -> Date? {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return parser.date(from: announcement.publishedAt)
            ?? ISO8601DateFormatter().date(from: announcement.publishedAt)
    }
}

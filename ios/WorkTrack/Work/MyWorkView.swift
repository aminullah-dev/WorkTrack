import SwiftUI

/// What this employee is on today, and on their next working day.
///
/// The reason the app exists for a worker: he opens it on the way in and knows
/// which part of the job he is on before he walks to the wrong one.
struct MyWorkView: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var app: AppState
    @StateObject private var model: WorkViewModel
    @ObservedObject private var attendance: AttendanceViewModel
    @StateObject private var reachability = Reachability()
    @StateObject private var notices: AnnouncementsViewModel

    /// The company's today, from the server's own timezone — not the phone's.
    private let todayISO: String

    /// The attendance model is owned by SignedInTabs and shared with the
    /// profile screen; the cache file is shared too, because the plan and the
    /// attendance day belong to the same day and must not overwrite each other.
    init(client: ApiClient, attendance: AttendanceViewModel, cache: WorkCache) {
        _model = StateObject(wrappedValue: WorkViewModel(client: client, cache: cache))
        _notices = StateObject(wrappedValue: AnnouncementsViewModel(client: client))
        self.attendance = attendance
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "Asia/Kabul")
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        todayISO = f.string(from: Date())
    }

    var body: some View {
        NavigationStack {
            Group {
                switch model.state {
                case .loading:
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                case .failed(let message):
                    VStack(spacing: 12) {
                        Text(message).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        Button(L.t("retry")) { Task { await model.load() } }
                            .fontWeight(.semibold).foregroundStyle(Palette.deep)
                    }
                    .padding(32)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .loaded(let work):
                    List {
                        if !reachability.isOnline || attendance.pendingCount > 0 || model.isStale {
                            Section { OfflineBanner(
                                isOnline: reachability.isOnline,
                                pending: attendance.pendingCount,
                                fetchedAt: model.fetchedAt
                            ) }
                        }
                        Section {
                            PunchCard(
                                model: attendance,
                                todayISO: todayISO,
                                faceService: faceService,
                                hasEnrolledFace: me?.hasFace ?? false
                            )
                        }
                        daySection(L.t("work_today"), work.today, isToday: true)
                        if let next = work.next {
                            daySection(L.t("work_next"), next, isToday: false)
                        }
                        noticesSection
                    }
                    .listStyle(.insetGrouped)
                    .refreshable {
                        await model.load()
                        await attendance.load(todayISO: todayISO, work: loadedWork)
                        await attendance.drain(todayISO: todayISO)
                    }
                }
            }
            .navigationTitle(L.t("work_title"))
        }
        .task {
            await notices.load()
            await model.load()
            await attendance.load(todayISO: todayISO, work: loadedWork)
            // Anything the phone was holding goes now.
            await attendance.drain(todayISO: todayISO)
            reachability.whenRestored {
                Task { await attendance.drain(todayISO: todayISO) }
            }
        }
    }

    @ViewBuilder
    private func daySection(_ label: String, _ day: WorkDay, isToday: Bool) -> some View {
        Section {
            if day.tasks.isEmpty {
                // An empty day says why. A blank card reads as "the app is
                // broken" or, worse, as "nothing to do" — and those are not
                // the same thing.
                Text(emptyMessage(for: day, isToday: isToday))
                    .font(.subheadline).foregroundStyle(.secondary)
                    .padding(.vertical, 6)
            } else {
                ForEach(day.tasks) { task in
                    TaskRow(
                        task: task,
                        actionable: isToday,
                        isBusy: model.pendingTaskId == task.id,
                        onStatus: { status in Task { await model.setStatus(task, to: status) } }
                    )
                }
            }
        } header: {
            HStack {
                Text(label)
                Spacer()
                if let date = AfghanCalendar.parseISODate(day.date) {
                    Text(AfghanCalendar.format(date, language: app.language))
                        .foregroundStyle(.secondary)
                }
            }
            .font(.subheadline).textCase(nil)
        }
    }

    /// Company notices, under the day's work.
    ///
    /// Not a tab: iOS allows five, and a sixth is folded into a system "More"
    /// menu that arrives in English and hides the screen behind an extra tap.
    /// This is also where the Android dashboard puts them, and a worker reading
    /// his day is the moment he will actually read a notice.
    @ViewBuilder
    private var noticesSection: some View {
        if case .loaded(let items) = notices.state, !items.isEmpty {
            Section(L.t("ann_title")) {
                ForEach(items.prefix(3)) { announcement in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .top) {
                            Text(announcement.title).font(.subheadline).fontWeight(.medium)
                            Spacer()
                            if announcement.priority != .normal {
                                Pill(
                                    text: announcement.priority.label,
                                    tone: announcement.priority == .urgent
                                        ? Palette.negative : Palette.warning
                                )
                            }
                        }
                        Text(announcement.body)
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                }
                if items.count > 3 {
                    NavigationLink(L.t("ann_all")) {
                        AnnouncementsList(items: items)
                    }
                    .font(.caption)
                }
            }
        }
    }

    private var me: Me? {
        if case .signedIn(let me) = auth.state { return me }
        return nil
    }

    /// Built once, and only for a company that has face check-in switched on —
    /// loading the model costs memory no other company should pay.
    private var faceService: FaceService? {
        guard me?.faceEnabled == true, let embedder = try? FaceEmbedder() else { return nil }
        return FaceService(client: auth.client, embedder: embedder)
    }

    private var loadedWork: MyWork? {
        if case .loaded(let work) = model.state { return work }
        return nil
    }

    private func emptyMessage(for day: WorkDay, isToday: Bool) -> String {
        switch day.kind {
        case .weekend: return L.t("work_weekend")
        case .holiday: return L.t("work_holiday")
        case .working: return L.t(isToday ? "work_none_today" : "work_none_next")
        }
    }
}

private struct TaskRow: View {
    let task: WorkTask
    let actionable: Bool
    let isBusy: Bool
    let onStatus: (TaskStatus) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(task.title).font(.headline)
                    // Which part of the job, and where on the site.
                    Text([task.projectName, task.location].compactMap { $0 }.joined(separator: " — "))
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Pill(text: task.status.label, tone: task.status.tone)
            }

            if let detail = task.detail, !detail.isEmpty {
                Text(detail).font(.subheadline)
            }

            HStack(spacing: 8) {
                Pill(text: task.isTeamWork ? L.t("work_team") : L.t("work_solo"))
                if let team = task.teamName {
                    Text(team).font(.caption).foregroundStyle(.secondary)
                }
            }

            if task.isTeamWork {
                // Two Texts rather than one interpolated string: with the label
                // and the names in one run, the bidi algorithm pushes the colon
                // to the far side and it reads ":همراه".
                HStack(spacing: 4) {
                    Text(L.t("work_with")).fontWeight(.medium)
                    Text(task.assigneeNames.joined(separator: "، "))
                }
                .font(.caption).foregroundStyle(.secondary)
            }

            // Only today's work can be reported on: marking tomorrow's job
            // finished today is never something the worker meant to do.
            if actionable && task.status != .done {
                HStack(spacing: 10) {
                    if task.status != .inProgress {
                        Button(L.t("work_start")) { onStatus(.inProgress) }
                            .buttonStyle(.bordered)
                    }
                    Button(L.t("work_finish")) { onStatus(.done) }
                        .buttonStyle(.borderedProminent)
                        .tint(Palette.deep)
                }
                .disabled(isBusy)
                .opacity(isBusy ? 0.5 : 1)
                // A List row swallows taps otherwise, firing whichever button
                // the row thinks it owns.
                .buttonStyle(.automatic)
            }
        }
        .padding(.vertical, 6)
    }
}

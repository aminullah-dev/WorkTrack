import XCTest
@testable import WorkTrack

/// The queue that holds a worker's pay until there is signal.
///
/// Every one of these is about not losing a punch, or not counting one twice.
@MainActor
final class PunchOutboxTests: XCTestCase {

    private var directory: URL!
    private var store: OfflineStore!

    override func setUp() {
        super.setUp()
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
        store = OfflineStore(directory: directory)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    private func punch(
        _ id: String = ULID.generate(), at date: Date = Date(), type: String = "IN"
    ) -> QueuedPunch {
        QueuedPunch(
            id: id, punchedAt: date, type: type,
            latitude: 34.5553, longitude: 69.2075, accuracyMeters: 10, insideFence: true
        )
    }

    func testSurvivesTheAppBeingKilled() {
        // The whole point. A phone that dies in a valley must still be holding
        // the punch when it comes back on.
        let first = PunchOutbox(store: store)
        first.enqueue(punch("01ABCDEFGHJKMNPQRSTVWXYZ00"))
        XCTAssertEqual(first.pending.count, 1)

        let reopened = PunchOutbox(store: store)
        XCTAssertEqual(reopened.pending.count, 1)
        XCTAssertEqual(reopened.pending.first?.id, "01ABCDEFGHJKMNPQRSTVWXYZ00")
    }

    func testTheSamePunchIsNeverQueuedTwice() {
        let outbox = PunchOutbox(store: store)
        let p = punch("01ABCDEFGHJKMNPQRSTVWXYZ01")
        outbox.enqueue(p)
        outbox.enqueue(p)
        XCTAssertEqual(outbox.pending.count, 1)
    }

    func testKeepsTheTimeItHappened_notTheTimeItIsSent() throws {
        // A man who checked in at 07:00 with no signal was at work at 07:00.
        let sevenAM = Date(timeIntervalSince1970: 1_800_000_000)
        let outbox = PunchOutbox(store: store)
        outbox.enqueue(punch(at: sevenAM))

        let reopened = PunchOutbox(store: store)
        let stored = try XCTUnwrap(reopened.pending.first).punchedAt
        XCTAssertEqual(stored.timeIntervalSince1970, sevenAM.timeIntervalSince1970, accuracy: 0.001)
    }

    func testDropsPunchesTheServerWillNeverAccept() {
        // Server rule: older than 7 days is refused as TOO_OLD. Retrying it
        // forever would keep a queue that can never drain.
        let outbox = PunchOutbox(store: store)
        let old = punch("01ABCDEFGHJKMNPQRSTVWXYZ02", at: Date().addingTimeInterval(-8 * 86_400))
        let fresh = punch("01ABCDEFGHJKMNPQRSTVWXYZ03")
        outbox.enqueue(old)
        outbox.enqueue(fresh)

        let discarded = outbox.discardExpired()
        XCTAssertEqual(discarded.map(\.id), [old.id])
        XCTAssertEqual(outbox.pending.map(\.id), [fresh.id])
    }

    func testKeepsAPunchThatIsStillWithinTheWindow() {
        let outbox = PunchOutbox(store: store)
        outbox.enqueue(punch(at: Date().addingTimeInterval(-6 * 86_400)))
        XCTAssertTrue(outbox.discardExpired().isEmpty)
        XCTAssertEqual(outbox.pending.count, 1)
    }

    func testRemovingOneLeavesTheRest() {
        let outbox = PunchOutbox(store: store)
        outbox.enqueue(punch("01ABCDEFGHJKMNPQRSTVWXYZ04"))
        outbox.enqueue(punch("01ABCDEFGHJKMNPQRSTVWXYZ05"))
        outbox.remove(id: "01ABCDEFGHJKMNPQRSTVWXYZ04")

        XCTAssertEqual(PunchOutbox(store: store).pending.map(\.id),
                       ["01ABCDEFGHJKMNPQRSTVWXYZ05"])
    }
}

/// The cached day.
@MainActor
final class WorkCacheTests: XCTestCase {

    private var directory: URL!

    override func setUp() {
        super.setUp()
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    func testHandsBackTheLastPlanAfterARestart() {
        // So a worker on a site with no signal opens the app to his job, not
        // to a spinner.
        let store = OfflineStore(directory: directory)
        let task = WorkTask(
            id: "t1", projectName: "برج دارالامان", title: "قالب‌بندی",
            detail: nil, location: "بلاک B", status: .inProgress,
            teamName: "تیم کانکریت", assigneeNames: ["احمد", "عمر"]
        )
        let work = MyWork(
            today: WorkDay(date: "2026-09-08", kind: .working, tasks: [task]),
            next: WorkDay(date: "2026-09-09", kind: .working, tasks: [])
        )
        WorkCache(store: store).save(work: work, attendance: nil, fences: [])

        let reopened = WorkCache(store: store).load()
        XCTAssertEqual(reopened?.work?.today.tasks.first?.title, "قالب‌بندی")
        XCTAssertEqual(reopened?.work?.today.tasks.first?.status, .inProgress)
        XCTAssertNotNil(reopened?.fetchedAt)
    }

    func testAnEmptyCacheIsNotAnError() {
        XCTAssertNil(WorkCache(store: OfflineStore(directory: directory)).load())
    }

    func testKeepsTheFencesSoADistanceCanStillBeShownOffline() {
        let store = OfflineStore(directory: directory)
        let fence = Geofence(id: "f1", name: "دفتر", latitude: 34.5553,
                             longitude: 69.2075, radiusMeters: 250, active: true)
        WorkCache(store: store).save(work: nil, attendance: nil, fences: [fence])

        XCTAssertEqual(WorkCache(store: store).load()?.fences.first?.radiusMeters, 250)
    }
}

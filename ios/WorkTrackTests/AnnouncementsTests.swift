import XCTest
@testable import WorkTrack

@MainActor
final class AnnouncementsTests: XCTestCase {

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

    private func decode(_ priority: String) throws -> Announcement {
        let json = """
        {"id":"a1","title":"پرداخت معاش","body":"معاش این ماه واریز می‌شود.",
         "priority":"\(priority)","publishedAt":"2026-09-08T16:57:09.202Z",
         "expiresAt":null,"createdByName":"زهرا نوری"}
        """
        return try JSONDecoder().decode(Announcement.self, from: Data(json.utf8))
    }

    func testDecodesTheServersAnnouncement() throws {
        let announcement = try decode("NORMAL")
        XCTAssertEqual(announcement.title, "پرداخت معاش")
        XCTAssertEqual(announcement.createdByName, "زهرا نوری")
        XCTAssertEqual(announcement.priority, .normal)
    }

    func testAnUnknownPriorityIsNormal_neverUrgent() {
        // A server that grows a fourth level must not start shouting at
        // everybody; defaulting the other way would make every new notice
        // arrive red.
        XCTAssertEqual(try decode("SOMETHING_NEW").priority, .normal)
        XCTAssertEqual(try decode("URGENT").priority, .urgent)
    }

    func testNormalPriorityShowsNoBadgeText() {
        // The chip is only drawn for the two that mean something; an empty
        // label would render an empty pill.
        XCTAssertTrue(try decode("NORMAL").priority.label.isEmpty)
        XCTAssertFalse(try decode("URGENT").priority.label.isEmpty)
    }

    func testReadStateSurvivesARestartAndStaysOnThisDevice() {
        // Per-device on purpose: the server has no notion of read state, and
        // inventing one would mean writing to the tenant every time somebody
        // opens a tab.
        let store = OfflineStore(directory: directory)
        store.save(["a1", "a2"], to: "announcements-read")

        let reopened = OfflineStore(directory: directory)
            .load([String].self, from: "announcements-read")
        XCTAssertEqual(reopened, ["a1", "a2"])
    }
}

import XCTest
@testable import WorkTrack

/// Decoding what the server actually sends.
final class WorkModelsTests: XCTestCase {

    private func decode(_ json: String) throws -> MyWork {
        try JSONDecoder().decode(MyWork.self, from: Data(json.utf8))
    }

    func testDecodesADayOfWork() throws {
        let work = try decode("""
        {"today":{"date":"2026-09-08","kind":"WORKING","tasks":[
          {"id":"t1","projectName":"برج دارالامان","title":"قالب‌بندی","detail":null,
           "location":"بلاک B","status":"IN_PROGRESS","teamName":"تیم کانکریت",
           "assigneeNames":["احمد کریمی","عمر صدیقی"]}]},
         "next":{"date":"2026-09-09","kind":"WORKING","tasks":[]}}
        """)

        XCTAssertEqual(work.today.tasks.count, 1)
        XCTAssertEqual(work.today.tasks[0].status, .inProgress)
        XCTAssertTrue(work.today.tasks[0].isTeamWork)
        XCTAssertEqual(work.next?.date, "2026-09-09")
        XCTAssertTrue(work.next?.tasks.isEmpty ?? false)
    }

    func testOneNameIsNotTeamWork() throws {
        let work = try decode("""
        {"today":{"date":"2026-09-08","kind":"WORKING","tasks":[
          {"id":"t1","projectName":"p","title":"t","detail":null,"location":null,
           "status":"PLANNED","teamName":null,"assigneeNames":["Ali"]}]},"next":null}
        """)
        XCTAssertFalse(work.today.tasks[0].isTeamWork)
        XCTAssertNil(work.next)
    }

    func testAnUnknownStatusDoesNotBlankTheDay() throws {
        // A server that grows a fifth status must not cost an employee their
        // whole day's plan.
        let work = try decode("""
        {"today":{"date":"2026-09-08","kind":"SOMETHING_NEW","tasks":[
          {"id":"t1","projectName":"p","title":"t","detail":null,"location":null,
           "status":"ON_HOLD","teamName":null,"assigneeNames":[]}]},"next":null}
        """)
        XCTAssertEqual(work.today.tasks[0].status, .planned)
        XCTAssertEqual(work.today.kind, .working)
    }

    func testWeekendIsCarriedSoTheAppCanSayWhyADayIsEmpty() throws {
        let work = try decode("""
        {"today":{"date":"2026-09-11","kind":"WEEKEND","tasks":[]},"next":null}
        """)
        XCTAssertEqual(work.today.kind, .weekend)
    }
}

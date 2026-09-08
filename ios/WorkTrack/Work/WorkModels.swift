import Foundation

enum TaskStatus: String, Decodable {
    case planned = "PLANNED"
    case inProgress = "IN_PROGRESS"
    case done = "DONE"
    case blocked = "BLOCKED"

    /// Unknown values decode as PLANNED rather than failing the whole page: a
    /// server that grows a fifth status must not blank an employee's day.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = TaskStatus(rawValue: raw) ?? .planned
    }

    var label: String {
        switch self {
        case .planned: return L.t("status_planned")
        case .inProgress: return L.t("status_in_progress")
        case .done: return L.t("status_done")
        case .blocked: return L.t("status_blocked")
        }
    }
}

enum DayKind: String, Decodable {
    case working = "WORKING"
    case weekend = "WEEKEND"
    case holiday = "HOLIDAY"

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = DayKind(rawValue: raw) ?? .working
    }
}

struct WorkTask: Decodable, Identifiable, Equatable {
    let id: String
    let projectName: String
    let title: String
    let detail: String?
    let location: String?
    let status: TaskStatus
    let teamName: String?
    let assigneeNames: [String]

    /// More than one name on it means a crew job, not a solo one.
    var isTeamWork: Bool { assigneeNames.count > 1 }
}

struct WorkDay: Decodable, Equatable {
    /// Plain `yyyy-MM-dd`; the server's calendar date, not a timestamp.
    let date: String
    let kind: DayKind
    let tasks: [WorkTask]
}

/// Today, and the next day the employee is actually expected in — which after
/// a Thursday is Saturday, because Friday is the weekend here. The server works
/// that out from the company's own calendar; the app just shows what it says.
struct MyWork: Decodable, Equatable {
    let today: WorkDay
    let next: WorkDay?
}

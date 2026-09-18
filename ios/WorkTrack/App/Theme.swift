import SwiftUI

/// The palette, from the brand: linumic orange on a deep teal-ink ground.
enum Palette {
    static let accent = Color(red: 1.0, green: 0.427, blue: 0.255)      // #FF6D41
    static let ink = Color(red: 0.039, green: 0.153, blue: 0.208)       // #0A2735
    static let deep = Color(red: 0.0, green: 0.306, blue: 0.447)        // #004E72
    static let surface = Color(red: 0.976, green: 0.976, blue: 0.976)   // #F9F9F9

    static let positive = Color(red: 0.18, green: 0.49, blue: 0.20)
    static let warning = Color(red: 0.72, green: 0.47, blue: 0.0)
    static let negative = Color(red: 0.70, green: 0.15, blue: 0.12)
    static let neutral = Color.secondary
}

extension TaskStatus {
    var tone: Color {
        switch self {
        case .planned: return Palette.neutral
        case .inProgress: return Palette.warning
        case .done: return Palette.positive
        case .blocked: return Palette.negative
        }
    }
}

/// A small pill, the same idea as the portal's `Chip`.
struct Pill: View {
    let text: String
    var tone: Color = Palette.neutral

    var body: some View {
        Text(text)
            .font(.caption).fontWeight(.medium)
            .foregroundStyle(tone)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(tone.opacity(0.12), in: Capsule())
    }
}

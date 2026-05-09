import Foundation

public enum SageLocationMode: String, Codable, Sendable, CaseIterable {
    case off
    case whileUsing
    case always
}

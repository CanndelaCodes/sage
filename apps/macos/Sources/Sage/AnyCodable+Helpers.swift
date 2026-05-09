import SageKit
import SageProtocol
import Foundation

// Prefer the SageKit wrapper to keep gateway request payloads consistent.
typealias AnyCodable = SageKit.AnyCodable
typealias InstanceIdentity = SageKit.InstanceIdentity

extension AnyCodable {
    var stringValue: String? { self.value as? String }
    var boolValue: Bool? { self.value as? Bool }
    var intValue: Int? { self.value as? Int }
    var doubleValue: Double? { self.value as? Double }
    var dictionaryValue: [String: AnyCodable]? { self.value as? [String: AnyCodable] }
    var arrayValue: [AnyCodable]? { self.value as? [AnyCodable] }

    var foundationValue: Any {
        switch self.value {
        case let dict as [String: AnyCodable]:
            dict.mapValues { $0.foundationValue }
        case let array as [AnyCodable]:
            array.map(\.foundationValue)
        default:
            self.value
        }
    }
}

extension SageProtocol.AnyCodable {
    var stringValue: String? { self.value as? String }
    var boolValue: Bool? { self.value as? Bool }
    var intValue: Int? { self.value as? Int }
    var doubleValue: Double? { self.value as? Double }
    var dictionaryValue: [String: SageProtocol.AnyCodable]? { self.value as? [String: SageProtocol.AnyCodable] }
    var arrayValue: [SageProtocol.AnyCodable]? { self.value as? [SageProtocol.AnyCodable] }

    var foundationValue: Any {
        switch self.value {
        case let dict as [String: SageProtocol.AnyCodable]:
            dict.mapValues { $0.foundationValue }
        case let array as [SageProtocol.AnyCodable]:
            array.map(\.foundationValue)
        default:
            self.value
        }
    }
}

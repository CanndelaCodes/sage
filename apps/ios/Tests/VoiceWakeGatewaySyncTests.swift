import Foundation
import Testing
@testable import Sage

@Suite struct VoiceWakeGatewaySyncTests {
    @Test func decodeGatewayTriggersFromJSONSanitizes() {
        let payload = #"{"triggers":[" sage  ","", "computer"]}"#
        let triggers = VoiceWakePreferences.decodeGatewayTriggers(from: payload)
        #expect(triggers == ["sage", "computer"])
    }

    @Test func decodeGatewayTriggersFromJSONFallsBackWhenEmpty() {
        let payload = #"{"triggers":["  ",""]}"#
        let triggers = VoiceWakePreferences.decodeGatewayTriggers(from: payload)
        #expect(triggers == VoiceWakePreferences.defaultTriggerWords)
    }

    @Test func decodeGatewayTriggersFromInvalidJSONReturnsNil() {
        let triggers = VoiceWakePreferences.decodeGatewayTriggers(from: "not json")
        #expect(triggers == nil)
    }
}

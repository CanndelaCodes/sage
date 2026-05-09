import Foundation
import Testing
@testable import Sage

@Suite(.serialized)
struct SageConfigFileTests {
    @Test
    func configPathRespectsEnvOverride() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("sage-config-\(UUID().uuidString)")
            .appendingPathComponent("sage.json")
            .path

        await TestIsolation.withEnvValues(["SAGE_CONFIG_PATH": override]) {
            #expect(SageConfigFile.url().path == override)
        }
    }

    @MainActor
    @Test
    func remoteGatewayPortParsesAndMatchesHost() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("sage-config-\(UUID().uuidString)")
            .appendingPathComponent("sage.json")
            .path

        await TestIsolation.withEnvValues(["SAGE_CONFIG_PATH": override]) {
            SageConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "ws://gateway.ts.net:19999",
                    ],
                ],
            ])
            #expect(SageConfigFile.remoteGatewayPort() == 19999)
            #expect(SageConfigFile.remoteGatewayPort(matchingHost: "gateway.ts.net") == 19999)
            #expect(SageConfigFile.remoteGatewayPort(matchingHost: "gateway") == 19999)
            #expect(SageConfigFile.remoteGatewayPort(matchingHost: "other.ts.net") == nil)
        }
    }

    @MainActor
    @Test
    func setRemoteGatewayUrlPreservesScheme() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("sage-config-\(UUID().uuidString)")
            .appendingPathComponent("sage.json")
            .path

        await TestIsolation.withEnvValues(["SAGE_CONFIG_PATH": override]) {
            SageConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "wss://old-host:111",
                    ],
                ],
            ])
            SageConfigFile.setRemoteGatewayUrl(host: "new-host", port: 2222)
            let root = SageConfigFile.loadDict()
            let url = ((root["gateway"] as? [String: Any])?["remote"] as? [String: Any])?["url"] as? String
            #expect(url == "wss://new-host:2222")
        }
    }

    @Test
    func stateDirOverrideSetsConfigPath() async {
        let dir = FileManager().temporaryDirectory
            .appendingPathComponent("sage-state-\(UUID().uuidString)", isDirectory: true)
            .path

        await TestIsolation.withEnvValues([
            "SAGE_CONFIG_PATH": nil,
            "SAGE_STATE_DIR": dir,
        ]) {
            #expect(SageConfigFile.stateDirURL().path == dir)
            #expect(SageConfigFile.url().path == "\(dir)/sage.json")
        }
    }
}

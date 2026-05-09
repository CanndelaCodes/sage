// swift-tools-version: 6.2
// Package manifest for the Sage macOS companion (menu bar app + IPC library).

import PackageDescription

let package = Package(
    name: "Sage",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "SageIPC", targets: ["SageIPC"]),
        .library(name: "SageDiscovery", targets: ["SageDiscovery"]),
        .executable(name: "Sage", targets: ["Sage"]),
        .executable(name: "sage-mac", targets: ["SageMacCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.2.2"),
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.1.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.8.0"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.8.1"),
        .package(url: "https://github.com/steipete/Peekaboo.git", branch: "main"),
        .package(path: "../shared/SageKit"),
        .package(path: "../../Swabble"),
    ],
    targets: [
        .target(
            name: "SageIPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "SageDiscovery",
            dependencies: [
                .product(name: "SageKit", package: "SageKit"),
            ],
            path: "Sources/SageDiscovery",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "Sage",
            dependencies: [
                "SageIPC",
                "SageDiscovery",
                .product(name: "SageKit", package: "SageKit"),
                .product(name: "SageChatUI", package: "SageKit"),
                .product(name: "SageProtocol", package: "SageKit"),
                .product(name: "SwabbleKit", package: "swabble"),
                .product(name: "MenuBarExtraAccess", package: "MenuBarExtraAccess"),
                .product(name: "Subprocess", package: "swift-subprocess"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "Sparkle", package: "Sparkle"),
                .product(name: "PeekabooBridge", package: "Peekaboo"),
                .product(name: "PeekabooAutomationKit", package: "Peekaboo"),
            ],
            exclude: [
                "Resources/Info.plist",
            ],
            resources: [
                .copy("Resources/Sage.icns"),
                .copy("Resources/DeviceModels"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "SageMacCLI",
            dependencies: [
                "SageDiscovery",
                .product(name: "SageKit", package: "SageKit"),
                .product(name: "SageProtocol", package: "SageKit"),
            ],
            path: "Sources/SageMacCLI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "SageIPCTests",
            dependencies: [
                "SageIPC",
                "Sage",
                "SageDiscovery",
                .product(name: "SageProtocol", package: "SageKit"),
                .product(name: "SwabbleKit", package: "swabble"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])

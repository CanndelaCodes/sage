import Foundation

public enum SageCameraCommand: String, Codable, Sendable {
    case list = "camera.list"
    case snap = "camera.snap"
    case clip = "camera.clip"
}

public enum SageCameraFacing: String, Codable, Sendable {
    case back
    case front
}

public enum SageCameraImageFormat: String, Codable, Sendable {
    case jpg
    case jpeg
}

public enum SageCameraVideoFormat: String, Codable, Sendable {
    case mp4
}

public struct SageCameraSnapParams: Codable, Sendable, Equatable {
    public var facing: SageCameraFacing?
    public var maxWidth: Int?
    public var quality: Double?
    public var format: SageCameraImageFormat?
    public var deviceId: String?
    public var delayMs: Int?

    public init(
        facing: SageCameraFacing? = nil,
        maxWidth: Int? = nil,
        quality: Double? = nil,
        format: SageCameraImageFormat? = nil,
        deviceId: String? = nil,
        delayMs: Int? = nil)
    {
        self.facing = facing
        self.maxWidth = maxWidth
        self.quality = quality
        self.format = format
        self.deviceId = deviceId
        self.delayMs = delayMs
    }
}

public struct SageCameraClipParams: Codable, Sendable, Equatable {
    public var facing: SageCameraFacing?
    public var durationMs: Int?
    public var includeAudio: Bool?
    public var format: SageCameraVideoFormat?
    public var deviceId: String?

    public init(
        facing: SageCameraFacing? = nil,
        durationMs: Int? = nil,
        includeAudio: Bool? = nil,
        format: SageCameraVideoFormat? = nil,
        deviceId: String? = nil)
    {
        self.facing = facing
        self.durationMs = durationMs
        self.includeAudio = includeAudio
        self.format = format
        self.deviceId = deviceId
    }
}

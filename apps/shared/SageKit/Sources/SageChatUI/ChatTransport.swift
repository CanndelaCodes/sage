import Foundation

public enum SageChatTransportEvent: Sendable {
    case health(ok: Bool)
    case tick
    case chat(SageChatEventPayload)
    case agent(SageAgentEventPayload)
    case seqGap
}

public protocol SageChatTransport: Sendable {
    func requestHistory(sessionKey: String) async throws -> SageChatHistoryPayload
    func sendMessage(
        sessionKey: String,
        message: String,
        thinking: String,
        idempotencyKey: String,
        attachments: [SageChatAttachmentPayload]) async throws -> SageChatSendResponse

    func abortRun(sessionKey: String, runId: String) async throws
    func listSessions(limit: Int?) async throws -> SageChatSessionsListResponse

    func requestHealth(timeoutMs: Int) async throws -> Bool
    func events() -> AsyncStream<SageChatTransportEvent>

    func setActiveSessionKey(_ sessionKey: String) async throws
}

extension SageChatTransport {
    public func setActiveSessionKey(_: String) async throws {}

    public func abortRun(sessionKey _: String, runId _: String) async throws {
        throw NSError(
            domain: "SageChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "chat.abort not supported by this transport"])
    }

    public func listSessions(limit _: Int?) async throws -> SageChatSessionsListResponse {
        throw NSError(
            domain: "SageChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "sessions.list not supported by this transport"])
    }
}

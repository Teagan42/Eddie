import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { ChatSessionStreamRendererService } from "../../../src/chat-sessions/chat-session-stream-renderer.service";
import { InMemoryChatSessionsRepository } from "../../../src/chat-sessions/chat-sessions.repository";
import type { ChatSessionEventsService } from "../../../src/chat-sessions/chat-session-events.service";

describe("ChatSessionStreamRendererService", () => {
    let service: ChatSessionsService;
    let renderer: ChatSessionStreamRendererService;
    let sessionId: string;
    let events: ChatSessionEventsService;

    beforeEach(() => {
        service = new ChatSessionsService(new InMemoryChatSessionsRepository());
        events = {
            emitPartial: vi.fn(),
            emitToolCall: vi.fn(),
            emitToolResult: vi.fn(),
        } as unknown as ChatSessionEventsService;
        renderer = new ChatSessionStreamRendererService(service, events);
        sessionId = service.createSession({ title: "Stream" }).id;
    });

    it("creates and updates assistant messages from deltas", async () => {
        const capture = await renderer.capture(sessionId, async () => {
            renderer.render({ type: "delta", text: "Hello" });
            renderer.render({ type: "delta", text: " world" });
            renderer.render({ type: "end" });
            return "ok";
        });

        expect(capture.error).toBeUndefined();
        expect(capture.result).toBe("ok");
        expect(capture.state.messageId).toBeDefined();

        const messages = service.listMessages(sessionId);
        expect(messages).toHaveLength(1);
        expect(messages[ 0 ]?.role).toBe("assistant");
        expect(messages[ 0 ]?.content).toBe("Hello world");
    });

    it("does not create messages when no deltas are rendered", async () => {
        const capture = await renderer.capture(sessionId, async () => {
            renderer.render({ type: "notification", payload: "noop" });
            renderer.render({ type: "end" });
        });

        expect(capture.error).toBeUndefined();
        expect(capture.state.messageId).toBeUndefined();
        expect(service.listMessages(sessionId)).toEqual([]);
    });

    it("preserves streamed content when the engine run fails", async () => {
        const capture = await renderer.capture(sessionId, async () => {
            renderer.render({ type: "delta", text: "Partial" });
            throw new Error("boom");
        });

        expect(capture.error).toBeInstanceOf(Error);
        expect(capture.state.messageId).toBeDefined();
        const messages = service.listMessages(sessionId);
        expect(messages[ 0 ]?.content).toBe("Partial");
    });
    it("emits partial updates for assistant responses", async () => {
        const partialEvents: string[] = [];
        const emitPartialMock = events.emitPartial as unknown as ReturnType<typeof vi.fn>;
        emitPartialMock.mockImplementation((message: { content: string; }) =>
            partialEvents.push(message.content)
        );

        await renderer.capture(sessionId, async () => {
            renderer.render({ type: "delta", text: "Hello" });
            renderer.render({ type: "delta", text: " world" });
        });

        expect(partialEvents).toEqual([ "Hello", "Hello world" ]);
    });

    it("emits tool events via ToolsGateway", async () => {
        const toolEvents = {
            emitPartial: vi.fn(),
            emitToolCall: vi.fn(),
            emitToolResult: vi.fn(),
        } as unknown as ChatSessionEventsService;

        const rendererWithTools = new ChatSessionStreamRendererService(service, toolEvents);

        await rendererWithTools.capture(sessionId, async () => {
            rendererWithTools.render({ type: "tool_call", name: "echo", arguments: { text: "hi" }, id: "t1" } as any);
            rendererWithTools.render({ type: "tool_result", name: "echo", result: { schema: "s1", content: "ok" }, id: "t1" } as any);
        });

        expect((toolEvents.emitToolCall as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
        expect((toolEvents.emitToolResult as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
});

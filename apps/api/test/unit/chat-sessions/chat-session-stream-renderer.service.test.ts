import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { ChatSessionStreamRendererService } from "../../../src/chat-sessions/chat-session-stream-renderer.service";
import type { ChatMessagesGateway } from "../../../src/chat-sessions/chat-messages.gateway";
import { InMemoryChatSessionsRepository } from "../../../src/chat-sessions/chat-sessions.repository";

const flushMicrotasks = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("ChatSessionStreamRendererService", () => {
    let service: ChatSessionsService;
    let renderer: ChatSessionStreamRendererService;
    let sessionId: string;
    let gateway: ChatMessagesGateway;

    beforeEach(async () => {
        service = new ChatSessionsService(new InMemoryChatSessionsRepository());
        gateway = { emitPartial: vi.fn() } as unknown as ChatMessagesGateway;
        renderer = new ChatSessionStreamRendererService(service, gateway);
        sessionId = (await service.createSession({ title: "Stream" })).id;
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

        await flushMicrotasks();

        const messages = await service.listMessages(sessionId);
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
        await flushMicrotasks();
        await expect(service.listMessages(sessionId)).resolves.toEqual([]);
    });

    it("preserves streamed content when the engine run fails", async () => {
        const capture = await renderer.capture(sessionId, async () => {
            renderer.render({ type: "delta", text: "Partial" });
            throw new Error("boom");
        });

        expect(capture.error).toBeInstanceOf(Error);
        expect(capture.state.messageId).toBeDefined();
        await flushMicrotasks();
        const messages = await service.listMessages(sessionId);
        expect(messages[ 0 ]?.content).toBe("Partial");
    });
    it("emits partial updates for assistant responses", async () => {
        const events: string[] = [];
        const emitPartialMock = gateway.emitPartial as unknown as ReturnType<typeof vi.fn>;
        emitPartialMock.mockImplementation((message: { content: string; }) =>
            events.push(message.content)
        );

        await renderer.capture(sessionId, async () => {
            renderer.render({ type: "delta", text: "Hello" });
            renderer.render({ type: "delta", text: " world" });
        });

        await flushMicrotasks();
        expect(events).toEqual([ "Hello", "Hello world" ]);
    });

    it("emits tool events via ToolsGateway", async () => {
        const toolsGateway = {
            emitToolCall: vi.fn(),
            emitToolResult: vi.fn(),
        } as unknown as { emitToolCall: (p: unknown) => void; emitToolResult: (p: unknown) => void; };

        const rendererWithTools = new ChatSessionStreamRendererService(service, gateway, toolsGateway as any);

        await rendererWithTools.capture(sessionId, async () => {
            rendererWithTools.render({ type: "tool_call", name: "echo", arguments: { text: "hi" }, id: "t1" } as any);
            rendererWithTools.render({ type: "tool_result", name: "echo", result: { schema: "s1", content: "ok" }, id: "t1" } as any);
        });

        await flushMicrotasks();
        expect((toolsGateway.emitToolCall as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
        expect((toolsGateway.emitToolResult as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
    });
});

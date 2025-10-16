# @eddie/api-client

## Purpose

The API client bundles the generated REST bindings for the Eddie control plane and a thin
realtime helper for websocket updates. It lets UIs and automation scripts talk to the
NestJS API without hand rolling fetch requests, while keeping the realtime protocol
wrapped behind a small channel interface.

## Installation

```bash
npm install @eddie/api-client
```

The package ships as an ESM module. If you regenerate the OpenAPI bindings run the
`npm run generate --workspace @eddie/api-client` script to refresh `src/generated/`.

## API Reference

### REST client

The generated services expose typed methods that map 1:1 to the HTTP endpoints. Common
entry points include:

- `ChatSessionsService` – create, list, update, and archive chat sessions.
- `TracesService` – stream trace frames and retrieve execution metadata.
- `LogsService` – inspect orchestrator logs by session.
- `ConfigService` – fetch, preview, and update runtime configuration files.

Before invoking any service configure the base URL and authentication headers through the
shared `OpenAPI` singleton:

```ts
import { OpenAPI, ChatSessionsService } from "@eddie/api-client";

OpenAPI.BASE = "https://api.your-eddie-cloud.example";
OpenAPI.TOKEN = "eddie_xxx";

const sessions = await ChatSessionsService.chatSessionsControllerFindAll();
```

The DTOs exported from `@eddie/api-client` mirror the backend schema. Types like
`ChatSessionDto`, `RuntimeConfigDto`, and `EddieConfigDto` are safe to re-use in your own
application state.

### Realtime channel

`createRealtimeChannel(baseUrl, namespace, apiKey)` opens a websocket connection and
normalises messages into `{ event, data }` payloads. It provides:

- `on(event, handler)` – subscribe to namespaced events and receive parsed JSON payloads.
- `emit(event, payload)` – send JSON encoded messages back to the server.
- `updateAuth(apiKey)` – refresh the API key without recreating the socket.
- `close()` – stop reconnect attempts and release listeners.

The helper automatically upgrades `http`/`https` base URLs to `ws`/`wss`, retries with a
backoff when the server disconnects, and queues outbound messages until the socket opens.

## Usage Examples

### Querying chat sessions

```ts
import { OpenAPI, ChatSessionsService } from "@eddie/api-client";

OpenAPI.BASE = "http://localhost:3333";
OpenAPI.TOKEN = process.env.EDDIE_API_KEY;

const created = await ChatSessionsService.chatSessionsControllerCreate({
  name: "Debug build", // CreateChatSessionDto properties stay fully typed
});

const messages = await ChatSessionsService.chatMessagesControllerFindAll(created.id);
```

### Subscribing to realtime events

```ts
import { createRealtimeChannel } from "@eddie/api-client";

const channel = createRealtimeChannel("http://localhost:3333", "/events", process.env.EDDIE_API_KEY ?? null);

const stop = channel.on("chat.message", (message) => {
  console.log("message update", message);
});

channel.emit("chat.message.create", { sessionId: "abc123", content: "Hello" });

// Later when authentication rotates
channel.updateAuth("eddie_new_key");

// Clean up
stop();
channel.close();
```

## Testing

Run the Vitest suite before publishing changes to confirm both generated bindings and the
realtime helper stay in sync:

```bash
npm run test --workspace @eddie/api-client
```

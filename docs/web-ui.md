# Eddie Web UI

The Eddie Web UI provides a control plane for orchestrating chat sessions, traces, logs, and runtime configuration that are exposed by the NestJS API. It relies on the generated API client for HTTP and WebSocket access, so the backend and the UI need to share consistent configuration.

## Prerequisites

- Node.js 20 or newer (the same requirement as the CLI and API).
- Project dependencies installed via `npm install` at the repository root.
- A populated `eddie.config.(json|yaml)` file so the API can boot with the right provider credentials and context options.

## Configure the API backend

### Base configuration

The API reads its settings from the `api` block in the Eddie config. By default it binds to `0.0.0.0:3000`, enables caching, and disables authentication, but you can override any of those fields in your config file.【F:packages/config/src/defaults.ts†L13-L47】 The server also respects the `HOST` and `PORT` environment variables when launching, so make sure the final host/port pair matches the values you expose to the Web UI.【F:apps/api/src/main.ts†L22-L47】

### Authentication keys

If you turn on API key enforcement (`api.auth.enabled: true`), supply at least one key either in the config (`api.auth.apiKeys`), via the `EDDIE_API_KEY`/`EDDIE_API_KEYS` environment variables, or by wiring context variables named `apiKeys`/`API_KEYS`. The guard merges all of these sources and accepts the key from the `x-api-key` header, a `Bearer` token, or an `apiKey` query parameter, which is exactly how the Web UI forwards credentials.【F:apps/api/src/auth/api-key.guard.ts†L35-L110】 When authentication is enabled you will need to paste the same key into the UI header so the API client can persist it in local storage.

### Runtime metadata exposed to the UI

The API bootstraps a runtime configuration service that seeds defaults for the UI, including the API base URL, WebSocket URL, and feature toggles for traces, logs, and chat panels.【F:apps/api/src/runtime-config/runtime-config.service.ts†L9-L31】 These values are sent over both HTTP and WebSocket so the UI can reflect live updates.

## Environment variables for the Web UI

The Vite app reads configuration from environment variables prefixed with `NEXT_PUBLIC_` or `VITE_` at build time.【F:apps/web/vite.config.ts†L1-L18】 The runtime helper resolves the following settings, all of which are optional but recommended when the UI runs on a different origin than the API.【F:apps/web/src/config/env.ts†L1-L24】

| Variable | Purpose | Default |
| --- | --- | --- |
| `VITE_API_URL` / `NEXT_PUBLIC_API_URL` | Base URL for REST calls to the Eddie API. | `/api` |
| `VITE_WEBSOCKET_URL` / `NEXT_PUBLIC_WEBSOCKET_URL` | Base URL for Socket.IO namespaces (`/chat-sessions`, `/traces`, `/logs`, `/config`). | Derived by replacing `http` with `ws` in the API URL |
| `VITE_ENABLE_TELEMETRY` / `NEXT_PUBLIC_ENABLE_TELEMETRY` | Enables client-side telemetry features. | `false` |

Create a `.env.local` file inside `apps/web/` or export the variables before starting Vite. A typical local setup with the API listening on port 3000 looks like this:

```bash
VITE_API_URL=http://localhost:3000
VITE_WEBSOCKET_URL=ws://localhost:3000
VITE_ENABLE_TELEMETRY=false
```

## Running locally

1. Start the API with hot reloading. This compiles the Nest application and keeps the generated OpenAPI schema in sync.

   ```bash
   npm run dev:api
   ```

2. In another terminal, launch the Web UI development server. The predev hook automatically rebuilds the API client package so the React app uses the latest schema.【F:package.json†L17-L27】【F:apps/web/package.json†L7-L26】

   ```bash
   npm run web:dev
   ```

   The Vite dev server proxies any request beginning with `/api`—including Socket.IO namespaces—to the NestJS API on port 3000 so the browser can keep using relative URLs during development. Set `VITE_DEV_API_TARGET` before running the command if your API listens on a different host or port.【F:apps/web/vite.config.ts†L4-L24】

3. Open `http://localhost:5173` in your browser. If API keys are enabled, use the header’s **Add API Key** button to store a key; it will be sent on every HTTP request and WebSocket connection.

To create an optimized production build, run `npm run web:build`. Vite will emit static assets under `apps/web/dist`, which you can serve behind the API or any other static host.【F:apps/web/package.json†L7-L15】

## What the UI expects from the API

The generated API client calls REST endpoints for chat sessions, traces, logs, runtime configuration, user preferences, and orchestrator metadata, and subscribes to the `/chat-sessions`, `/traces`, `/logs`, and `/config` Socket.IO namespaces for realtime updates.【F:packages/api-client/src/index.ts†L1-L307】 Ensure those modules stay enabled in the API module graph so that UI interactions succeed without 404s or socket connection failures.【F:apps/api/src/api.module.ts†L1-L61】

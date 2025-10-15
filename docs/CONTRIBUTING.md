# Contributing to Eddie

Welcome to Eddie's contributor guide. This playbook walks you through preparing your machine, cloning the repository, and running every surface (CLI, API, and Web) with confidence.

## Prerequisites

Before opening a pull request, make sure your workstation satisfies the following requirements:

- **Node.js 20.x LTS** – the repo targets Node.js 20 as defined in `package.json`. Verify with `node --version` and align your version manager (nvm, fnm, volta) accordingly.
- **npm 10+** – bundled with Node.js 20; run `npm --version` to confirm.
- **Git** – needed for cloning and maintaining feature branches.
- **System dependencies** – install build tooling required by native packages: `python3`, `make`, `gcc`/`clang`, and OpenSSL headers. On Debian/Ubuntu this is `sudo apt install build-essential python3 openssl libssl-dev`. macOS users should install Xcode Command Line Tools via `xcode-select --install`.
- **Optional services** – Docker Desktop or a local PostgreSQL/MySQL/MariaDB instance if you plan to exercise the API against an external database rather than SQLite.

## Initial Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/<your-account>/Eddie.git
   cd Eddie
   ```
2. **Select the Node.js version**
   ```bash
   nvm use 20
   # or set the version in volta/fnm/asdf
   ```
3. **Install workspace dependencies**
   ```bash
   npm install
   ```
4. **Bootstrap the build outputs**
   ```bash
   npm run build
   ```
5. **Run linting and tests to confirm your environment**
   ```bash
   npm run lint
   npm test
   ```
6. **Create a feature branch** following the repository convention: `git checkout -b codex/<description>`.

## Running Surfaces

Each surface exposes npm scripts for development (watch/hot reload) and production-like execution.

### CLI
- Start the CLI in watch mode while developing: `npm run dev:cli`.
- Build and run the compiled CLI entry point: `npm run start:cli`.

### API
- Launch the NestJS API with live reload: `npm run dev:api`.
- Run the API in production mode using the compiled output: `npm run start:api`.
- The API reads configuration from `apps/api/src/runtime-config`. Supply environment variables (e.g., `API_PORT`, `API_PERSISTENCE_DRIVER`) or a `config.yaml` file as documented in `docs/api.md`.

### Web UI
- Develop with hot module reload using Vite: `npm run web:dev`.
- Serve the production build locally: `npm run web:start`.
- Build static assets for deployment: `npm run web:build`.

## Database Setup for API Development

The API supports SQLite, PostgreSQL, MySQL, and MariaDB via Knex. For quick iteration the default SQLite file store requires no additional services. To exercise relational databases:

1. **Pick a driver** (`postgres`, `mysql`, or `mariadb`) and create a local database named `eddie`.
2. **Export connection variables**, for example for PostgreSQL:
   ```bash
   export API_PERSISTENCE_DRIVER=postgres
   export PGHOST=127.0.0.1
   export PGPORT=5432
   export PGDATABASE=eddie
   export PGUSER=eddie
   export PGPASSWORD=changeme
   ```
3. **Start the API** (`npm run dev:api` or `npm run start:api`). The bootstrap process runs pending migrations from `apps/api/migrations` automatically using `knex.migrate.latest`.
4. **Resetting the schema** – use `rm -f data/chat-sessions.sqlite` for SQLite or drop/recreate the relational database when you need a clean slate.

## Debugging Configuration

### Visual Studio Code

1. Install the recommended extensions (ESLint, Vitest, and NestJS files).
2. Create `.vscode/launch.json` with compound configurations to attach to each surface. Example snippets:
   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "type": "node",
         "request": "launch",
         "name": "API: dev",
         "runtimeExecutable": "npm",
         "runtimeArgs": ["run", "dev:api"],
         "console": "integratedTerminal",
         "cwd": "${workspaceFolder}"
       },
       {
         "type": "node",
         "request": "launch",
         "name": "CLI: dev",
         "runtimeExecutable": "npm",
         "runtimeArgs": ["run", "dev:cli"],
         "cwd": "${workspaceFolder}",
         "console": "integratedTerminal"
       }
     ]
   }
   ```
3. Use the built-in JavaScript debugger to set breakpoints inside `apps/api/src` or `apps/cli/src`. For Vitest debugging, add a configuration that runs `npx vitest --inspect-brk run <test-file>`.

### Other IDEs

- **WebStorm / JetBrains IDEs** – create Node.js run configurations pointing at the same npm scripts (`dev:api`, `dev:cli`, `web:dev`). Enable the "Allow parallel run" option to watch multiple surfaces simultaneously.
- **Neovim / VS Code Remote** – run `npm run dev:*` scripts inside terminals and attach debuggers using `node --inspect` flags if you prefer CLI tooling.

## Troubleshooting

Common issues include:

| Scenario | Resolution |
| --- | --- |
| **`node-gyp` build failures** | Ensure Python 3, `make`, and a C/C++ toolchain are installed. On Windows install the "windows-build-tools" package or use WSL2. |
| **`npm install` stalls or runs out of memory** | Clear caches with `npm cache clean --force` and retry. Close other memory-intensive apps or increase Docker/WSL memory limits. |
| **API fails to connect to the database** | Confirm environment variables, ensure the service is running, and run migrations manually with `npm run start:api` to observe logs. |
| **Web UI cannot reach the API** | Set `VITE_API_URL` before running `npm run web:dev` and confirm CORS configuration in `apps/api/src/main.ts`. |
| **Vitest cannot find files** | Run `npm run build` to refresh generated artifacts and ensure TypeScript paths are in sync with `tsconfig.base.json`. |

## Hot Reload and Watch Modes

- Use `npm run dev:api` for NestJS live reload powered by `ts-node-dev`. The process restarts on changes to `apps/api/src`.
- Run `npm run dev:cli` to watch CLI source files and rebuild automatically.
- Start `npm run web:dev` to enable Vite's hot module replacement for the web UI.
- Combine surfaces with `npm run dev` to start the API and Web dev servers together using `concurrently`.
- For targeted test feedback, execute `npx vitest --watch` or `npm run test -- --watch` to enter watch mode across packages.

Happy hacking! Refer to the README and docs in `docs/` for deeper dives into specific surfaces and architectural decisions.

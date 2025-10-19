# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base
WORKDIR /workspace
ENV NODE_ENV=development

COPY package.json package-lock.json ./
COPY nest-cli.json tsconfig.json tsconfig.base.json ./
COPY apps ./apps
COPY platform ./platform
COPY scripts ./scripts
COPY docs ./docs
COPY examples ./examples
COPY eslint.config.cjs ./
COPY README.md ./
RUN npm ci

FROM base AS development
ENV NODE_ENV=development
EXPOSE 3000 9229
CMD ["npm", "run", "dev:api"]

FROM node:20-bookworm-slim AS production
WORKDIR /workspace
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=base /workspace/apps ./apps
COPY --from=base /workspace/platform ./platform
COPY --from=base /workspace/scripts ./scripts
COPY --from=base /workspace/docs ./docs
COPY --from=base /workspace/examples ./examples
COPY --from=base /workspace/nest-cli.json ./nest-cli.json
COPY --from=base /workspace/tsconfig.json ./tsconfig.json
COPY --from=base /workspace/tsconfig.base.json ./tsconfig.base.json
COPY --from=base /workspace/eslint.config.cjs ./eslint.config.cjs
COPY --from=base /workspace/README.md ./README.md

RUN npm run build --workspace @eddie/api --if-present
EXPOSE 3000
CMD ["npm", "run", "start:api"]

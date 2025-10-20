# Apps Workspace Guide

The `apps` directory contains runnable surfaces for Eddie, including the NestJS API, CLI, and web UI. Use these notes when
coordinating changes that span multiple applications.

## Running the Web UI

Run both `@eddie/api` and `@eddie/web` to obtain a fully functional web interface for demos, screenshots, or manual QA. You can
launch them together with `npm run dev`, or start them individually via `npm run api:dev` and `npm run web:dev`.

import { beforeAll, describe, expect, it } from 'vitest';
import { read } from './helpers/fs';

describe('docker runtime configuration', () => {
  let readme: string;
  let compose: string;
  let dockerfile: string;

  beforeAll(() => {
    readme = read('README.md');
    compose = read('docker-compose.yml');
    dockerfile = read('Dockerfile');
  });

  it('documents docker usage in the README', () => {
    expect(readme).toMatch(/## Docker setup/);
    expect(readme).toMatch(/docker compose up -d/);
    expect(readme).toMatch(/docker compose logs -f api/);
  });

  it('defines a docker-compose service for the API', () => {
    expect(compose).toMatch(/services:\s*\n\s*api:/);
    expect(compose).toMatch(/target:\s*development/);
    expect(compose).toMatch(/command:\s*npm run api:dev/);
  });

  it('provides a multi-stage Dockerfile for development and production', () => {
    expect(dockerfile).toMatch(/FROM node:20/);
    expect(dockerfile).toMatch(/AS development/);
    expect(dockerfile).toMatch(/AS production/);
  });
});
